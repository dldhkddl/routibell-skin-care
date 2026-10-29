import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { blankPlan, validateInventory } from '../화면/계획계산.js';
import { emptyCare, validateSkinCare, validateSkinProfile, validateCheckin, buildSkinPlan, careAllowance } from '../화면/피부계산.js';
import { createSkinUI } from '../화면/피부계획.js';
import { recommend } from '../화면/추천계산.js';
import { readData, writeData } from '../화면/저장.js';

const date=today(),month=date.slice(0,7);
const profile=(extra={})=>({feel:'dry',concerns:['dryness'],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date,...extra});
const dataWith=(extra={})=>({...EMPTY(),...extra,skinCare:{...emptyCare(),profile:profile(),...(extra.skinCare??{})}});
const record=(extra={})=>({id:'one',title:'보습제',category:'cosmetic',amount:10000,date,rating:null,repurchase:null,memo:'',...extra});
const item=(extra={})=>({id:'cream',title:'내 크림',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:50,opened:'',expires:'',memo:'',...extra});
const checkin=(extra={})=>({date,feeling:'same',adherence:'yes',memo:'',product:null,feel:null,...extra});
const renderUI=(data)=>{
  const previous=globalThis.document;
  globalThis.document={addEventListener(){}};
  try {return createSkinUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false})});}
  finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
};

test('버전 1·2·3 백업은 기록·예산을 보존하고 피부 계획을 빈 상태로 이전',()=>{
  for(const version of [1,2,3]){
    const old={...EMPTY(),version,records:[record()],budgets:{[month]:0}};
    delete old.skinCare;
    const saved=validateData(old);
assert.equal(saved.version,6);assert.deepEqual(saved.skinCare,emptyCare());
    assert.equal(saved.records[0].amount,10000);assert.equal(saved.budgets[month],0);
    assert.equal(old.skinCare,undefined);
  }
  assert.throws(()=>validateData({...EMPTY(),skinCare:undefined}));
});

test('피부 상태·사용 경험·사용 제품은 최신 백업 왕복 후 유지',()=>{
  const data=validateData(dataWith({inventory:[item()],skinCare:{profile:profile({budget:0}),checkins:[checkin({memo:'  느낌 <기록>  '})]}}));
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
  assert.equal(data.skinCare.profile.budget,0);assert.equal(data.skinCare.checkins[0].memo,'느낌 <기록>');
  assert.equal(validateInventory(item({comfort:undefined})).comfort,'unknown');
  for(const kind of ['cleanser','sunscreen','cream','other'])assert.equal(validateInventory(item({kind})).kind,kind);
  assert.throws(()=>validateInventory(item({comfort:'safe'})));
});

test('잘못된 상태·금액·날짜·중복 경험은 전체 복원 거절',()=>{
  for(const extra of [{feel:'diagnosis'},{feel:'toString'},{concerns:['oil','oil']},{concerns:['oil','dryness','texture','dullness']},{budget:-1},{budget:0.5},{budget:''},{sensitivity:null},{updatedAt:'2026-02-30'},{updatedAt:'2099-12-31'}])assert.throws(()=>validateSkinProfile(profile(extra)));
  for(const extra of [{feeling:'constructor'},{adherence:'maybe'},{memo:'가'.repeat(201)},{date:'2099-01-01'}])assert.throws(()=>validateCheckin(checkin(extra)));
  assert.throws(()=>validateSkinCare({profile:profile(),checkins:[checkin(),checkin()]}));
  assert.throws(()=>validateSkinCare({profile:null,checkins:[checkin()]}));
  const data=dataWith();const original=JSON.stringify(data);
  assert.throws(()=>validateData({...data,skinCare:{profile:profile(),checkins:[{}]}}));
  assert.equal(JSON.stringify(data),original);
});

test('상태 없이는 계획·가짜 진단을 만들지 않고 건조·유분·민감에 따라 이유 변경',()=>{
  assert.equal(buildSkinPlan(EMPTY()),null);
  const dry=buildSkinPlan(dataWith());assert.match(dry.title,/보습/);assert.equal(dry.morning.length,3);assert.equal(dry.evening.length,2);
  const oily=buildSkinPlan(dataWith({skinCare:{profile:profile({feel:'oily',concerns:['oil'],sensitivity:'often'}),checkins:[]}}));
  assert.match(oily.morning[1].text,/가벼운/);assert.ok(oily.cautious);assert.ok(oily.reasons.some(reason=>reason.includes('민감')));
  const unsure=buildSkinPlan(dataWith({skinCare:{profile:profile({feel:'unsure',concerns:['texture']}),checkins:[]}}));
  assert.ok(unsure.reasons.some(reason=>reason.includes('임의로 결정하지')));assert.ok(unsure.reasons.some(reason=>reason.includes('각질 제거제')));
});

test('현재 불편함 또는 마지막 불편 기록은 제품 사용 순서 제안을 중지',()=>{
  const direct=buildSkinPlan(dataWith({skinCare:{profile:profile({discomfort:'yes'}),checkins:[]}}));
  assert.ok(direct.paused);assert.deepEqual(direct.morning,[]);
  const byFeedback=buildSkinPlan(dataWith({skinCare:{profile:profile(),checkins:[checkin({feeling:'uncomfortable'})]}}));
  assert.ok(byFeedback.paused);assert.deepEqual(byFeedback.evening,[]);
  const old='2020-01-01';
  const recovered=buildSkinPlan(dataWith({skinCare:{profile:profile(),checkins:[checkin({date:old,feeling:'uncomfortable'}),checkin({feeling:'comfortable'})]}}));
  assert.equal(recovered.paused,false);
});

test('사용기한·잔량·직접 표시한 사용 경험·제품 종류로 보유품 연결',()=>{
  const data=dataWith({skinCare:{selection:{cleanser:'wash',cream:'cream',sunscreen:'sun'}},inventory:[item({id:'old',expires:'2020-01-01'}),item({id:'empty',remaining:0,status:'finished'}),item({id:'unknown',comfort:'unknown'}),item({id:'bad',comfort:'uncomfortable'}),item(),item({id:'wash',kind:'cleanser'}),item({id:'sun',kind:'sunscreen'})]});
  const plan=buildSkinPlan(data);assert.equal(plan.comfortableProducts,3);
  assert.deepEqual(plan.morning.map(step=>step.product.id),['wash','cream','sun']);assert.deepEqual(plan.missing,[]);
  assert.equal(buildSkinPlan(dataWith({inventory:[item({comfort:'unknown'})]})).missing.length,3);
});

test('미설정과 0원 구분, 기존 지출·배분·보유금 차감 후 가장 작은 한도',()=>{
  assert.equal(careAllowance(EMPTY(),profile()).cap,null);
  assert.equal(careAllowance(EMPTY(),profile({budget:0})).cap,0);
  assert.equal(careAllowance({...EMPTY(),budgets:{[month]:0}},profile()).cap,0);
  const plan=blankPlan(100000);plan.reserve=20000;plan.allocations.cosmetic=20000;plan.allocations.skin=10000;
  const data=dataWith({budgets:{[month]:100000},plans:{[month]:plan},records:[record(),record({id:'hair',category:'hair',amount:65000})]});
  assert.equal(careAllowance(data,profile({budget:50000})).cap,5000);
  assert.equal(careAllowance({...data,records:[record({amount:150000})]},profile()).cap,0);
  assert.equal(careAllowance({...EMPTY(),records:[record({date:'2020-01-01'})]},profile({budget:30000})).cap,30000);
});

test('절약·꾸준함 목표와 실천 어려움 반영, 좋거나 변화 없다고 구매 늘리지 않음',()=>{
  const data=dataWith({goals:{selected:['save','routine'],note:'특정 성분 추천'},skinCare:{profile:profile({budget:30000}),checkins:[checkin({adherence:'no'})]}});
  const plan=buildSkinPlan(data);
  assert.ok(plan.reasons.some(reason=>reason.includes('절약')));assert.ok(plan.reasons.some(reason=>reason.includes('실천 어려움')));
  assert.ok(plan.reasons.some(reason=>reason.includes('지출을 늘리지')));assert.equal(plan.allowance.cap,30000);
  assert.ok(!plan.reasons.some(reason=>reason.includes('특정 성분')));
  data.skinCare.checkins[0].feeling='comfortable';
  assert.equal(buildSkinPlan(data).allowance.cap,30000);
});

test('제품 가격 비교도 피부 계획의 월 상한을 초과하지 않음',()=>{
  const data=dataWith({skinCare:{profile:profile({budget:15000}),checkins:[]},records:[record()]});
  const wish={month,limit:100000,owned:false,priority:'price'};
  assert.equal(recommend(data,wish).cap,5000);
  assert.ok(recommend(data,wish).reasons.some(reason=>reason.includes('피부 계획')));
});

test('불편했던 보유 제품은 기존 제품 사용 후보에도 포함하지 않음',()=>{
  const data=dataWith({inventory:[item({comfort:'uncomfortable'})]});
  const result=recommend(data,{month,limit:100000,owned:false,priority:'price'});
  assert.deepEqual(result.inventory,[]);
  assert.equal(buildSkinPlan(data).morning[1].product,null);
});

test('관리 화면은 제품명을 이스케이프하고 동의와 출처는 필요한 위치에 표시한다',()=>{
  const data=dataWith({inventory:[item({title:'<img src=x onerror=alert(1)>'})],skinCare:{profile:profile(),checkins:[checkin({memo:'<script>실행</script>'})]}});
  const ui=renderUI(data),html=ui.render()+ui.review();
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('name="consent" required'));
  assert.ok(!html.includes('data-care="delete"'));assert.ok(!html.includes('사용감 남기기·수정'));
  assert.ok(ui.sources().includes('계획 계산은 앱 자체 규칙'));assert.ok(ui.sources().includes('aad.org'));
  assert.match(renderUI(EMPTY()).render(),/사진 분석 전, 피부 느낌만 알려주세요/);
});

test('피부 구매 상한 입력은 관리 화면에서 마이 예산 화면으로 옮기고 0원도 유지한다',()=>{
  const ui=renderUI(dataWith({skinCare:{profile:profile({budget:0})}}));
  assert.doesNotMatch(ui.render(),/한 달 구매 상한 \(원\)/);
  assert.match(ui.render(),/type="hidden" name="budget" value="0"/);
  assert.match(ui.skinBudget(),/0원 · 수정하기/);
  assert.match(ui.skinBudget(),/id="skin-budget-form"/);
});

test('피부 정보 삭제는 소비·예산·목표·보유 제품에 영향을 주지 않음',()=>{
  const data=validateData(dataWith({records:[record()],inventory:[item()],budgets:{[month]:10000},goals:{selected:['skin'],note:'목표'}}));
  const cleared=validateData({...data,skinCare:emptyCare()});
  assert.deepEqual({...cleared,skinCare:data.skinCare},data);
});

test('피부 상태 저장 실패·손상 백업은 기존 저장 문자열을 유지',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let stored=JSON.stringify(validateData(dataWith()));const original=stored;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:()=>{throw Error('저장 실패');}}});
  try {
    await assert.rejects(writeData({...dataWith(),skinCare:emptyCare()}));assert.equal(stored,original);
    await assert.rejects(writeData({...dataWith(),skinCare:{profile:profile({budget:-1}),checkins:[]}}));assert.equal(stored,original);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}}});
    await writeData(dataWith());assert.deepEqual((await readData()).skinCare,dataWith().skinCare);
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
