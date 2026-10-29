import { CATEGORIES, validDate, validMonth, today } from './계산.js';
import { validateGoals } from './시작흐름.js';
import { PRODUCT_KINDS } from './화장대순서.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
const categoryValid = value => CATEGORIES.some(category => category.id === value);
const textValid = (value, max) => typeof value === 'string' && value.length <= max;
const optionalDate = value => value === '' || validDate(value);
const check = (condition, message) => { if (!condition) throw Error(message); };

export function validateExperience(record) {
  const useDays = record.useDays ?? null;
  const reviewDate = record.reviewDate ?? '';
  const good = record.good ?? '';
  const bad = record.bad ?? '';
  check(useDays === null || (Number.isInteger(useDays) && useDays >= 1 && useDays <= 36500), '사용기간은 1~36,500일 또는 빈칸으로 입력해 주세요.');
  check(optionalDate(reviewDate) && (!reviewDate || reviewDate >= record.date), '평가 예정일은 소비 날짜 이후로 정해 주세요.');
  check(textValid(good, 300) && textValid(bad, 300), '만족·불만 이유는 각각 300자까지 적어 주세요.');
  return { useDays, reviewDate, good: good.trim(), bad: bad.trim() };
}

export function validateInventory(item) {
  check(object(item) && identifier(item.id), '보유 제품 식별자를 확인해 주세요.');
  check(textValid(item.title, 60) && item.title.trim() && categoryValid(item.category), '보유 제품 이름과 분야를 확인해 주세요.');
  check(Object.hasOwn(PRODUCT_KINDS,item.kind) && ['available', 'finished'].includes(item.status), '보유 제품 종류와 상태를 확인해 주세요.');
  check(Number.isInteger(item.remaining) && item.remaining >= 0 && item.remaining <= 100, '남은 양은 0~100%로 입력해 주세요.');
  check((item.status === 'finished') === (item.remaining === 0), '다 쓴 제품은 남은 양을 0%로 설정해 주세요.');
  check(optionalDate(item.opened) && (!item.opened || item.opened <= today()) && optionalDate(item.expires), '개봉일과 사용기한을 확인해 주세요.');
  const registeredAt=item.registeredAt??item.opened??'';
  const usageState=item.usageState??(item.status==='finished'?'finished':item.remaining<=15?'low':'using');
  const finishedAt=item.finishedAt??'';
  check(optionalDate(registeredAt)&&(!registeredAt||registeredAt<=today())&&optionalDate(finishedAt), '등록일과 사용 상태를 확인해 주세요.');
  check(['using','low','finished'].includes(usageState)&&(usageState==='finished')===(item.status==='finished'), '제품 사용 상태를 확인해 주세요.');
  check(!item.opened || !item.expires || item.expires >= item.opened, '사용기한은 개봉일 이후여야 해요.');
  check(textValid(item.memo, 300), '제품 메모는 300자까지 적어 주세요.');
  const comfort = item.comfort === undefined ? 'unknown' : item.comfort;
  check(['unknown','comfortable','uncomfortable'].includes(comfort), '보유 제품 사용 경험을 확인해 주세요.');
  return { id:item.id, title:item.title.trim(), category:item.category, kind:item.kind, comfort, status:item.status, usageState, remaining:item.remaining, registeredAt, opened:item.opened, finishedAt, expires:item.expires, memo:item.memo.trim() };
}

export function validatePlan(plan) {
  check(object(plan) && money(plan.total) && money(plan.reserve) && object(plan.allocations) && object(plan.importance), '계획 예산 형식을 확인해 주세요.');
  const allocations = {}, importance = {};
  for (const category of CATEGORIES) {
    check(money(plan.allocations[category.id]), '분야별 금액은 0원부터 정수로 입력해 주세요.');
    check([1,2,3].includes(plan.importance[category.id]), '분야별 중요도를 확인해 주세요.');
    allocations[category.id] = plan.allocations[category.id];
    importance[category.id] = plan.importance[category.id];
  }
  check(Object.keys(plan.allocations).every(categoryValid) && Object.keys(plan.importance).every(categoryValid), '알 수 없는 예산 분야가 있어요.');
  check(Object.values(allocations).reduce((sum, amount) => sum + amount, 0) + plan.reserve <= plan.total, '분야별 예산과 남겨둘 금액의 합이 전체 예산을 넘어요.');
  return { total:plan.total, reserve:plan.reserve, allocations, importance };
}

export function validateSchedule(schedule) {
  check(object(schedule) && identifier(schedule.id) && textValid(schedule.title,60) && schedule.title.trim(), '반복 일정 이름을 확인해 주세요.');
  check(categoryValid(schedule.category) && money(schedule.amount) && validDate(schedule.nextDate), '반복 일정 분야·금액·날짜를 확인해 주세요.');
  check(Number.isInteger(schedule.interval) && schedule.interval >= 1 && schedule.interval <= 365 && typeof schedule.active === 'boolean', '반복 주기는 1~365일로 입력해 주세요.');
  return { id:schedule.id, title:schedule.title.trim(), category:schedule.category, amount:schedule.amount, nextDate:schedule.nextDate, interval:schedule.interval, active:schedule.active };
}

export function validateExtensions(data) {
  const source = data.version < 3 ? {inventory:[], plans:{}, schedules:[], onboarding:false} : data;
  check(Array.isArray(source.inventory) && source.inventory.length <= 2000 && Array.isArray(source.schedules) && source.schedules.length <= 2000 && object(source.plans) && typeof source.onboarding === 'boolean', '보유 제품·계획·일정 백업 형식을 확인해 주세요.');
  const inventory = source.inventory.map(validateInventory), schedules = source.schedules.map(validateSchedule), plans = {};
  check(new Set(inventory.map(item => item.id)).size === inventory.length && new Set(schedules.map(item => item.id)).size === schedules.length, '중복된 보유 제품 또는 일정이 있어요.');
  for (const [month, plan] of Object.entries(source.plans)) {
    check(validMonth(month), '계획 월을 확인해 주세요.');
    plans[month] = validatePlan(plan);
    check(data.budgets[month] === plan.total, '월 예산과 계획의 전체 예산이 일치해야 해요.');
  }
  return {inventory, schedules, plans, onboarding:source.onboarding, goals:validateGoals(data.goals)};
}

export function nextMonth(month) {
  const date = new Date(Number(month.slice(0,4)), Number(month.slice(5)), 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

export function blankPlan(total = 0) {
  return { total, reserve:0, allocations:Object.fromEntries(CATEGORIES.map(category => [category.id,0])), importance:Object.fromEntries(CATEGORIES.map(category => [category.id,1])) };
}

export function availableInventory(data, asOf = today()) {
  return (data.inventory ?? []).filter(item => item.status === 'available' && item.remaining > 0 && item.comfort !== 'uncomfortable' && (!item.expires || item.expires >= asOf));
}

export function personalStats(data, category, beforeMonth = '2100-01') {
  const records = data.records.filter(record => record.category === category && record.date.slice(0,7) < beforeMonth);
  const rated = records.filter(record => record.rating !== null);
  const timed = records.filter(record => record.useDays > 0);
  return {count:records.length, rated:rated.length, average:rated.length ? rated.reduce((sum,record) => sum + record.rating,0)/rated.length : null, dailyCost:timed.length ? timed.reduce((sum,record) => sum + record.amount,0)/timed.reduce((sum,record) => sum + record.useDays,0) : null, timed:timed.length};
}

export function suggestPlan(data, month, input) {
  const plan = validatePlan(input), spendable = plan.total - plan.reserve;
  const history = data.records.filter(record => record.date.slice(0,7) < month);
  const hasAllocation = Object.values(plan.allocations).some(amount => amount > 0);
  const reasons = [];
  const weights = CATEGORIES.map(category => {
    const stats = personalStats(data, category.id, month);
    const previousSpend = history.filter(record => record.category === category.id).reduce((sum,record) => sum + record.amount,0);
    let weight = (hasAllocation ? plan.allocations[category.id] : previousSpend) * plan.importance[category.id];
    if (stats.rated >= 2 && stats.average <= 2.5) {
      weight *= 0.5;
      reasons.push(`${category.name}: 평가 ${stats.rated}건 평균 ${stats.average.toFixed(1)}점으로 배분 비중을 줄였어요. 효과가 없다는 뜻은 아니에요.`);
    }
    return {id:category.id, weight};
  });
  const weightTotal = weights.reduce((sum,item) => sum + item.weight,0);
  const baseline = hasAllocation ? Object.values(plan.allocations).reduce((sum,value) => sum+value,0) : history.length ? history.reduce((sum,record) => sum+record.amount,0)/new Set(history.map(record => record.date.slice(0,7))).size : 0;
  const target = Math.min(spendable, Math.floor(baseline));
  const allocations = Object.fromEntries(weights.map(item => [item.id, weightTotal ? Math.floor(target * item.weight / weightTotal) : 0]));
  const reserve = plan.total - Object.values(allocations).reduce((sum,value) => sum+value,0);
  reasons.unshift('현재 배분 또는 과거 월평균 지출과 중요도를 기준으로 계산해요. 전체 계획 지출은 늘리지 않고 나머지는 남겨둡니다.');
  if (!weightTotal) reasons.push('계획 금액이나 과거 소비가 없어 전액을 남겨두었어요. 필요한 분야부터 직접 입력하세요.');
  return {plan:{...plan, allocations, reserve}, reasons};
}

export function plannedPurchases(data, month) {
  return (data.wishes ?? []).filter(wish => wish.month === month && wish.status === 'pending').reduce((sum,wish) => sum+wish.limit,0);
}

export function advanceSchedule(schedule, asOf = today()) {
  const updated = {...schedule};
  const date = new Date(`${schedule.nextDate}T12:00:00Z`);
  do { date.setUTCDate(date.getUTCDate()+schedule.interval); updated.nextDate=date.toISOString().slice(0,10); } while (updated.nextDate <= asOf);
  return validateSchedule(updated);
}
