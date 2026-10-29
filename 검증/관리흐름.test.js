import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY, today, validateData, validateWish } from '../화면/계산.js';
import { emptyCare, emptySelection, capturePlan, saveDaily, weekReport, selectedInventory, withInventory, buildSkinPlan } from '../화면/피부계산.js';
import { createSkinUI } from '../화면/피부계획.js';
import { recommend, purchaseWish } from '../화면/추천계산.js';

const date=today(),month=date.slice(0,7);
const product=(extra={})=>({id:'cream-one',title:'내 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:70,opened:'',expires:'',memo:'',...extra});
const profile=(extra={})=>({feel:'dry',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date,...extra});
const fixture=(extra={})=>({...EMPTY(),...extra,skinCare:{...emptyCare(),profile:profile(),...(extra.skinCare??{})}});
const selected=()=>fixture({inventory:[product()],skinCare:{selection:{...emptySelection(),cream:'cream-one'}}});
const wish=(extra={})=>({id:'wish-one',kind:'cream',title:'제품 비교',month,limit:30000,priority:'price',owned:false,status:'pending',productId:null,recordId:null,...extra});

test('버전 4 이전은 상태·경험을 유지하며 제품·실천·과거 계획을 지어내지 않음',()=>{
  const old=fixture({version:4,inventory:[product()]});
  old.skinCare={profile:profile(),checkins:[{date,feeling:'same',adherence:'some',memo:'이전 메모'}]};
  const before=JSON.stringify(old),next=validateData(old);
assert.equal(next.version,6);assert.equal(next.skinCare.checkins[0].memo,'이전 메모');
  assert.equal(next.skinCare.checkins[0].product,null);assert.equal(next.skinCare.checkins[0].feel,null);
  assert.deepEqual(next.skinCare.selection,emptySelection());assert.deepEqual(next.skinCare.days,[]);assert.deepEqual(next.skinCare.history,[]);
  assert.equal(JSON.stringify(old),before);
});

test('명시적으로 선택한 제품만 연결하고 사용 불가 제품은 선택되어도 제외',()=>{
  assert.deepEqual(selectedInventory(fixture({inventory:[product()]})),[]);
  const data=selected();assert.equal(selectedInventory(data)[0].id,'cream-one');
  for(const extra of [{comfort:'unknown'},{comfort:'uncomfortable'},{remaining:0,status:'finished'},{expires:'2020-01-01'}]){
    assert.deepEqual(selectedInventory({...data,inventory:[product(extra)]}),[]);
  }
  assert.throws(()=>validateData({...data,inventory:[]}),/연결/);
  assert.throws(()=>validateData({...data,inventory:[product({kind:'cleanser'})]}),/연결/);
});

test('내 화장대의 클렌저·보습제·선크림을 기본 루틴에 모두 연결한다',()=>{
  const inventory=['cleanser','cream','sunscreen'].map((kind,index)=>product({id:`item-${index}`,kind,title:`내 ${kind}`}));
  const plan=buildSkinPlan(fixture({inventory}),date);
  assert.deepEqual(plan.morning.map(step=>step.product?.id),['item-0','item-1','item-2']);
  assert.deepEqual(plan.evening.map(step=>step.product?.id),['item-0','item-1']);
  const unavailable=buildSkinPlan(fixture({inventory:inventory.map(item=>item.kind==='cream'?{...item,comfort:'uncomfortable'}:item)}),date);
  assert.equal(unavailable.morning.find(step=>step.kind==='cream').product,null);
});

test('완료 체크는 날짜별 하나이며 취소·아침저녁·당시 제품을 독립 보존',()=>{
  const original=selected();const morning=saveDaily(original,'morning',true);
  assert.equal(original.skinCare.days.length,0);assert.equal(morning.skinCare.days.length,1);
  const evening=saveDaily(morning,'evening',true);
  assert.equal(evening.skinCare.days.length,1);assert.equal(evening.skinCare.days[0].morning,true);
  const undone=saveDaily(evening,'morning',false);
  assert.equal(undone.skinCare.days[0].morning,false);assert.deepEqual(undone.skinCare.days[0].morningProducts,[]);
  assert.equal(undone.skinCare.days[0].eveningProducts[0].title,'내 보습제');
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(undone))).skinCare,undone.skinCare);
});

test('제품 수정·삭제 후에도 완료 당시 제품과 계획 이력은 덮어쓰지 않음',()=>{
  const data=saveDaily(selected(),'morning',true),saved=JSON.stringify(data.skinCare.history);
  const renamed=withInventory(data,[product({title:'바뀐 이름'})]);
  const changed=capturePlan(renamed,'products');assert.equal(changed.skinCare.history.length,2);
  assert.equal(JSON.stringify(data.skinCare.history),saved);
  assert.equal(changed.skinCare.days[0].morningProducts[0].title,'내 보습제');
  const removed=validateData(withInventory(changed,[]));
  assert.equal(removed.skinCare.selection.cream,null);
  assert.equal(removed.skinCare.history[0].steps.find(step=>step.product)?.product.title,'내 보습제');
});

test('같은 계획은 중복 보관하지 않고 변경된 최근 60건만 유지',()=>{
  let data=capturePlan(selected(),'profile');assert.equal(capturePlan(data,'products').skinCare.history.length,1);
  for(let index=0;index<65;index++)data=capturePlan({...data,skinCare:{...data.skinCare,profile:profile({budget:index})}},'profile');
  assert.equal(data.skinCare.history.length,60);assert.equal(data.skinCare.history.at(-1).cap,64);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))).skinCare.history,data.skinCare.history);
});

test('불편함 중에는 새 완료를 막지만 기존 완료는 취소 가능',()=>{
  const data=saveDaily(selected(),'morning',true);
  const paused={...data,skinCare:{...data.skinCare,profile:profile({discomfort:'yes'})}};
  assert.throws(()=>saveDaily(paused,'evening',true),/불편함/);
  const undone=saveDaily(paused,'morning',false);
  assert.equal(undone.skinCare.days[0].morning,false);assert.equal(undone.skinCare.history.at(-1).paused,true);
  assert.deepEqual(undone.skinCare.history.at(-1).steps,[]);
});

test('주간 비교는 연도 경계·이전 7일을 나누고 미기록은 null로 유지',()=>{
  const data=fixture();
  data.skinCare.days=['2024-12-20','2024-12-21','2024-12-27','2024-12-28','2025-01-03'].map(day=>({date:day,morning:true,evening:false,morningProducts:[],eveningProducts:[]}));
  data.skinCare.checkins=[{date:'2024-12-27',feeling:'same',adherence:'some',memo:'',feel:'dry'}, {date:'2025-01-03',feeling:'comfortable',adherence:'yes',memo:'',feel:'balanced'}];
  const report=weekReport(data,'2025-01-03');
  assert.equal(report.previous.start,'2024-12-21');assert.equal(report.previous.end,'2024-12-27');
  assert.equal(report.current.start,'2024-12-28');assert.equal(report.current.morning,2);assert.equal(report.previous.morning,2);
  assert.equal(report.current.lastFeel.feel,'balanced');assert.equal(report.previous.lastFeel.feel,'dry');
  assert.equal(report.days.filter(day=>day.entry===null).length,5);assert.equal(report.current.evening,0);
});

test('손상된 실천·이력·선택 백업 전체를 거절하고 원본은 보존',()=>{
  const data=saveDaily(selected(),'morning',true),before=JSON.stringify(data);
  const invalid=[
    {selection:{cream:'cream-one'}},
    {days:[{...data.skinCare.days[0],morning:false}]},
    {days:[data.skinCare.days[0],data.skinCare.days[0]]},
    {days:[{...data.skinCare.days[0],date:'2099-01-01'}]},
    {history:[{...data.skinCare.history[0],steps:[{period:'morning',kind:'cream',text:'단계',product:{id:'sun',title:'선크림',kind:'sunscreen'}}]}]},
    {history:[data.skinCare.history[0],data.skinCare.history[0]]},
    {history:[{...data.skinCare.history[0],paused:true}]},
    {profile:null},
  ];
  for(const change of invalid)assert.throws(()=>validateData({...data,skinCare:{...data.skinCare,...change}}));
  assert.equal(JSON.stringify(data),before);
});

test('제품 종류별 후보·보유품·가격 확인일을 구분하고 교차 구매 연결 차단',()=>{
  const data=fixture({inventory:[product()],wishes:[wish({kind:'cleanser'})]});
  const cleanser=recommend(data,data.wishes[0],'2026-09-22');
  assert.equal(cleanser.candidates.length,1);assert.equal(cleanser.candidates[0].total,14500);
  assert.equal(cleanser.hold,false);assert.equal(cleanser.inventory.length,0);
  const sunscreen=recommend(data,wish({kind:'sunscreen'}),'2026-09-22');
  assert.equal(sunscreen.candidates.length,1);assert.equal(sunscreen.candidates[0].total,26350);
  assert.equal(recommend(data,wish(),'2026-10-16').stale,true);
  assert.equal(recommend(data,wish({kind:'cleanser'}),'2026-10-16').stale,false);
  assert.equal(recommend(data,wish({kind:'cleanser'}),'2026-09-01').candidates[0].eligible,false);
  assert.throws(()=>purchaseWish(data,'wish-one','soonjung',12000,date),/제품/);
  assert.equal(purchaseWish(data,'wish-one','soonjung-cleanser',14500,date).wishes[0].kind,'cleanser');
  assert.equal(validateWish(wish({kind:undefined})).kind,'cream');assert.throws(()=>validateWish(wish({kind:'drug'})));
});

async function submitFeedback(data,fields,{fail=false,demo=false}={}) {
  const oldDocument=globalThis.document,oldFormData=globalThis.FormData,listeners={};
  let saved=data,navigated=null,calls=0;
  const error={textContent:''},button={disabled:false};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;}};
  globalThis.FormData=class {get(name){return fields[name]??'';}};
  try {
    createSkinUI({state:()=>({data:saved,effective:saved,demo,busy:false,storageError:false}),toast(){},navigate:value=>{navigated=value;},persist:async next=>{calls++;if(fail)return false;saved=validateData(next);return true;}});
    await listeners.submit({target:{id:'skin-checkin-form',querySelector:selector=>selector==='.form-error'?error:button},preventDefault(){}});
    return {data:saved,navigated,calls,error:error.textContent,disabled:button.disabled};
  }finally{globalThis.document=oldDocument;globalThis.FormData=oldFormData;}
}

test('제품 연결 불편 피드백은 해당 제품만 제외하고 하루 기록을 수정',async()=>{
  const original=selected();original.inventory.push(product({id:'cream-two',title:'다른 보습제'}));
  const result=await submitFeedback(original,{feeling:'uncomfortable',adherence:'some',product:'cream-one',memo:'따가웠어요',feel:'dry'});
  assert.equal(result.navigated,'records');assert.equal(result.data.skinCare.checkins[0].product.id,'cream-one');
  assert.equal(result.data.inventory[0].comfort,'uncomfortable');assert.equal(result.data.inventory[1].comfort,'comfortable');
  assert.equal(buildSkinPlan(result.data).paused,true);assert.equal(original.skinCare.checkins.length,0);
  const changed=await submitFeedback(result.data,{feeling:'comfortable',adherence:'yes',product:'cream-one',memo:'현재는 편안함',feel:'balanced'});
  assert.equal(changed.data.skinCare.checkins.length,1);assert.equal(buildSkinPlan(changed.data).paused,false);
  assert.equal(changed.data.inventory[0].comfort,'uncomfortable');assert.deepEqual(selectedInventory(changed.data),[]);
});

test('저장 실패·샘플 피드백은 원본을 보존하고 성공 이동하지 않음',async()=>{
  const original=selected(),before=JSON.stringify(original),fields={feeling:'comfortable',adherence:'yes',memo:'저장 전 입력'};
  const failed=await submitFeedback(original,fields,{fail:true});
  assert.equal(failed.data,original);assert.equal(failed.navigated,null);assert.match(failed.error,/저장하지 못했어요/);assert.equal(failed.disabled,false);
  const sample=await submitFeedback(original,fields,{demo:true});assert.equal(sample.calls,0);assert.equal(sample.data,original);
  assert.equal(JSON.stringify(original),before);
});

test('이력의 제품명·메모는 이스케이프하며 목표 재사용·4개 메뉴 계약 유지',()=>{
  const oldDocument=globalThis.document;globalThis.document={addEventListener(){}};
  try {
    const data=capturePlan(selected(),'products');data.skinCare.history[0].steps[1].product.title='<img src=x onerror=alert(1)>';
    const html=createSkinUI({state:()=>({data,effective:data})}).history();
    assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
    const empty=fixture({goals:{selected:['save'],note:''},skinCare:{profile:null}});
    const form=createSkinUI({state:()=>({data:empty,effective:empty})}).render();
    assert.ok(form.includes('value="save" selected'));assert.ok(form.includes('적용 목표'));
    const app=readFileSync(new URL('../화면/앱.js',import.meta.url),'utf8');
    assert.ok(app.includes("const navs=[['home','home','홈'],['care','drop','분석·계획'],['records','book','기록·리포트'],['settings','person','마이']];"));
  }finally{globalThis.document=oldDocument;}
});
