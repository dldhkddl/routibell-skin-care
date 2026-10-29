import { CATEGORIES, today, validDate, validMonth, summary, validateData } from './계산.js';
import { blankPlan, nextMonth, validatePlan, availableInventory } from './계획계산.js';
import { buildSkinPlan, PRIORITIES, routineSummary } from './피부계산.js';
import { photoHistory } from './사진이력.js';

export function monthRange(month, asOf = today()) {
  if (!validMonth(month) || !validDate(asOf) || month > asOf.slice(0,7)) throw Error('오늘까지의 리포트 월을 선택해 주세요.');
  const lastDate = new Date(`${month}-01T12:00:00Z`);
  lastDate.setUTCMonth(lastDate.getUTCMonth()+1,0);
  const last = lastDate.toISOString().slice(0,10);
  const end = last < asOf ? last : asOf;
  return {month,start:`${month}-01`,end,last,closed:month < asOf.slice(0,7),days:Number(end.slice(-2))};
}

export function monthlyReport(data, month, asOf = today()) {
  const range = monthRange(month,asOf);
  const inRange = date => date >= range.start && date <= range.end;
  const care = data.skinCare;
  const records = data.records.filter(record => inRange(record.date));
  const spending = summary({...data,records},month);
  const checkins = (care?.checkins ?? []).filter(entry => inRange(entry.date));
  const routine = routineSummary(care,range.start,range.end);
  const calendar = Array.from({length:range.days},(_,index) => {
    const date = `${month}-${String(index+1).padStart(2,'0')}`;
    return {date,active:Boolean(routine.trackingStart&&date>=routine.trackingStart),entry:care?.days?.find(day => day.date === date) ?? null};
  });
  const observations = photoHistory(care).filter(entry => inRange(entry.reference.date));
  const first = observations[0] ?? null;
  const latest = observations.at(-1) ?? null;
  const differentDays = Boolean(first && latest && first.reference.date !== latest.reference.date);
  const commonActions=first&&latest?Object.keys(first.reference.scores).filter(key=>Number.isFinite(first.reference.scores[key])&&Number.isFinite(latest.reference.scores[key])):[];
  const comparable = differentDays && commonActions.length>0 && latest.condition === 'matched' && latest.baselineId === first.id && first.reference.provider === latest.reference.provider && first.reference.version === latest.reference.version;
  const changes = comparable ? Object.fromEntries(commonActions.map(key => [key, Math.round((latest.reference.scores[key]-first.reference.scores[key])*100)/100])) : null;
  const used = new Map();
  for (const day of calendar) for (const period of ['morning','evening']) {
    if (!day.entry?.[period]) continue;
    for (const product of day.entry[`${period}Products`] ?? []) {
      const entry = used.get(product.id) ?? {...product,count:0,dates:new Set()};
      entry.count++;
      entry.dates.add(day.date);
      used.set(product.id,entry);
    }
  }
  const history = (care?.history ?? []).filter(plan => inRange(plan.date));
  return {
    ...range,asOf,spending,checkins,calendar,observations,
    hasData:Boolean(records.length || calendar.some(day => day.entry) || checkins.length || observations.length),
    routine,
    feedback:{count:checkins.length,comfortable:checkins.filter(entry => entry.feeling === 'comfortable').length,uncomfortable:checkins.filter(entry => entry.feeling === 'uncomfortable').length,same:checkins.filter(entry => entry.feeling === 'same').length,unsure:checkins.filter(entry => entry.feeling === 'unsure').length,difficult:checkins.filter(entry => entry.adherence === 'no').length},
    photos:{first,latest:observations.length>1?latest:null,differentDays,comparable,changes},
    usedProducts:[...used.values()].map(entry => ({...entry,days:entry.dates.size,dates:undefined})),
    plans:history,
    availableMonths:[...new Set([...data.records.map(record=>record.date.slice(0,7)),...(care?.days ?? []).map(day=>day.date.slice(0,7)),...(care?.checkins ?? []).map(entry=>entry.date.slice(0,7)),...photoHistory(care).map(entry=>entry.reference.date.slice(0,7))])].filter(value => value <= asOf.slice(0,7)).sort().reverse()
  };
}

function capAllocation(allocations, categories, limit) {
  const total = categories.reduce((sum,key) => sum+allocations[key],0);
  if (total <= limit) return {...allocations};
  const fractions = categories.map(key => ({key,exact:allocations[key]*limit/total}));
  const next = {...allocations};
  fractions.forEach(item => {next[item.key]=Math.floor(item.exact);});
  const remaining = limit-categories.reduce((sum,key) => sum+next[key],0);
  fractions.sort((first,second)=>(second.exact-Math.floor(second.exact))-(first.exact-Math.floor(first.exact)) || first.key.localeCompare(second.key));
  fractions.slice(0,remaining).forEach(item => {next[item.key]++;});
  return next;
}

export function monthlyProposal(data, month, asOf = today()) {
  const report = monthlyReport(data,month,asOf);
  const targetMonth = nextMonth(month);
  const currentPlan = buildSkinPlan(data,asOf);
  const sourcePlan = data.plans?.[month];
  const targetPlan = data.plans?.[targetMonth];
  const total = data.budgets[targetMonth] ?? report.spending.budget;
  const reasons = [];
  let allocations = Object.fromEntries(CATEGORIES.map(category => [category.id,sourcePlan?.allocations[category.id] ?? report.spending.categories.find(item=>item.id===category.id).amount]));
  reasons.push(sourcePlan ? '이번 달에 직접 정한 분야별 계획을 기준으로 검토했어요.' : '이번 달 기록한 분야별 지출을 기준으로 검토했어요.');
  for (const category of CATEGORIES) {
    const rated = report.spending.records.filter(record=>record.category===category.id && record.rating!==null);
    if (rated.length>=2 && rated.reduce((sum,record)=>sum+record.rating,0)/rated.length<=2.5) {
      allocations[category.id]=Math.floor(allocations[category.id]/2);
      reasons.push(`${category.name} 평가 ${rated.length}건의 평균이 2.5점 이하라 다음 구매 상한을 절반으로 검토해요. 제품 효과 판정은 아니에요.`);
    }
  }
  if (currentPlan?.paused) {
    allocations.skin=0; allocations.cosmetic=0;
    reasons.push('현재 불편함이 있어 피부관리·화장품 신규 구매 배분은 보류해요.');
  }
  if (data.skinCare?.profile?.budget != null) {
    allocations=capAllocation(allocations,['skin','cosmetic'],data.skinCare.profile.budget);
    reasons.push('직접 정한 피부 관리 월 상한을 넘지 않도록 제한했어요.');
  }
  let plan = null;
  if (total !== null) {
    const reserveFloor = Math.min(total,targetPlan?.reserve ?? sourcePlan?.reserve ?? 0);
    allocations=capAllocation(allocations,CATEGORIES.map(category=>category.id),total-reserveFloor);
    plan=validatePlan({...blankPlan(total),importance:{...(targetPlan?.importance ?? sourcePlan?.importance ?? blankPlan().importance)},allocations,reserve:total-Object.values(allocations).reduce((sum,amount)=>sum+amount,0)});
    reasons.push(data.budgets[targetMonth]!==undefined?'이미 정한 다음 달 총예산을 유지해요.':'이번 달 총예산을 다음 달의 검토 상한으로 사용해요.');
  } else reasons.push('총예산이 미설정이라 금액을 임의로 만들지 않았어요. 예산을 정하면 배분안을 계산해요.');
  const priority = !data.skinCare?.profile ? null : report.feedback.difficult>=2 ? 'simple' : data.skinCare.monthlyAdjustments?.[month]?.priority ?? data.skinCare.profile.priority;
  const actions = [];
  if (currentPlan?.paused) actions.push({kind:'pause',title:'불편함 확인을 먼저 해요',body:'현재 관리 계획의 사용 단계와 새 구매 제안은 멈춰 있어요. 오늘의 사용감을 다시 확인하고, 불편함이 지속되거나 심해지면 전문가와 상담하세요.',evidence:'현재 피부 상태와 가장 최근 사용감',view:'records'});
  if (priority === 'simple' && report.feedback.difficult>=2) actions.push({kind:'routine',title:'다음 달은 간단한 기본 관리로',body:`실천하기 어려웠다는 기록이 ${report.feedback.difficult}일 있어요. 새 단계를 늘리기보다 기본 관리 목표로 정리해요.`,evidence:`${month} 사용감·실천 기록`,view:'care'});
  const selectedIds = new Set(Object.values(data.skinCare?.selection ?? {}));
  const owned = availableInventory(data,asOf).filter(item=>selectedIds.has(item.id) && item.comfort==='comfortable');
  if (owned.length && !currentPlan?.paused) actions.push({kind:'owned',title:'직접 고른 보유 제품부터 확인해요',body:owned.map(item=>`${item.title} ${item.remaining}%`).join(' · '),evidence:`현재 보유 제품 ${owned.length}개 · 기한·사용감 확인된 직접 선택`,view:'care'});
  const unrated = report.spending.records.filter(record=>record.rating===null);
  if (unrated.length) actions.push({kind:'rating',title:`소비 ${unrated.length}건의 사용감을 더 남겨요`,body:unrated.map(record=>record.title).slice(0,3).join(' · '),evidence:'미평가는 낮은 만족도가 아니에요.',view:'spend'});
  if (!report.observations.length) actions.push({kind:'photo',title:'사진 관찰 기준점을 남길 수 있어요',body:'사진 분석은 선택이에요. 원한다면 전송 안내와 동의를 확인한 뒤 첫 관찰을 저장하세요.',evidence:'이달 저장된 사진 관찰 없음',view:'care'});
  else actions.push({kind:'photo',title:'다음 관찰은 촬영 조건을 맞춰요',body:'조명·거리·각도·화장 여부를 맞추고 비교 기준을 직접 확인해 주세요. 추가 분석은 별도 실행해야 해요.',evidence:`이달 관찰 ${report.observations.length}건`,view:'care'});
  if (!actions.some(action=>action.kind==='routine') && data.skinCare?.profile && !currentPlan?.paused) actions.unshift({kind:'routine',title:'지금의 기본 관리부터 이어가요',body:currentPlan.title,evidence:`아침 ${report.routine.morning}회 · 저녁 ${report.routine.evening}회 완료 체크`,view:'care'});
  const adjustment=data.skinCare?.monthlyAdjustments?.[targetMonth];
  const budgetMatches=plan===null || JSON.stringify(targetPlan)===JSON.stringify(plan);
  const routineMatches=priority===null || (adjustment?.sourceMonth===month && adjustment.priority===priority);
  return {sourceMonth:month,targetMonth,asOf,partial:!report.closed,hasData:report.hasData,plan,priority,reasons,actions,currentPlan,canApply:report.hasData && targetMonth>=asOf.slice(0,7) && validMonth(targetMonth) && Boolean(plan || priority),applied:budgetMatches && routineMatches && Boolean(plan || priority),priorityLabel:priority?PRIORITIES[priority]:null};
}

export function applyMonthlyProposal(data, month, asOf = today()) {
  const proposal = monthlyProposal(data,month,asOf);
  if (!proposal.canApply) throw Error('근거 기록과 적용할 월·예산·피부 상태를 확인해 주세요.');
  const next = {...data,budgets:{...data.budgets},plans:{...data.plans},skinCare:{...data.skinCare,monthlyAdjustments:{...data.skinCare.monthlyAdjustments}}};
  if (proposal.plan) {
    next.budgets[proposal.targetMonth]=proposal.plan.total;
    next.plans[proposal.targetMonth]=proposal.plan;
  }
  if (proposal.priority) next.skinCare.monthlyAdjustments[proposal.targetMonth]={sourceMonth:month,createdAt:asOf,priority:proposal.priority};
  return validateData(next);
}

export function latestReportMonth(data, asOf = today()) {
  const current=asOf.slice(0,7);
  const months=monthlyReport(data,current,asOf).availableMonths;
  return months.find(month=>month<current) ?? current;
}
