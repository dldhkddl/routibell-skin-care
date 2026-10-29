import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData } from '../화면/계산.js';
import { addPurchasePrice, expectedPrice, markBudgetAlert, monthlyBudgetPlan, nextBudgetAlert, renewProduct, replacementDays, updateProductStatus } from '../화면/예산계산.js';
import { formatBudgetInput, renderBudgetForm, renderBudgetResult } from '../화면/예산화면.js';
import { managerSheetState } from '../화면/체크인후.js';

const asOf='2026-09-30';
const product=(kind,id,opened='2026-09-01',extra={})=>({id,title:kind,category:'cosmetic',kind,comfort:'unknown',status:'available',usageState:'using',remaining:50,registeredAt:opened,opened,finishedAt:'',expires:'',memo:'',...extra});
const base=(inventory=[],budget=50000)=>({...EMPTY(),inventory,budgets:{'2026-09':budget}});

test('다 쓴 날을 저장하고 종류별 실제 교체 주기의 평균을 다음 예측에 사용',()=>{
  let data=base([product('sunscreen','sun-one','2026-08-01'),product('sunscreen','sun-two','2026-08-20')]);
  data=validateData(updateProductStatus(data,'sun-one','finished','2026-09-01'));
  data=validateData(updateProductStatus(data,'sun-two','finished','2026-09-20'));
  assert.equal(data.budgetCare.cycles.length,2);
  assert.equal(replacementDays(data,'sunscreen'),31);
  assert.equal(validateData(updateProductStatus(data,'sun-one','finished','2026-09-30')).budgetCare.cycles.length,2);
  const recent={...data,inventory:[...data.inventory,product('sunscreen','sun-three','2026-09-10')]};
  assert.equal(nextBudgetAlert(recent,asOf)?.id,'sun-three');
  assert.equal(validateData(JSON.parse(JSON.stringify(recent))).budgetCare.cycles.length,2);
});

test('기본 알림 주차에 한 번만 묻고 같은 제품은 다시 알리지 않음',()=>{
  const data=base([product('sunscreen','sun','2026-09-02')]);
  assert.equal(nextBudgetAlert(data,'2026-09-29'),null);
  assert.equal(nextBudgetAlert(data,asOf)?.id,'sun');
  const shown=validateData(markBudgetAlert(data,'sun'));
  assert.equal(nextBudgetAlert(shown,asOf),null);
  assert.equal(markBudgetAlert(shown,'sun'),shown);
  assert.match(managerSheetState(data,asOf,12).first,/선크림이 곧 떨어질 것 같아요/);
});

test('곧 떨어지는 필수품, 집중 항목, 빠진 기본 단계 순으로 배분하고 부족하면 미룸',()=>{
  const data=base([
    product('sunscreen','sun','2026-09-01',{usageState:'low'}),
    product('cream','cream','2026-09-01',{usageState:'low'}),
    product('cleanser','wash','2026-09-01',{usageState:'low'}),
  ],39000);
  data.skinCare.profile={concerns:['texture'],updatedAt:'2026-09-01'};
  const result=monthlyBudgetPlan(data,'2026-09',asOf);
  assert.deepEqual(result.items.map(item=>item.kind),['sunscreen','cream','cleanser','toner']);
  assert.deepEqual(result.items.map(item=>item.status),['이번 달','다음 달로 미뤄요','다음 달로 미뤄요','다음 달로 미뤄요']);
  assert.equal(result.remaining,19000);
  assert.ok(result.lines.some(line=>line.includes('아껴둬요')));
  const missing=monthlyBudgetPlan(base([],50000),'2026-09',asOf);
  assert.deepEqual(missing.items.map(item=>item.kind),['sunscreen','cream','cleanser']);
});

test('필요한 종류가 없으면 더 사라고 하지 않고 남은 예산을 아껴둠',()=>{
  const data=base(['sunscreen','cream','cleanser'].map(kind=>product(kind,kind,asOf)));
  const result=monthlyBudgetPlan(data,'2026-09',asOf);
  assert.deepEqual(result.items,[]);
  assert.match(result.lines[0],/안 사도 돼요/);
  assert.equal(result.remaining,50000);
  assert.match(renderBudgetResult(data,'2026-09'),/이번 달은 안 사도 돼요. 가진 제품부터 써요./);
  assert.doesNotMatch(renderBudgetResult(data,'2026-09'),/<table/);
  assert.doesNotMatch(monthlyBudgetPlan(base([],0),'2026-09',asOf).lines.join(' '),/남은 예산/);
});

test('금액 입력은 쉼표로 보이고 화살표가 없으며 새로 사면 개봉일과 상태를 다시 시작한다',()=>{
  assert.match(renderBudgetForm('2026년 9월',50000),/value="50,000"/);
  assert.doesNotMatch(renderBudgetForm('2026년 9월',50000),/type="number"/);
  assert.equal(formatBudgetInput('5,0000원'), '50,000');
  assert.equal(formatBudgetInput('12345678901234567890'), '12,345,678,901,234,567,890');
  let data=base([product('sunscreen','sun','2026-08-01')]);
  data=validateData(updateProductStatus(data,'sun','finished','2026-09-01'));
  data=validateData(markBudgetAlert(data,'sun'));
  const renewed=validateData(renewProduct(data,'sun',21000,'2026-09-30'));
  assert.equal(renewed.inventory[0].status,'available');
  assert.equal(renewed.inventory[0].remaining,100);
  assert.equal(renewed.inventory[0].opened,'2026-09-30');
  assert.equal(renewed.budgetCare.purchases.at(-1).price,21000);
  assert.deepEqual(renewed.budgetCare.notified,[]);
  assert.equal(renewed.budgetCare.cycles.length,1);
  assert.throws(()=>renewProduct(renewed,'sun'));
});

test('실제 최근 구매 가격이 내부 계산을 바꾸고 화면은 범위만 표시',()=>{
  let data=base([],50000);
  data=addPurchasePrice(data,'sunscreen',33000,'2026-09-10','buy-one');
  data=validateData(addPurchasePrice(data,'sunscreen',27000,'2026-09-20','buy-two'));
  assert.equal(expectedPrice(data,'sunscreen'),27000);
  assert.equal(monthlyBudgetPlan(data,'2026-09',asOf).items[0].estimate,27000);
  const html=renderBudgetResult(data,'2026-09');
  assert.match(html,/보통 .*원대/);
  assert.doesNotMatch(html,/27000|27,000|브랜드|쇼핑/);
  assert.throws(()=>validateData({...data,budgetCare:{...data.budgetCare,purchases:[{id:'bad',kind:'cream',price:-1,date:asOf}]}}));
});

test('기본 가격표가 없는 화장대 종류도 상태와 가격을 안전하게 기록',()=>{
  let data=base([product('retinol','retinol-one','2026-09-01')]);
  data=validateData(updateProductStatus(data,'retinol-one','finished',asOf));
  data=validateData(addPurchasePrice(data,'retinol',22000,asOf,'retinol-buy'));
  assert.equal(data.budgetCare.cycles[0].kind,'retinol');
  assert.equal(expectedPrice(data,'retinol'),22000);
  assert.equal(nextBudgetAlert(data,asOf),null);
});

test('과거 등록일을 알 수 없는 제품은 완료할 수 있지만 임의의 주기를 학습하지 않음',()=>{
  const data=base([product('cream','old','',{registeredAt:'',opened:''})]);
  const saved=validateData(updateProductStatus(data,'old','finished',asOf));
  assert.equal(saved.inventory[0].status,'finished');
  assert.deepEqual(saved.budgetCare.cycles,[]);
});
