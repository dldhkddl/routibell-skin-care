import { APP } from '../앱설정.js';
export const CATEGORIES = [
  { id: 'hair', name: '헤어', color: '#8D80D8', bg: '#EFECFA', icon: 'scissors' },
  { id: 'skin', name: '피부관리', color: '#E8ABAE', bg: '#FBEEEE', icon: 'drop' },
  { id: 'cosmetic', name: '화장품', color: '#81BCAF', bg: '#EAF5F1', icon: 'bottle' },
  { id: 'nail', name: '네일', color: '#E6BC74', bg: '#FAF2E4', icon: 'spark' },
  { id: 'grooming', name: '그루밍', color: '#80A5D0', bg: '#EDF3FA', icon: 'leaf' },
  { id: 'other', name: '기타', color: '#AFB2BD', bg: '#F0F1F4', icon: 'grid' },
];
import { emptyCare, validateSkinCare } from './피부계산.js';
import { validateExtensions, validateExperience } from './계획계산.js';
import { validateBudgetCare } from './예산계산.js';
export const EMPTY = () => ({ version: 6, skinCare:emptyCare(), budgets: {}, budgetCare:{cycles:[],purchases:[],notified:[]}, records: [], wishes: [], inventory: [], plans: {}, schedules: [], onboarding: false, goals:{selected:[],note:''} });
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const currency = n => new Intl.NumberFormat('ko-KR').format(n) + '원';
export const validMonth = s => typeof s === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(s);
export function validDate(s) {
  if (typeof s !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return false;
  return new Date(`${s}T12:00:00Z`).toISOString().slice(0,10) === s;
}
export function validateRecord(r) {
  if (!r || typeof r !== 'object') throw Error('기록 형식이 올바르지 않아요.');
  if (typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(r.id)) throw Error('기록 식별자를 확인해 주세요.');
  if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 60) throw Error('관리·제품 이름을 60자 이내로 적어 주세요.');
  if (!CATEGORIES.some(c => c.id === r.category)) throw Error('카테고리를 선택해 주세요.');
  if (!Number.isSafeInteger(r.amount) || r.amount < 0 || r.amount > 100000000) throw Error('금액은 0원부터 1억원까지 정수로 입력해 주세요.');
  if (!validDate(r.date) || r.date > today()) throw Error('소비 날짜를 오늘 또는 이전 날짜로 입력해 주세요.');
  if (r.rating !== null && (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5)) throw Error('만족도는 미평가 또는 1~5점으로 선택해 주세요.');
  if (![null,true,false].includes(r.repurchase)) throw Error('재구매 의향을 확인해 주세요.');
  if (typeof r.memo !== 'string' || r.memo.length > 500) throw Error('메모는 500자까지 적을 수 있어요.');
  return { id:r.id, title:r.title.trim(), category:r.category, amount:r.amount, date:r.date, rating:r.rating, repurchase:r.repurchase, memo:r.memo.trim(), ...validateExperience(r) };
}
export function validateData(data) {
  if (!data || ![1,2,3,4,5,6].includes(data.version) || !Array.isArray(data.records) || !data.budgets || Array.isArray(data.budgets) || typeof data.budgets !== 'object') throw Error(`${APP.name} 백업 파일인지 확인해 주세요.`);
  if(data.records.length > 20000) throw Error('기록은 최대 20,000개까지 가져올 수 있어요.');
  const budgets = {};
  for (const [month, n] of Object.entries(data.budgets)) {
    if (!validMonth(month) || !Number.isSafeInteger(n) || n < 0 || n > 100000000) throw Error('백업에 올바르지 않은 예산이 있어요.');
    budgets[month]=n;
  }
  const records = data.records.map(validateRecord);
  if(new Set(records.map(r=>r.id)).size !== records.length) throw Error('중복된 기록이 있는 백업이에요.');
  const sourceWishes = data.version===1 && data.wishes===undefined ? [] : data.wishes;
  if(!Array.isArray(sourceWishes)||sourceWishes.length>2000) throw Error('구매 고민 목록을 확인해 주세요. 최대 2,000개까지 보관할 수 있어요.');
  const wishes=sourceWishes.map(validateWish);
  if(new Set(wishes.map(w=>w.id)).size!==wishes.length) throw Error('중복된 구매 고민이 있어요.');
  const links=wishes.filter(w=>w.recordId!==null);
  if(new Set(links.map(w=>w.recordId)).size!==links.length || links.some(w=>!records.some(r=>r.id===w.recordId))) throw Error('구매 고민과 소비 기록의 연결을 확인해 주세요.');
  const extensions=validateExtensions(data);
  const skinCare=validateSkinCare(data.version < 4 && data.skinCare === undefined ? emptyCare() : data.skinCare, data.version < 5);
  for(const [kind,id] of Object.entries(skinCare.selection))if(id&&!extensions.inventory.some(item=>item.id===id&&item.kind===kind&&item.category==='cosmetic'))throw Error('사용 제품 선택과 보유 제품 연결을 확인해 주세요.');
  return {version:6, budgets, budgetCare:validateBudgetCare(data.budgetCare), records, wishes, ...extensions, skinCare};
}
export function validateWish(w) {
  if(!w || typeof w.id!=='string' || !/^[a-zA-Z0-9-]{1,50}$/.test(w.id)) throw Error('구매 고민 식별자가 올바르지 않아요.');
  if(typeof w.title!=='string'||!w.title.trim()||w.title.length>60) throw Error('고민 이름을 60자 이내로 적어 주세요.');
  if(!validMonth(w.month)) throw Error('고민을 기록할 월을 확인해 주세요.');
  if(!Number.isSafeInteger(w.limit)||w.limit<0||w.limit>100000000) throw Error('구매 한도를 0원부터 1억원까지 입력해 주세요.');
  if(!['price','unit','small','experience'].includes(w.priority)||![true,false].includes(w.owned)||!['pending','held','using','abandoned','purchased'].includes(w.status)) throw Error('구매 고민의 선택 항목을 확인해 주세요.');
  if(w.productId!==null && (typeof w.productId!=='string'||!/^[a-z0-9-]{1,50}$/.test(w.productId))) throw Error('제품 연결을 확인해 주세요.');
  if(w.recordId!==null && (typeof w.recordId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(w.recordId))) throw Error('소비 기록 연결을 확인해 주세요.');
  if((w.status==='purchased')!==(w.recordId!==null)) throw Error('구매 완료 상태와 소비 기록이 맞지 않아요.');
  const kind=w.kind===undefined?'cream':w.kind;
  if(!['cream','cleanser','sunscreen'].includes(kind))throw Error('비교할 제품 종류를 확인해 주세요.');
  return {id:w.id,kind,title:w.title.trim(),month:w.month,limit:w.limit,priority:w.priority,owned:w.owned,status:w.status,productId:w.productId,recordId:w.recordId};
}
export function summary(data, month) {
  const records = data.records.filter(r => r.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  const total = records.reduce((s,r)=>s+r.amount,0);
  const rated = records.filter(r=>r.rating!==null);
  const budget = data.budgets[month] ?? null;
  return { records, total, budget, remaining:budget===null?null:budget-total, rated: rated.length,
    average: rated.length ? rated.reduce((s,r)=>s+r.rating,0)/rated.length : null,
    categories:CATEGORIES.map(c=>({...c, amount: records.filter(r=>r.category===c.id).reduce((s,r)=>s+r.amount,0), count:records.filter(r=>r.category===c.id).length})) };
}
export function suggestions(data, month) {
  const s=summary(data,month), out=[];
  if(s.budget===null) out.push({icon:'wallet',title:'내가 편한 예산부터 정해볼까요?',text:'한도를 정하면 이번 달 얼마나 남았는지 볼 수 있어요. 예산을 모두 쓸 필요는 없어요.',action:'budget',label:'예산 정하기'});
  else if(s.remaining<0) out.push({icon:'wallet',title:'이번 달은 추가 구매를 잠시 쉬어가요',text:`정한 예산보다 ${currency(-s.remaining)} 더 사용했어요. 새 구매 전 꼭 필요한 지출인지 한 번 확인해 보세요.`});
  if(!s.records.length) out.push({icon:'spark',title:'좋았던 소비 하나부터 남겨보세요',text:'처음에는 정답을 추천하지 않아요. 내가 쓴 돈과 만족도를 함께 돌아보는 것부터 시작해요.',action:'add',label:'첫 소비 기록하기'});
  const unrated=s.records.filter(r=>r.rating===null);
  if(unrated.length) out.push({icon:'heart',title:`만족도를 기다리는 기록 ${unrated.length}개`,text:'미평가는 낮은 점수가 아니에요. 충분히 써본 뒤 느낌을 남겨주세요.',action:'edit',id:unrated[0].id,label:'만족도 남기기'});
  for(const c of CATEGORIES){
    const rated=s.records.filter(r=>r.category===c.id&&r.rating!==null);
    if(rated.length<2)continue;
    const avg=rated.reduce((a,r)=>a+r.rating,0)/rated.length;
    if(avg<=2.5)out.push({icon:'leaf',title:`${c.name}, 다음 구매 전에 돌아봐요`,text:`이번 달 평가 ${rated.length}건의 평균이 ${avg.toFixed(1)}점이에요. 기대와 달랐던 이유를 먼저 확인하고 추가 지출은 보류해도 좋아요.`});
    else if(avg>=4)out.push({icon:'heart',title:`${c.name}에서 만족스러운 소비를 했네요`,text:`이번 달 평가 ${rated.length}건의 평균이 ${avg.toFixed(1)}점이에요. 좋았던 선택을 기억해 두세요. 추가 구매가 필요하다는 뜻은 아니에요.`});
  }
  if(s.records.length&&s.remaining!==null&&s.remaining>=0)out.push({icon:'leaf',title:'남은 예산은 꼭 쓰지 않아도 괜찮아요',text:`이번 달 ${currency(s.remaining)}이 남아 있어요. 보유 제품과 관리 상태를 살펴보고 필요할 때 사용하세요.`});
  if(!out.length)out.push({icon:'spark',title:'기록이 쌓이면 내 취향이 보여요',text:'각 영역에 평가가 두 건 이상 모이면 만족도를 함께 돌아볼 수 있어요. 지금은 내 경험을 차근차근 남겨보세요.'});
  return out.slice(0,4);
}
export function demoData(month) {
  const end=month===today().slice(0,7)?Number(today().slice(-2)):20;
  return {version:1,budgets:{[month]:300000},records:[
    ['헤어 커트 & 케어','hair',65000,5,true,'관리하기 편해져서 만족해요.'],
    ['수분 크림','cosmetic',32000,4,true,'남은 제품을 먼저 쓰고 재구매하기.'],
    ['원컬러 네일','nail',45000,5,true,'차분한 색상이 마음에 들어요.'],
    ['진정 케어','skin',55000,null,null,'일주일 뒤 만족도를 남길 예정이에요.'],
  ].map((a,i)=>({id:`sample-${i}`,title:a[0],category:a[1],amount:a[2],rating:a[3],repurchase:a[4],memo:a[5],date:`${month}-${String(Math.max(1,end-i*2)).padStart(2,'0')}`}))};
}
