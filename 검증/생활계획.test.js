import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData, validateRecord, today, CATEGORIES } from '../화면/계산.js';
import { blankPlan, validatePlan, validateInventory, availableInventory, suggestPlan, personalStats, plannedPurchases, advanceSchedule, nextMonth } from '../화면/계획계산.js';
import { recommend, purchaseWish, removeRecord } from '../화면/추천계산.js';

const month=today().slice(0,7);
const record=(extra={})=>({id:'record',title:'크림',category:'cosmetic',amount:20000,date:'2025-01-01',rating:null,repurchase:null,memo:'',...extra});
const item=(extra={})=>({id:'cream',title:'남은 크림',category:'cosmetic',kind:'cream',remaining:50,status:'available',opened:'',expires:'',memo:'',...extra});
const wish=(extra={})=>({id:'wish',title:'새 크림',month,limit:30000,priority:'price',owned:false,status:'pending',productId:null,recordId:null,...extra});

test('버전 1·2 기록과 예산을 보존하고 최신 백업을 왕복 복원',()=>{
  for(const version of [1,2]) {
    const data=validateData({version,budgets:{[month]:0},records:[record()],...(version===2?{wishes:[wish()]}:{})});
assert.equal(data.version,6);assert.equal(data.records[0].amount,20000);assert.equal(data.budgets[month],0);
    assert.equal(data.records[0].useDays,null);assert.deepEqual(data.inventory,[]);
    assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
  }
  const plan=blankPlan(100000);plan.allocations.cosmetic=40000;plan.reserve=10000;
  const data=validateData({...EMPTY(),inventory:[item()],records:[record({useDays:40,good:'가벼움',bad:'용량',reviewDate:'2025-02-01'})],plans:{[month]:plan},budgets:{[month]:plan.total},schedules:[{id:'hair',title:'커트',category:'hair',amount:10000,nextDate:today(),interval:30,active:true}],onboarding:true});
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
});

test('손상된 보유 제품·일정·계획 전체를 거절하며 원본을 변경하지 않음',()=>{
  const data={...EMPTY(),inventory:[item()]};const original=JSON.stringify(data);
  assert.throws(()=>validateData({...data,inventory:[item(),item()]}),/중복/);
  assert.throws(()=>validateData({...data,schedules:[{id:'bad'}]}));
  assert.throws(()=>validateData({...data,plans:{'2026-13':blankPlan()}}));
  assert.throws(()=>validateData({...data,onboarding:'yes'}));
  assert.throws(()=>validateData({...data,inventory:null}));
  assert.equal(JSON.stringify(data),original);
});

test('사용기간과 평가 날짜·만족 이유를 검증하고 미평가를 그대로 유지',()=>{
  const saved=validateRecord(record({useDays:30,good:'  촉촉함  ',bad:'',reviewDate:'2025-02-01'}));
  assert.equal(saved.good,'촉촉함');assert.equal(saved.rating,null);
  for(const useDays of [0,-1,1.5,Infinity]) assert.throws(()=>validateRecord(record({useDays})));
  assert.throws(()=>validateRecord(record({reviewDate:'2024-12-31'})));
  assert.throws(()=>validateRecord(record({good:'가'.repeat(301)})));
});

test('사용기한이 지난 제품·다 쓴 제품을 사용 후보에서 제외',()=>{
  const data={...EMPTY(),inventory:[item(),item({id:'old',expires:'2020-01-01'}),item({id:'empty',remaining:0,status:'finished'})]};
  assert.equal(availableInventory(data).length,1);
  assert.equal(recommend(data,wish()).hold,true);
  assert.throws(()=>validateInventory(item({remaining:0})));
  assert.throws(()=>validateInventory(item({opened:'2025-02-01',expires:'2025-01-01'})));
});

test('남겨둘 금액과 분야별 예산을 초과하는 계획을 거절',()=>{
  const plan=blankPlan(100000);plan.reserve=30000;plan.allocations.hair=70000;
  assert.equal(validatePlan(plan).reserve,30000);
  assert.throws(()=>validatePlan({...plan,reserve:30001}),/합/);
  assert.throws(()=>validateData({...EMPTY(),budgets:{[month]:0},plans:{[month]:plan}}),/일치/);
  assert.equal(validatePlan(blankPlan(0)).total,0);
});

test('구매 비교에 분야별 잔액과 남겨둘 금액을 함께 반영',()=>{
  const plan=blankPlan(100000);plan.reserve=70000;plan.allocations.cosmetic=30000;
  const data={...EMPTY(),budgets:{[month]:100000},plans:{[month]:plan},records:[record({date:today(),amount:15000})]};
  assert.equal(recommend(data,wish(),'2026-09-14').cap,15000);
  const missing={...EMPTY()};assert.equal(recommend(missing,wish()).cap,30000);
  assert.equal(recommend({...missing,budgets:{[month]:0}},wish()).cap,0);
});

test('누적 평가는 제품 연결 기록만 사용하고 2건부터 개인화 순위에 반영',()=>{
  let data={...EMPTY(),wishes:[wish({id:'first'}),wish({id:'second'})]};
  data=purchaseWish(data,'first','atobarrier',20000,'2025-01-01');
  data=purchaseWish(data,'second','atobarrier',20000,'2025-02-01');
  data.records=data.records.map(entry=>({...entry,rating:5}));
  const result=recommend(data,wish({priority:'experience'}),'2026-09-14');
  assert.equal(result.candidates[0].id,'atobarrier');assert.equal(result.candidates[0].rated,2);
  data.records[1].rating=null;
  const candidate=recommend(data,wish({priority:'experience'}),'2026-09-14').candidates.find(entry=>entry.id==='atobarrier');
  assert.equal(candidate.average,5);assert.equal(candidate.rated,1);
});

test('낮은 평가 한 건은 재배분의 감액 근거로 쓰지 않으며 총 계획 지출은 증가하지 않음',()=>{
  const plan=blankPlan(100000);plan.allocations.cosmetic=40000;plan.allocations.hair=40000;plan.reserve=20000;
  const data={...EMPTY(),records:[record({rating:1})]};
  const before=JSON.stringify(data), result=suggestPlan(data,'2025-03',plan);
  assert.equal(result.plan.allocations.cosmetic,40000);assert.equal(JSON.stringify(data),before);
  data.records.push(record({id:'two',rating:2}));
  const reduced=suggestPlan(data,'2025-03',plan);
  assert.ok(reduced.plan.allocations.cosmetic<40000);
  assert.ok(Object.values(reduced.plan.allocations).reduce((sum,value)=>sum+value,0)<=80000);
  assert.equal(Object.values(reduced.plan.allocations).reduce((sum,value)=>sum+value,0)+reduced.plan.reserve,100000);
});

test('미래 기록 제외·예산 0원·근거 없는 첫 계획은 전액 보유',()=>{
  const data={...EMPTY(),records:[record({date:'2025-05-01',rating:5})]};
  assert.equal(personalStats(data,'cosmetic','2025-03').count,0);
  assert.equal(suggestPlan(data,'2025-03',blankPlan(100000)).plan.reserve,100000);
  assert.equal(suggestPlan(data,'2025-06',blankPlan(0)).plan.reserve,0);
});

test('사용 1일당 비용은 기간 기록만 포함하며 누락은 0으로 바꾸지 않음',()=>{
  const data={...EMPTY(),records:[record({useDays:20,rating:4}),record({id:'other',amount:999999,rating:null})]};
  const stats=personalStats(data,'cosmetic');assert.equal(stats.dailyCost,1000);assert.equal(stats.average,4);assert.equal(stats.timed,1);
  assert.equal(personalStats(EMPTY(),'hair').dailyCost,null);
});

test('다음 달 고민과 보류·기존 사용·포기의 구매 한도를 구분',()=>{
  const future=nextMonth(month);
  const data=validateData({...EMPTY(),wishes:[wish({month:future}),wish({id:'held',month:future,status:'held'}),wish({id:'use',month:future,status:'using'}),wish({id:'abandon',month:future,status:'abandoned'})]});
  assert.equal(plannedPurchases(data,future),30000);assert.equal(plannedPurchases(data,month),0);assert.equal(data.records.length,0);
  assert.equal(nextMonth('2025-12'),'2026-01');
});

test('반복 일정은 누락된 주기를 건너뛰고 소비를 생성하지 않음',()=>{
  const schedule={id:'schedule',title:'커트',category:'hair',amount:30000,nextDate:'2025-01-01',interval:30,active:true};
  assert.equal(advanceSchedule(schedule,'2025-03-01').nextDate,'2025-03-02');
  assert.equal(schedule.nextDate,'2025-01-01');
});

test('삭제 시 연결 해제 후 원본 스냅샷 복원은 기록과 링크를 함께 복원',()=>{
  const before=purchaseWish({...EMPTY(),wishes:[wish()]},'wish','soonjung',10000,today());
  const removed=removeRecord(before,before.records[0].id);
  assert.equal(removed.records.length,0);assert.equal(removed.wishes[0].recordId,null);
  const restored=validateData(before);assert.equal(restored.records.length,1);assert.equal(restored.wishes[0].recordId,restored.records[0].id);
});
