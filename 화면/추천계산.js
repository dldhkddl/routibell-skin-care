import { summary, currency, today, validateData, validateRecord } from './계산.js';
import { PRODUCTS, productById } from './제품목록.js';
import { availableInventory, plannedPurchases } from './계획계산.js';
import { careAllowance, KINDS } from './피부계산.js';
export const PRIORITIES={price:'가격 부담이 적은 것',unit:'용량당 가격이 낮은 것',small:'작은 용량부터',experience:'내 누적 만족도 우선'};
export const STATUSES={pending:'고민 중',held:'보류 중',using:'기존 제품 사용',abandoned:'구매 포기',purchased:'구매 기록 완료'};
export function recommend(data,w,asOf=today()) {
  const s=summary(data,w.month);
  const plan=data.plans?.[w.month];
  const available=s.remaining===null?null:Math.max(0,s.remaining-(plan?.reserve??0));
  const categoryRemaining=plan?Math.max(0,plan.allocations.cosmetic-s.records.filter(record=>record.category==='cosmetic').reduce((sum,record)=>sum+record.amount,0)):null;
  const skinLimit=data.skinCare?.profile?careAllowance(data,data.skinCare.profile,`${w.month}-01`).cap:null;
  const cap=Math.max(0,Math.min(w.limit,available??w.limit,categoryRemaining??w.limit,skinLimit??w.limit));
  const kind=w.kind??'cream';
  const inventory=availableInventory(data,asOf).filter(item=>item.category==='cosmetic'&&item.kind===kind);
  const products=PRODUCTS.filter(product=>product.kind===kind);
  const outdated=product=>{const age=(Date.parse(asOf)-Date.parse(product.checkedAt))/86400000;return !Number.isFinite(age)||age<0||age>30;};
  const stale=products.some(outdated);
  const reasons=[];
  if(data.skinCare?.profile?.budget !== null && data.skinCare?.profile?.budget !== undefined)reasons.push('피부 계획에 설정한 월 구매 상한에서도 피부관리·화장품 지출을 빼고 비교했어요. 피부 적합성을 보장하는 추천은 아니에요.');
  if(w.owned||inventory.length)reasons.push(`사용할 수 있는 ${KINDS[kind]} 제품이 남아 있어요. 기존 제품을 먼저 쓰고 결정해도 좋아요.`);
  if(plan)reasons.push(`남겨둘 예산 ${currency(plan.reserve)}과 화장품 분야 잔여 한도 ${currency(categoryRemaining)}을 반영했어요.`);
  const combined=plannedPurchases(data,w.month);
  if(available!==null&&combined>available)reasons.push(`이번 달 고민 한도 합계 ${currency(combined)}이 구매 가능한 예산을 넘어요. 모두 구매하기 전에 우선순위를 정하세요.`);
  if(s.remaining===null)reasons.push('월 예산이 없어 이번 구매 한도만 비교했어요. 월 예산을 정하면 남은 금액도 함께 반영해요.');
  else if(s.remaining<=0)reasons.push('이번 달 남은 예산이 없어요. 추가 구매를 보류하는 선택을 먼저 생각해 보세요.');
  if(stale)reasons.push('확인일이 오래되었거나 비교 날짜와 맞지 않는 가격은 재확인이 필요해요. 해당 제품은 예산에 맞는 후보로 표시하지 않아요.');
  const unrated=s.records.filter(r=>r.category==='cosmetic'&&r.rating===null).length;
  if(unrated)reasons.push(`아직 만족도를 남기지 않은 화장품 기록이 ${unrated}개 있어요. 먼저 사용 경험을 돌아보세요.`);
  const candidates=products.map(p=>{
    const stale=outdated(p);
    const total=p.price+p.shipping;
    const previous=(data.wishes??[]).filter(x=>x.productId===p.id&&x.recordId).map(x=>data.records.find(r=>r.id===x.recordId)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))[0];
    const eligible=total<=cap&&!stale&&previous?.repurchase!==false;
    const reason=stale?'최신 가격 확인 필요':previous?.repurchase===false?'지난 기록에서 다시 선택하지 않겠다고 했어요.':total>cap?`비교 한도를 ${currency(total-cap)} 넘어 참고용으로 보여드려요.`:`예상 배송비를 포함해 비교 한도 ${currency(cap)} 안에 있어요.`;
    const linkedIds=new Set((data.wishes??[]).filter(wish=>wish.productId===p.id&&wish.recordId).map(wish=>wish.recordId));
    const ratings=data.records.filter(record=>linkedIds.has(record.id)&&record.rating!==null);
    const average=ratings.length?ratings.reduce((sum,record)=>sum+record.rating,0)/ratings.length:null;
    return {...p,total,eligible,reason,previous,average,rated:ratings.length,unit:Math.round(p.price/p.volume*10)};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(w.priority==='experience'?(b.rated>=2?b.average:0)-(a.rated>=2?a.average:0):w.priority==='unit'?a.unit-b.unit:w.priority==='small'?a.volume-b.volume:a.total-b.total)||a.id.localeCompare(b.id));
  return {cap,remaining:s.remaining,reasons,candidates,stale,inventory,hold:w.owned||inventory.length>0||!candidates.some(p=>p.eligible)};
}
export function purchaseWish(data,id,productId,amount,date) {
  const w=data.wishes.find(w=>w.id===id),p=productById(productId);
  if(!w||!p||p.kind!==(w.kind??'cream'))throw Error('구매 고민과 제품을 다시 선택해 주세요.');
  if(w.status==='purchased'||w.recordId)throw Error('이미 소비 기록으로 연결했어요. 기존 기록에서 수정해 주세요.');
  const r=validateRecord({id:`wish-${id}`,title:`${p.brand} ${p.name}`,category:'cosmetic',amount,date,rating:null,repurchase:null,memo:'구매 고민함에서 연결한 소비예요. 사용 후 만족도를 남겨주세요.'});
  if(data.records.some(x=>x.id===r.id))throw Error('이미 연결된 기록이 있어요.');
  return validateData({...data,records:[...data.records,r],wishes:data.wishes.map(x=>x.id===id?{...x,status:'purchased',productId:p.id,recordId:r.id}:x)});
}
export function removeRecord(data,id) {
  return validateData({...data,records:data.records.filter(r=>r.id!==id),wishes:(data.wishes??[]).map(w=>w.recordId===id?{...w,status:'pending',recordId:null,productId:null}:w)});
}
