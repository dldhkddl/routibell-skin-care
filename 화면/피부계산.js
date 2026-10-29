import { today, validDate, validMonth, summary } from './계산.js';
import { availableInventory } from './계획계산.js';
import { validatePhotoReference, PHOTO_NOTES } from './사진계산.js';
import { PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { photoHistory, validatePhotoHistory } from './사진이력.js';
import { withParticle } from './조사.js';
import { PRODUCT_KINDS, sortVanity, vanityRoutine } from './화장대순서.js';
import { recommendPhoto } from './사진추천.js';
import { STRATEGY } from './추천전략설정.js';

export const FEELS = {dry:'세안 후 당김',oily:'번들거림',combination:'부위마다 달라요',balanced:'대체로 편안해요',unsure:'아직 모르겠어요'};
export const CONCERNS = {dryness:'건조한 느낌',oil:'과한 번들거림',texture:'거친 피부결',dullness:'칙칙해 보이는 인상',pore:'모공',redness:'붉은기',acne:'트러블',pigment:'잡티',aging:'주름·탄력',eye:'눈가'};
export const SENSITIVITIES = {rare:'대체로 무리 없이 써요',often:'제품에 민감한 편이에요',unsure:'잘 모르겠어요'};
export const PRIORITIES = {comfort:'편안한 사용감',simple:'꾸준한 기본 관리',save:'추가 구매 줄이기'};
export const FEEDBACK = {comfortable:'편안했어요',same:'별 차이를 모르겠어요',uncomfortable:'불편했어요',unsure:'잘 모르겠어요'};
export const ADHERENCE = {yes:'대체로 했어요',some:'일부만 했어요',no:'실천하기 어려웠어요',pending:'아직 하지 않았어요',unreported:'실천 정도 미기록'};
export const CARE_SOURCES = [
  {title:'AAD · 기본 관리와 예산',url:'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget'},
  {title:'AAD · 일상 피부 관리',url:'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-in-your-20s'},
  {title:'AAD · 자외선 차단 사용',url:'https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen'},
  {title:'AAD · 순한 피부 관리',url:'https://www.aad.org/public/diseases/rosacea/triggers/tips'},
  {title:'AAD · 트러블 피부 관리',url:'https://www.aad.org/public/diseases/acne/skin-care/tips'},
  {title:'AAD · 자외선 차단과 보습',url:'https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/wrinkle-remedies'},
  {title:'Cleveland Clinic · 눈가 참고',url:'https://my.clevelandclinic.org/health/symptoms/23128-dark-circles-under-eyes'},
];
export const KINDS = {cleanser:'세안제',cream:'보습제',sunscreen:'자외선 차단제'};
export const emptySelection = () => ({cleanser:null,cream:null,sunscreen:null});
export const emptyCare = () => ({profile:null,trackingStartedAt:null,checkins:[],selection:emptySelection(),days:[],history:[],observations:[],monthlyAdjustments:{}});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw Error(message); };
const choice = (options, value) => typeof value === 'string' && Object.hasOwn(options,value);

export function validateSkinProfile(profile) {
  check(object(profile) && choice(FEELS,profile.feel) && choice(SENSITIVITIES,profile.sensitivity) && choice(PRIORITIES,profile.priority), '피부 느낌·민감도·관리 목표를 선택해 주세요.');
  check(Array.isArray(profile.concerns) && profile.concerns.length <= 3 && new Set(profile.concerns).size === profile.concerns.length && profile.concerns.every(value=>choice(CONCERNS,value)), '피부 고민은 중복 없이 최대 3개 선택해 주세요.');
  check(['yes','no','unsure'].includes(profile.discomfort), '현재 불편함 여부를 선택해 주세요.');
  check(profile.budget === null || (Number.isSafeInteger(profile.budget) && profile.budget >= 0 && profile.budget <= 100000000), '피부 관리 월 한도는 빈칸 또는 0원부터 1억원까지 정수로 입력해 주세요.');
  check(validDate(profile.updatedAt) && profile.updatedAt <= today(), '피부 상태 저장 날짜를 확인해 주세요.');
  return {feel:profile.feel,concerns:[...profile.concerns],sensitivity:profile.sensitivity,discomfort:profile.discomfort,priority:profile.priority,budget:profile.budget,updatedAt:profile.updatedAt};
}

export function validateCheckin(entry) {
  check(object(entry) && validDate(entry.date) && entry.date <= today(), '사용 경험 날짜는 오늘 또는 이전 날짜여야 해요.');
  check(choice(FEEDBACK,entry.feeling) && choice(ADHERENCE,entry.adherence), '사용감과 실천 정도를 선택해 주세요.');
  check(typeof entry.memo === 'string' && entry.memo.length <= 200, '사용 경험 메모는 200자까지 적어 주세요.');
  const product=entry.product===undefined||entry.product===null?null:validateProductSnapshot(entry.product);
  const feel=entry.feel===undefined?null:entry.feel;
  check(feel===null||choice(FEELS,feel),'오늘 피부 느낌을 확인해 주세요.');
  return {date:entry.date,feeling:entry.feeling,adherence:entry.adherence,memo:entry.memo.trim(),product,feel};
}

export function validateSkinCare(value, legacy = false) {
  check(object(value) && Array.isArray(value.checkins) && value.checkins.length <= 365, '피부 계획 백업 형식을 확인해 주세요. 경험 기록은 최대 365일이에요.');
  const profile = value.profile === null ? null : validateSkinProfile(value.profile);
  const checkins = value.checkins.map(validateCheckin).sort((first,second)=>first.date.localeCompare(second.date));
  check(new Set(checkins.map(entry=>entry.date)).size === checkins.length, '같은 날짜의 피부 사용 경험이 중복되어 있어요.');
  const selection=validateSelection(legacy&&value.selection===undefined?emptySelection():value.selection);
  const sourceDays=legacy&&value.days===undefined?[]:value.days;
  const sourceHistory=legacy&&value.history===undefined?[]:value.history;
  check(Array.isArray(sourceDays)&&sourceDays.length<=365&&Array.isArray(sourceHistory)&&sourceHistory.length<=60,'실천·계획 이력 백업 형식을 확인해 주세요.');
  const days=sourceDays.map(validateDay).sort((first,second)=>first.date.localeCompare(second.date));
  check(value.trackingStartedAt==null||(validDate(value.trackingStartedAt)&&value.trackingStartedAt<=today()),'관리 기록 시작 날짜를 확인해 주세요.');
  const trackingStartedAt=routineStart({...value,days,checkins});
  check(profile!==null||trackingStartedAt===null,'피부 상태 없이 관리 시작일만 복원할 수 없어요.');
  const history=sourceHistory.map(validatePlanSnapshot);
  check(new Set(days.map(day=>day.date)).size===days.length&&new Set(history.map(plan=>plan.id)).size===history.length,'실천 기록 또는 계획 이력이 중복되어 있어요.');
  check(history.every((plan,index)=>!index||plan.date>=history[index-1].date),'계획 이력 날짜 순서를 확인해 주세요.');
  check(profile !== null || (!checkins.length&&!days.length&&!history.length&&Object.values(selection).every(value=>value===null)), '피부 상태 없이 사용 경험만 복원할 수 없어요.');
  const observation = value.observation == null ? null : validatePhotoReference(value.observation);
  check(!observation || profile !== null, '사진 관찰은 직접 입력한 피부 상태와 함께 저장해 주세요.');
  const observations = validatePhotoHistory(photoHistory({observation,observations:validatePhotoHistory(value.observations ?? [])}));
  const monthlyAdjustments = {};
  const adjustments = value.monthlyAdjustments ?? {};
  check(object(adjustments) && Object.keys(adjustments).length <= 120, '월별 관리 목표는 최대 120개월까지 보관할 수 있어요.');
  for (const [month, adjustment] of Object.entries(adjustments)) {
    check(validMonth(month) && object(adjustment) && Object.keys(adjustment).sort().join(',') === 'createdAt,priority,sourceMonth' && validMonth(adjustment.sourceMonth) && validDate(adjustment.createdAt) && adjustment.createdAt <= today() && choice(PRIORITIES,adjustment.priority), '월별 관리 목표 형식을 확인해 주세요.');
    const expected = new Date(`${adjustment.sourceMonth}-01T12:00:00Z`);
    expected.setUTCMonth(expected.getUTCMonth()+1);
    check(expected.toISOString().slice(0,7) === month && adjustment.sourceMonth <= adjustment.createdAt.slice(0,7), '다음 달 관리 목표와 근거 월을 확인해 주세요.');
    monthlyAdjustments[month] = {...adjustment};
  }
  check(profile !== null || (!observations.length && !Object.keys(monthlyAdjustments).length), '피부 상태 없이 사진 관찰·월별 목표를 복원할 수 없어요.');
  return {profile,trackingStartedAt,checkins,selection,days,history,observations,monthlyAdjustments,...(observation ? {observation} : {})};
}

export function routineStart(care){
  return [care?.trackingStartedAt,...(care?.days??[]).map(entry=>entry.date),...(care?.checkins??[]).map(entry=>entry.date)].filter(validDate).sort()[0]??null;
}

export function routineSummary(care,start,end){
  const startedAt=routineStart(care);
  const trackingStart=startedAt&&startedAt<=end?(startedAt>start?startedAt:start):null;
  const activeDays=trackingStart?Math.round((Date.parse(`${end}T12:00:00Z`)-Date.parse(`${trackingStart}T12:00:00Z`))/86400000)+1:0;
  const days=(care?.days??[]).filter(day=>trackingStart&&day.date>=trackingStart&&day.date<=end);
  const morning=days.filter(day=>day.morning).length,evening=days.filter(day=>day.evening).length;
  const done=morning+evening,opportunities=activeDays*2;
  return {startedAt,trackingStart,activeDays,morning,evening,done,opportunities,unchecked:opportunities-done,rate:opportunities?Math.round(done/opportunities*100):null,recordedDays:days.length};
}

const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(value);
const shortText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validateProductSnapshot(product) {
  check(object(product)&&identifier(product.id)&&shortText(product.title,60)&&choice(PRODUCT_KINDS,product.kind),'기록에 연결한 제품 정보를 확인해 주세요.');
  return {id:product.id,title:product.title.trim(),kind:product.kind};
}
export function validateSelection(selection) {
  check(object(selection)&&Object.keys(selection).length===3&&Object.keys(selection).every(kind=>choice(KINDS,kind)),'사용 제품 선택 형식을 확인해 주세요.');
  check(Object.values(selection).every(value=>value===null||identifier(value)),'사용 제품 식별자를 확인해 주세요.');
  return {...selection};
}
function validateDay(day) {
  check(object(day)&&validDate(day.date)&&day.date<=today()&&typeof day.morning==='boolean'&&typeof day.evening==='boolean','오늘 관리 체크 형식을 확인해 주세요.');
  const result={date:day.date,morning:day.morning,evening:day.evening};
  for(const period of ['morning','evening']){
    const products=day[period+'Products'];
    check(Array.isArray(products)&&products.length<=9&&(day[period]||!products.length),'실천 당시 제품 기록을 확인해 주세요.');
    result[period+'Products']=products.map(validateProductSnapshot);
    check(new Set(products.map(product=>product.kind)).size===products.length,'실천 당시 제품 종류가 중복되어 있어요.');
  }
  return result;
}
function validatePlanSnapshot(plan) {
  check(object(plan)&&identifier(plan.id)&&validDate(plan.date)&&plan.date<=today()&&['profile','products','feedback','daily','observation'].includes(plan.reason),'계획 이력 정보를 확인해 주세요.');
  check(shortText(plan.title,120)&&typeof plan.paused==='boolean'&&(plan.cap===null||(Number.isSafeInteger(plan.cap)&&plan.cap>=0&&plan.cap<=100000000)),'과거 계획 요약을 확인해 주세요.');
  check(Array.isArray(plan.reasons)&&plan.reasons.length<=15&&plan.reasons.every(reason=>shortText(reason,500)),'과거 계획 근거를 확인해 주세요.');
  check(Array.isArray(plan.steps)&&plan.steps.length<=18,'과거 관리 단계를 확인해 주세요.');
  const steps=plan.steps.map(step=>{
    check(object(step)&&['morning','evening'].includes(step.period)&&choice(PRODUCT_KINDS,step.kind)&&shortText(step.text,500),'과거 관리 단계 형식을 확인해 주세요.');
    const product=step.product===null?null:validateProductSnapshot(step.product);
    check(!product||product.kind===step.kind,'과거 단계와 제품 종류가 달라요.');
    return {period:step.period,kind:step.kind,text:step.text,product};
  });
  check(new Set(steps.map(step=>step.period+step.kind)).size===steps.length&&(!plan.paused||steps.length===0),'중복되거나 중지된 계획의 단계를 확인해 주세요.');
  return {id:plan.id,date:plan.date,reason:plan.reason,profile:validateSkinProfile(plan.profile),title:plan.title,paused:plan.paused,cap:plan.cap,steps,reasons:[...plan.reasons]};
}

export function selectedInventory(data, asOf=today()) {
  return availableInventory(data,asOf).filter(item=>item.category==='cosmetic'&&item.comfort==='comfortable'&&data.skinCare?.selection?.[item.kind]===item.id);
}

export function withInventory(data, inventory) {
  const selection={...(data.skinCare?.selection??emptySelection())};
  for(const kind of Object.keys(KINDS))if(!inventory.some(item=>item.id===selection[kind]&&item.kind===kind&&item.category==='cosmetic'))selection[kind]=null;
  return {...data,inventory,skinCare:{...data.skinCare,selection}};
}

export function capturePlan(data, reason, asOf=today()) {
  const plan=buildSkinPlan(data,asOf);if(!plan)return data;
  const snapshot={profile:{...data.skinCare.profile,priority:data.skinCare.monthlyAdjustments?.[asOf.slice(0,7)]?.priority??data.skinCare.profile.priority,concerns:[...data.skinCare.profile.concerns]},title:plan.title,paused:plan.paused,cap:plan.allowance.cap,steps:['morning','evening'].flatMap(period=>plan[period].map(step=>({period,kind:step.kind,text:step.text,product:step.product?validateProductSnapshot(step.product):null}))),reasons:[...plan.reasons]};
  const history=data.skinCare.history??[];
  const previous=history.at(-1);
  if(previous){const {id,date,reason:previousReason,...content}=previous;if(JSON.stringify(content)===JSON.stringify(snapshot))return data;}
  return {...data,skinCare:{...data.skinCare,history:[...history,{id:crypto.randomUUID(),date:asOf,reason,...snapshot}].slice(-60)}};
}

export function saveDaily(data, period, done, asOf=today()) {
  check(['morning','evening'].includes(period)&&typeof done==='boolean','관리 체크를 확인해 주세요.');
  const plan=buildSkinPlan(data,asOf);
  check(plan&&(!done||!plan.paused),'불편함을 확인하는 동안 새 관리 완료 체크는 멈춰요. 기존 체크는 취소할 수 있어요.');
  const days=data.skinCare.days??[];
  const day=days.find(entry=>entry.date===asOf)??{date:asOf,morning:false,evening:false,morningProducts:[],eveningProducts:[]};
  const changed=validateDay({...day,[period]:done,[period+'Products']:done?plan[period].filter(step=>step.product).map(step=>validateProductSnapshot(step.product)):[]});
  const next={...data,skinCare:{...data.skinCare,days:[...days.filter(entry=>entry.date!==asOf),changed].sort((first,second)=>first.date.localeCompare(second.date)).slice(-365)}};
  next.skinCare.trackingStartedAt=routineStart({...data.skinCare,days:[...days,changed]});
  return capturePlan(next,'daily',asOf);
}

export function saveSkinCheckin(data, value, asOf=today()) {
  check(data.skinCare?.profile, '먼저 피부 상태를 저장해 주세요.');
  const entry=validateCheckin(value),care=data.skinCare;
  check(entry.date<=asOf,'사용감 날짜를 확인해 주세요.');
  check(care.checkins.length<365 || care.checkins.some(item=>item.date===entry.date) || entry.date>care.checkins[0].date, '보관 범위보다 오래된 기록이에요. 기존 기록을 백업한 뒤 확인해 주세요.');
  const checkins=[...care.checkins.filter(item=>item.date!==entry.date),entry].sort((first,second)=>first.date.localeCompare(second.date)).slice(-365);
  let next={...data,skinCare:{...care,checkins}};
  next.skinCare.trackingStartedAt=routineStart({...care,checkins:[...care.checkins,entry]});
  if(entry.date===asOf){
    const discomfort=entry.feeling==='uncomfortable'?'yes':entry.feeling==='comfortable'?'no':care.profile.discomfort;
    next.skinCare.profile={...care.profile,feel:entry.feel??care.profile.feel,discomfort,updatedAt:asOf};
    if(entry.feeling==='uncomfortable'&&entry.product)next=withInventory(next,data.inventory.map(item=>item.id===entry.product.id?{...item,comfort:'uncomfortable'}:item));
    return capturePlan(next,'feedback',asOf);
  }
  return next;
}

export function weekReport(data, asOf=today()) {
  const shift=offset=>{const day=new Date(`${asOf}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+offset);return day.toISOString().slice(0,10);};
  const care=data.skinCare??emptyCare();
  const summarize=(start,end)=>{
    const checkins=care.checkins.filter(entry=>entry.date>=start&&entry.date<=end);
    const feelings=checkins.filter(entry=>entry.feel);
    return {start,end,...routineSummary(care,start,end),feedbackDays:checkins.length,comfortable:checkins.filter(entry=>entry.feeling==='comfortable').length,uncomfortable:checkins.filter(entry=>entry.feeling==='uncomfortable').length,lastFeel:feelings.at(-1)??null};
  };
  return {current:summarize(shift(-6),asOf),previous:summarize(shift(-13),shift(-7)),days:Array.from({length:7},(_,index)=>{const date=shift(index-6);return {date,entry:(care.days??[]).find(day=>day.date===date)??null};})};
}

export function careAllowance(data, profile, asOf = today()) {
  const month = asOf.slice(0,7), current = summary(data,month), plan = data.plans?.[month];
  const skinSpent = current.records.filter(record=>['cosmetic','skin'].includes(record.category)).reduce((total,record)=>total+record.amount,0);
  const limits = [];
  if(profile.budget !== null)limits.push(profile.budget-skinSpent);
  if(current.remaining !== null)limits.push(current.remaining-(plan?.reserve??0));
  if(plan)limits.push(plan.allocations.cosmetic+plan.allocations.skin-skinSpent);
  return {cap:limits.length?Math.max(0,Math.min(...limits)):null,skinSpent,month,monthlyBudget:current.budget,reserve:plan?.reserve??0,profileBudget:profile.budget};
}

export function buildSkinPlan(data, asOf = today(), strategy = STRATEGY) {
  const care = data.skinCare ?? emptyCare();
  if(!care.profile)return null;
  const scheduled = care.monthlyAdjustments?.[asOf.slice(0,7)];
  const profile = {...care.profile,priority:scheduled?.priority ?? care.profile.priority};
  const history = care.checkins.filter(entry=>entry.date <= asOf).sort((first,second)=>first.date.localeCompare(second.date));
  const latest = history.at(-1) ?? null;
  const currentFeedback = latest && latest.date >= profile.updatedAt ? latest : null;
  const paused = profile.discomfort === 'yes' || currentFeedback?.feeling === 'uncomfortable';
  const cautious = profile.sensitivity !== 'rare' || profile.discomfort === 'unsure';
  const dry = profile.feel === 'dry' || profile.concerns.includes('dryness');
  const oily = ['oily','combination'].includes(profile.feel) || profile.concerns.includes('oil');
  const goals = data.goals?.selected ?? [];
  const simple = profile.priority === 'simple' || goals.includes('routine') || currentFeedback?.adherence === 'no';
  const save = profile.priority === 'save' || goals.includes('save');
  const allowance = careAllowance(data,profile,asOf);
  const inventory = selectedInventory(data,asOf);
  const photo = recommendPhoto(care,null,{asOf,strategy});
  const focused = photo?.focused ?? [];
  const baseSteps = [
    {kind:'cleanser',title:'순한 세안',text:'세게 문지르지 않고 부드럽게 씻어요. 세안 단계를 여러 번 늘리지 않아요.'},
    {kind:'cream',title:'보습',text:dry?'당기는 부위에 보습을 우선해요. 무리 없이 쓰던 보습제를 세안 후 사용해요.':oily?'번들거려도 보습 단계를 없애지 않아요. 새로 고를 때는 가벼운 사용감과 논코메도제닉 표시를 확인해요.':'무리 없이 쓰던 보습제로 기본 관리를 유지해요.'},
    {kind:'sunscreen',title:'자외선 차단',text:'SPF 30 이상·광범위 차단 제품인지 표시를 확인해요. 야외에서는 2시간마다, 수영·땀을 흘린 뒤 덧바르고 그늘·모자도 활용해요.'},
  ];
  const vanity = vanityRoutine(data.inventory??[],asOf);
  const owned = new Map([...inventory,...vanity.morning,...vanity.evening].map(item=>[item.kind,item]));
  for(const item of inventory)owned.set(item.kind,item);
  const extraKinds = new Set(focused.flatMap(type => {
    if(['redness','acne','pore'].includes(type))return [];
    if(['moisture','texture','oiliness'].includes(type))return ['toner','serum'];
    if(['age_spot','radiance','wrinkle','firmness'].includes(type))return ['serum'];
    if(['dark_circle_v2','eye_bag','tear_trough','droopy_upper_eyelid','droopy_lower_eyelid'].includes(type))return ['eyecream'];
    return [];
  }));
  const optional = [...owned.values()].filter(item=>!['cleanser','cream','sunscreen','other'].includes(item.kind) && (!focused.length || extraKinds.has(item.kind)) && !(cautious&&['retinol','exfoliant'].includes(item.kind)));
  const stepFor = kind => {
    const base=baseSteps.find(step=>step.kind===kind);
    return {kind,title:base?.title??PRODUCT_KINDS[kind],text:base?.text??`내 화장대의 ${withParticle(PRODUCT_KINDS[kind],'을/를')} 제품 표시 방법대로 사용하고 사용감을 기록해요.`,product:owned.get(kind)??null};
  };
  const morning=sortVanity([{kind:'cleanser'},{kind:'cream'},{kind:'sunscreen'},...optional.filter(item=>!['retinol','exfoliant'].includes(item.kind))].map(item=>({kind:item.kind,title:item.title??''}))).map(item=>stepFor(item.kind));
  const evening=sortVanity([{kind:'cleanser'},{kind:'cream'},...optional.filter(item=>vanity.evening.some(ready=>ready.kind===item.kind))].map(item=>({kind:item.kind,title:item.title??''}))).map(item=>stepFor(item.kind));
  const reasons = [`직접 선택한 느낌: ${FEELS[profile.feel]}. 사진 판독이나 피부 타입 진단이 아니에요.`];
  if(scheduled)reasons.push(`${scheduled.sourceMonth} 리포트에서 확인해 저장한 이번 달 목표: ${PRIORITIES[scheduled.priority]}.`);
  if(care.observation)reasons.push(`${care.observation.date} 사진 관찰 중 직접 고른 항목: ${PHOTO_SIMPLE_LABELS[care.observation.focus]}. ${PHOTO_NOTES[care.observation.focus]} 사진으로 직접 답한 피부 느낌이나 불편함을 덮어쓰지 않아요.`);
  if(focused.length)reasons.push(`사진 참고값과 직접 고른 고민을 함께 본 집중 항목: ${focused.map(type=>PHOTO_SIMPLE_LABELS[type]).join(' · ')}. 사진 점수만으로 불편함·제품 효과를 판단하지 않아요.`);
  if(dry)reasons.push('당김·건조한 느낌을 반영해 보습을 우선했어요.');
  if(oily)reasons.push('번들거림을 반영해 가벼운 사용감을 확인하도록 했어요.');
  if(cautious)reasons.push('민감하거나 아직 확신이 없다고 답해 새 제품·단계를 늘리지 않아요. 새 제품은 무향 표시부터 확인해요.');
  if(profile.feel==='unsure')reasons.push('느낌을 잘 모르겠다면 먼저 평소 사용감을 기록해요. 타입을 임의로 결정하지 않아요.');
  if(profile.concerns.some(concern=>['texture','dullness'].includes(concern)))reasons.push('피부결·인상 고민만으로 각질 제거제나 기능성 성분을 자동 추천하지 않아요. 기본 관리와 관찰부터 시작해요.');
  if(simple)reasons.push('꾸준한 관리 목표 또는 실천 어려움을 반영해 기본 단계만 유지해요.');
  if(save)reasons.push('절약 목표를 반영해 무리 없이 쓰던 보유 제품을 먼저 확인해요.');
  if(latest)reasons.push(`${latest.date} 사용 경험: ${FEEDBACK[latest.feeling]}. ${!currentFeedback?'더 최근에 직접 확인한 현재 피부 상태를 우선해요.':latest.feeling==='uncomfortable'?'추가 제품 제안을 멈췄어요.':latest.feeling==='unsure'?'사용감은 아직 확인 중이에요. 다음 느낌도 기록해 주세요.':latest.feeling==='same'?'변화가 불분명해도 지출을 늘리지 않아요.':'편안했다는 이유만으로 제품을 추가하지 않아요.'}`);
  const title = paused?'새 제품보다 불편함 확인이 먼저예요':focused.length?`${PHOTO_SIMPLE_LABELS[focused[0]]}부터, 내 화장대 제품으로 차근차근`:dry?'보습부터 차근차근, 나의 기본 관리':simple?'지킬 수 있는 만큼, 간단한 기본 관리':oily?'가벼운 사용감으로, 기본은 꾸준하게':'나에게 편안한 기본 관리부터';
  return {title,paused,cautious,reasons,allowance,latest,focused,morning:paused?[]:morning,evening:paused?[]:evening,missing:baseSteps.filter(step=>!inventory.some(item=>item.kind===step.kind)).map(step=>step.title),comfortableProducts:inventory.length};
}
