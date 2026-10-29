import { validDate, validMonth, today } from './계산.js';
import { PRODUCT_KINDS } from './화장대순서.js';
import { recommendPhoto } from './사진추천.js';
import { withParticle } from './조사.js';

export const BUDGET_DEFAULTS = Object.freeze({
  cleanser:{min:10000,max:20000,estimate:15000,weeks:8,alertWeek:6},
  toner:{min:15000,max:25000,estimate:20000,weeks:10,alertWeek:8},
  serum:{min:20000,max:35000,estimate:25000,weeks:8,alertWeek:6},
  cream:{min:20000,max:35000,estimate:25000,weeks:8,alertWeek:6},
  sunscreen:{min:15000,max:25000,estimate:20000,weeks:6,alertWeek:4},
  eyecream:{min:20000,max:40000,estimate:30000,weeks:10,alertWeek:8},
});

const essentials=['sunscreen','cream','cleanser'];
const focusKinds={moisture:'cream',oiliness:'cleanser',pore:'cleanser',redness:'cream',acne:'cleanser',age_spot:'sunscreen',radiance:'sunscreen',wrinkle:'cream',firmness:'cream',dark_circle_v2:'eyecream',eye_bag:'eyecream',tear_trough:'eyecream',texture:'toner',skin_type:'cream'};
const concernKinds={dryness:'cream',oil:'cleanser',pore:'cleanser',redness:'cream',acne:'cleanser',pigment:'sunscreen',dullness:'sunscreen',aging:'cream',eye:'eyecream',texture:'toner'};
const dayNumber=date=>Date.parse(`${date}T12:00:00Z`)/86400000;
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(value);
const validKind=value=>Object.hasOwn(PRODUCT_KINDS,value);
const validAmount=value=>Number.isSafeInteger(value)&&value>0&&value<=100000000;

export function validateBudgetCare(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('예산 기록 형식을 확인해 주세요.');
  const cycles=value.cycles??[],purchases=value.purchases??[],notified=value.notified??[];
  if(!Array.isArray(cycles)||!Array.isArray(purchases)||!Array.isArray(notified)||cycles.length>2000||purchases.length>2000||notified.length>2000)throw Error('예산 기록 수를 확인해 주세요.');
  for(const entry of cycles)if(!entry||!validId(entry.productId)||!validKind(entry.kind)||!Number.isInteger(entry.days)||entry.days<1||entry.days>3650||!validDate(entry.finishedAt))throw Error('제품 교체 주기 기록을 확인해 주세요.');
  for(const entry of purchases)if(!entry||!validId(entry.id)||!validKind(entry.kind)||!validAmount(entry.price)||!validDate(entry.date))throw Error('구매 가격 기록을 확인해 주세요.');
  for(const entry of notified)if(!validId(entry))throw Error('제품 알림 기록을 확인해 주세요.');
  if(new Set(cycles.map(entry=>`${entry.productId}:${entry.finishedAt}`)).size!==cycles.length||new Set(purchases.map(entry=>entry.id)).size!==purchases.length||new Set(notified).size!==notified.length)throw Error('중복된 예산 기록이 있어요.');
  return {cycles:cycles.map(entry=>({productId:entry.productId,kind:entry.kind,days:entry.days,finishedAt:entry.finishedAt})),purchases:purchases.map(entry=>({id:entry.id,kind:entry.kind,price:entry.price,date:entry.date})),notified:[...notified]};
}

export function replacementDays(data,kind) {
  const samples=(data.budgetCare?.cycles??[]).filter(entry=>entry.kind===kind);
  return samples.length?Math.round(samples.reduce((sum,entry)=>sum+entry.days,0)/samples.length):BUDGET_DEFAULTS[kind]?.weeks*7??null;
}

export function updateProductStatus(data,id,usageState,asOf=today()) {
  if(!['using','low','finished'].includes(usageState)||!validDate(asOf)||asOf>today())throw Error('제품 상태를 확인해 주세요.');
  const product=data.inventory.find(item=>item.id===id);
  if(!product)throw Error('제품을 찾을 수 없어요.');
  const opened=product.opened||product.registeredAt;
  if(usageState==='finished'&&opened&&(!validDate(opened)||opened>asOf))throw Error('개봉일을 확인해 주세요.');
  const changed=data.inventory.map(item=>item.id!==id?item:{...item,usageState,status:usageState==='finished'?'finished':'available',remaining:usageState==='finished'?0:item.remaining===0?100:item.remaining,finishedAt:usageState==='finished'?asOf:''});
  const budgetCare=validateBudgetCare(data.budgetCare);
  if(usageState==='finished'&&validDate(opened)&&product.usageState!=='finished'&&product.status!=='finished'&&dayNumber(asOf)-dayNumber(opened)<=3650) {
    const days=Math.max(1,dayNumber(asOf)-dayNumber(opened));
    const sample={productId:id,kind:product.kind,days,finishedAt:asOf};
    budgetCare.cycles=[...budgetCare.cycles.filter(entry=>entry.productId!==id||entry.finishedAt!==asOf),sample];
  }
  return {...data,inventory:changed,budgetCare};
}

export function addPurchasePrice(data,kind,price,asOf=today(),id=crypto.randomUUID()) {
  if(!validKind(kind)||!validAmount(price)||!validDate(asOf)||asOf>today()||!validId(id))throw Error('제품 종류와 구매 가격을 확인해 주세요.');
  const budgetCare=validateBudgetCare(data.budgetCare);
  return {...data,budgetCare:{...budgetCare,purchases:[...budgetCare.purchases,{id,kind,price,date:asOf}]}};
}

export function renewProduct(data,id,price=null,asOf=today()) {
  const product=data.inventory.find(item=>item.id===id);
  if(!product||product.status!=='finished'||!validDate(asOf)||asOf>today())throw Error('다 쓴 제품을 다시 확인해 주세요.');
  const inventory=data.inventory.map(item=>item.id===id?{...item,status:'available',usageState:'using',remaining:100,opened:asOf,finishedAt:'',expires:''}:item);
  const budgetCare=validateBudgetCare(data.budgetCare);
  const refreshed={...data,inventory,budgetCare:{...budgetCare,notified:budgetCare.notified.filter(entry=>entry!==id)}};
  return price===null?refreshed:addPurchasePrice(refreshed,product.kind,price,asOf);
}

export function expectedPrice(data,kind) {
  const recent=[...(data.budgetCare?.purchases??[])].filter(entry=>entry.kind===kind).sort((first,second)=>second.date.localeCompare(first.date)||second.id.localeCompare(first.id))[0];
  return recent?.price??BUDGET_DEFAULTS[kind]?.estimate??null;
}

export function priceRange(data,kind) {
  const personal=(data.budgetCare?.purchases??[]).some(entry=>entry.kind===kind);
  const {min,max}=BUDGET_DEFAULTS[kind]??{};
  const price=expectedPrice(data,kind);
  if(price===null)return null;
  const lower=personal?Math.max(0,Math.floor((price-5000)/5000)*5000):min;
  const upper=personal?Math.ceil((price+5000)/5000)*5000:max;
  const short=value=>Number.isInteger(value/10000)?`${value/10000}만`:`${(value/10000).toFixed(1)}만`;
  return `보통 ${short(lower)}~${short(upper)}원대`;
}

export function needsReplacement(product,data,asOf=today()) {
  const config=BUDGET_DEFAULTS[product.kind];
  if(!config||product.category!=='cosmetic'||product.status==='finished'||product.expires&&product.expires<asOf)return false;
  if(product.usageState==='low'||product.remaining<=15)return true;
  const opened=product.opened||product.registeredAt;
  if(!validDate(opened)||opened>asOf)return false;
  const leadDays=(config.weeks-config.alertWeek)*7;
  return dayNumber(asOf)-dayNumber(opened)>=replacementDays(data,product.kind)-leadDays;
}

export function nextBudgetAlert(data,asOf=today()) {
  return essentials.concat(Object.keys(BUDGET_DEFAULTS).filter(kind=>!essentials.includes(kind)))
    .flatMap(kind=>data.inventory.filter(item=>item.kind===kind))
    .find(item=>needsReplacement(item,data,asOf)&&!(data.budgetCare?.notified??[]).includes(item.id))??null;
}

export function markBudgetAlert(data,id) {
  const budgetCare=validateBudgetCare(data.budgetCare);
  if(!data.inventory.some(item=>item.id===id)||budgetCare.notified.includes(id))return data;
  return {...data,budgetCare:{...budgetCare,notified:[...budgetCare.notified,id]}};
}

export function monthlyBudgetPlan(data,month,asOf=today()) {
  if(!validMonth(month))throw Error('예산 월을 확인해 주세요.');
  const budget=data.budgets[month];
  if(budget===undefined)return null;
  const candidates=[];
  const add=(kind,reason)=>{if(BUDGET_DEFAULTS[kind]&&!candidates.some(item=>item.kind===kind))candidates.push({kind,reason});};
  for(const kind of essentials) {
    const items=data.inventory.filter(item=>item.kind===kind&&item.category==='cosmetic');
    if(items.some(item=>needsReplacement(item,data,asOf))||items.some(item=>item.status==='finished')&&!items.some(item=>item.status==='available'&&item.remaining>0))add(kind,'곧 필요해요');
  }
  const focus=recommendPhoto(data.skinCare,null,{asOf})?.focused??[];
  const concerns=data.skinCare?.profile?.concerns??[];
  const selected=focus.length?focus.map(type=>focusKinds[type]):concerns.map(type=>concernKinds[type]);
  for(const kind of selected.slice(0,2))if(kind&&!data.inventory.some(item=>item.kind===kind&&item.status==='available'&&item.remaining>0&&item.comfort!=='uncomfortable'))add(kind,'집중 항목');
  for(const kind of essentials)if(!data.inventory.some(item=>item.kind===kind&&item.status==='available'&&item.remaining>0&&item.comfort!=='uncomfortable'))add(kind,'기본 단계');
  let remaining=budget,deferring=false;
  const items=candidates.map(item=>{const estimate=expectedPrice(data,item.kind),included=!deferring&&estimate<=remaining;if(included)remaining-=estimate;else deferring=true;return {...item,estimate,range:priceRange(data,item.kind),status:included?'이번 달':'다음 달로 미뤄요'};});
  const planned=items.filter(item=>item.status==='이번 달');
  const deferred=items.filter(item=>item.status!=='이번 달');
  const lines=[];
  if(!items.length)lines.push('이번 달은 안 사도 돼요. 가지고 있는 제품을 먼저 써요.');
  else if(planned.length)lines.push(`${PRODUCT_KINDS[planned[0].kind]}부터 예산 안에서 챙겨볼까요?`);
  else lines.push('예산 안에 들어오는 필수품이 없어요. 이번 달은 구매를 미뤄요.');
  if(deferred.length)lines.push(`${withParticle(PRODUCT_KINDS[deferred[0].kind],'은/는')} 다음 달로 미뤄요.`);
  if(remaining>0)lines.push('남은 예산은 아껴둬요.');
  else if(!deferred.length)lines.push('필요한 만큼만 챙겨요.');
  return {month,budget,remaining,items,lines};
}
