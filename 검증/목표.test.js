import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData, EMPTY } from '../화면/계산.js';
import { addStartProducts, START_PRODUCT_KINDS, validateGoals } from '../화면/시작흐름.js';
import { buildSkinPlan } from '../화면/피부계산.js';

test('이전 백업에 목표가 없어도 기존 기록을 보존',()=>{
  const data={version:3,budgets:{'2026-09':100000},records:[],wishes:[],inventory:[],plans:{},schedules:[],onboarding:true};
  const result=validateData(data);
  assert.deepEqual(result.goals,{selected:[],note:''});assert.equal(result.budgets['2026-09'],100000);
});
test('목표 선택·직접 입력은 백업 복원으로 유지',()=>{
  const data=validateData({...EMPTY(),goals:{selected:['hair','save'],note:'  내 취향 <기록>  '}});
  assert.equal(data.goals.note,'내 취향 <기록>');assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
});
test('중복·알 수 없는 목표·과도한 선택과 잘못된 형식 거절',()=>{
  for(const goals of [null,{selected:['hair','hair'],note:''},{selected:['missing'],note:''},{selected:['hair','skin','save','routine'],note:''},{selected:[],note:'가'.repeat(201)}])assert.throws(()=>validateGoals(goals));
});
test('첫 실행에서 고른 제품 8종은 중복 없이 화장대와 루틴에 이어진다',()=>{
  let index=0;
  const data=addStartProducts(EMPTY(),START_PRODUCT_KINDS,'2026-09-30',()=>`start-${++index}`);
  assert.equal(data.inventory.length,8);
  assert.ok(data.inventory.every(item=>item.title.startsWith('내 ')&&item.comfort==='unknown'));
  assert.equal(addStartProducts(data,['cream'],'2026-09-30',()=>`start-${++index}`).inventory.length,8);
  data.skinCare.profile={feel:'balanced',sensitivity:'rare',discomfort:'no',concerns:[],priority:'comfort',budget:null,updatedAt:'2026-09-30'};
  const plan=buildSkinPlan(data,'2026-09-30');
  assert.ok(plan.morning.some(step=>step.kind==='cleanser'&&step.product?.title==='내 클렌저'));
  assert.ok(plan.morning.some(step=>step.kind==='sunscreen'&&step.product?.title==='내 선크림'));
  assert.throws(()=>addStartProducts(data,['unknown']));
});
