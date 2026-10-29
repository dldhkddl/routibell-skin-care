import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { PHOTO_CARE_TIPS, careTip } from '../화면/관리팁.js';
import { buildSkinPlan, saveDaily, validateSkinProfile } from '../화면/피부계산.js';

const date = today();
const profile = (extra = {}) => ({feel: 'balanced', concerns: [], sensitivity: 'rare', discomfort: 'no', priority: 'comfort', budget: null, updatedAt: date, ...extra});
const product = (kind, id = kind, comfort = 'comfortable') => ({id, title: `${kind} 제품`, kind, category: 'cosmetic', comfort, status: 'available', remaining: 70, opened: '', expires: '', memo: ''});
const observation = scores => ({provider: 'youcam', version: 'v2.1', date, focus: Object.keys(scores)[0], actions: Object.keys(scores), scores});
const dataWith = (scores, products = [], extra = {}) => {
  const data = EMPTY();
  data.skinCare.profile = profile(extra);
  data.skinCare.observation = observation(scores);
  data.inventory = products;
  return data;
};

test('16개 분석 항목에 진단이 아닌 관리 팁과 확인 가능한 출처가 있다', () => {
  assert.deepEqual(Object.keys(PHOTO_CARE_TIPS).sort(), [...PHOTO_ACTIONS].sort());
  for (const type of PHOTO_ACTIONS) {
    const tip = PHOTO_CARE_TIPS[type];
    assert.ok(tip.tips.length >= 2 && tip.tips.length <= 3 && tip.source.startsWith('https://'));
    assert.equal(new Set(tip.tips).size,tip.tips.length);
    for(const line of tip.tips)assert.doesNotMatch(line, /완치|치료|진단|피부염/);
  }
});

test('확인된 내 제품만 제안하며 불편한 제품과 브랜드명은 쓰지 않는다', () => {
  const data = dataWith({moisture: 40}, [product('cream')]);
  data.skinCare.selection.cream = 'cream';
  assert.match(careTip('moisture', data, date).product, /내 화장대의 보습제/);
  data.inventory[0].comfort = 'uncomfortable';
  assert.doesNotMatch(careTip('moisture', data, date).product, /내 화장대의 보습제/);
  data.inventory = [product('serum')];
  assert.match(careTip('firmness', data, date).action, /탄력/);
});

test('같은 사람의 연속 분석은 16개 항목에서 같은 관리 팁을 반복하지 않는다',()=>{
  for(const type of PHOTO_ACTIONS){
    const data=dataWith({[type]:55});
    const reference={provider:'youcam',version:'v2.1',date:'2025-03-01',focus:type,actions:[type],scores:type==='skin_type'?{}:{[type]:55},...(type==='skin_type'?{skinTypes:{whole:'Combination'}}:{})};
    const first={id:'first',completedAt:'2025-03-01T06:00:00.000Z',reference,condition:'unknown',baselineId:null};
    const second={id:'second',completedAt:'2025-03-15T06:00:00.000Z',reference:{...reference,date:'2025-03-15'},condition:'matched',baselineId:'first'};
    data.skinCare.observations=[first,second];
    data.skinCare.observation=second.reference;
    const result=entry=>({completedAt:entry.completedAt,items:[{type,rawScore:type==='skin_type'?null:55}]});
    const firstTip=careTip(type,data,date,result(first));
    data.skinCare.profile.updatedAt='2025-03-10';
    const secondTip=careTip(type,data,date,result(second));
    assert.notEqual(firstTip.action,secondTip.action,type);
    assert.deepEqual(careTip(type,data,date,result(second)),secondTip);
  }
});

test('목표 고민은 기존 백업과 함께 보존하며 세 가지까지만 받는다', () => {
  const expanded = validateSkinProfile(profile({concerns: ['redness','pigment','eye']}));
  assert.deepEqual(expanded.concerns, ['redness','pigment','eye']);
  assert.throws(() => validateSkinProfile(profile({concerns: ['redness','pigment','eye','pore']})));
});

test('사진 집중 항목과 가진 제품에 따라 저녁 루틴이 달라지고 기록에 남는다', () => {
  const products = [product('cleanser'), product('cream'), product('sunscreen'), product('serum'), product('eyecream')];
  const moisture = dataWith({moisture: 40, acne: 90}, products);
  moisture.skinCare.selection = {cleanser: 'cleanser', cream: 'cream', sunscreen: 'sunscreen'};
  const first = buildSkinPlan(moisture, date);
  assert.deepEqual(first.focused, ['moisture']);
  assert.ok(first.evening.some(step => step.kind === 'serum'));
  const saved = validateData(saveDaily(moisture, 'evening', true, date));
  assert.ok(saved.skinCare.days[0].eveningProducts.some(item => item.kind === 'serum'));
  const acne = dataWith({acne: 35, moisture: 90}, products);
  const second = buildSkinPlan(acne, date);
  assert.deepEqual(second.focused, ['acne']);
  assert.ok(!second.evening.some(step => step.kind === 'serum'));
  assert.ok(second.evening.some(step => step.kind === 'cream'));
});
