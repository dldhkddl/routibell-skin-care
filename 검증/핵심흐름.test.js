import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { buildSkinPlan, saveDaily, saveSkinCheckin, emptyCare } from '../화면/피부계산.js';
import { photoHistory, savePhotoObservation, removePhotoObservation, validatePhotoHistory } from '../화면/사진이력.js';
import { monthRange, monthlyReport, monthlyProposal, applyMonthlyProposal, latestReportMonth } from '../화면/월간계산.js';
import { renderRealReport, createReportUI } from '../화면/실제리포트.js';
import { readData, writeData } from '../화면/저장.js';
import { blankPlan } from '../화면/계획계산.js';
import { createPhotoUI } from '../화면/사진분석.js';

const month='2025-03',asOf='2025-03-31';
const profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:'2025-03-01'};
const product={id:'own-cream',title:'내 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:60,opened:'2025-02-01',expires:'2099-12-31',memo:''};
const fixture=()=>({...EMPTY(),budgets:{[month]:100000},inventory:[{...product}],skinCare:{...emptyCare(),profile:{...profile},selection:{cleanser:null,cream:product.id,sunscreen:null}}});
const result=(date,score=70,time='09:00:00.000Z')=>({provider:'youcam',version:'v2.1',completedAt:`${date}T${time}`,items:['redness','pore','texture'].map((type,index)=>({type,rawScore:score+index}))});
const record=(extra={})=>({id:'record-one',title:'내 보습제',category:'cosmetic',amount:20000,date:'2025-03-03',rating:null,repurchase:null,memo:'',...extra});
const feedback=(extra={})=>({date:'2025-03-05',feeling:'comfortable',adherence:'yes',feel:null,product:null,memo:'',...extra});

test('아직 저장값이 없는 첫 사용에서도 빈 상태를 정규화하여 저장한다',async()=>{
  const previous=globalThis.localStorage;let stored=null;
  globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;}};
  try {
    const initial=await readData(),next={...initial,budgets:{[month]:0}};
    await writeData(next,initial);
    assert.equal((await readData()).budgets[month],0);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('사진 2회 → 루틴 체크 → 사용감·소비 → 월간 집계 → 다음 달 목표 저장을 실제 함수로 연결한다',()=>{
  let data=savePhotoObservation(fixture(),result('2025-03-02'),'texture');
  const baseline=data.skinCare.observations[0].id;
  data=saveDaily(data,'morning',true,'2025-03-03');
  data=saveDaily(data,'evening',true,'2025-03-03');
  data=saveSkinCheckin(data,feedback({date:'2025-03-03',adherence:'no'}),'2025-03-03');
  data=saveSkinCheckin(data,feedback({date:'2025-03-04',adherence:'no'}),'2025-03-04');
  data=savePhotoObservation(data,result('2025-03-28',72),'texture',baseline);
  data=validateData({...data,records:[record()]});
  const original=JSON.stringify(data),report=monthlyReport(data,month,asOf);
  assert.equal(report.observations.length,2);assert.equal(report.routine.done,2);
  assert.equal(report.feedback.count,2);assert.equal(report.spending.total,20000);
  assert.equal(report.usedProducts[0].title,product.title);assert.equal(report.usedProducts[0].count,2);
  assert.equal(report.photos.changes.texture,2);assert.equal(report.spending.average,null);
  assert.equal(monthlyProposal(data,month,asOf).priority,'simple');
  const next=applyMonthlyProposal(data,month,asOf);
  assert.equal(next.budgets['2025-04'],100000);assert.equal(next.plans['2025-04'].reserve,80000);
  assert.equal(next.skinCare.profile.priority,'comfort');
  assert.equal(next.skinCare.monthlyAdjustments['2025-04'].priority,'simple');
  assert.match(buildSkinPlan(next,'2025-04-01').title,/간단/);
  assert.equal(saveDaily(next,'morning',true,'2025-04-01').skinCare.history.at(-1).profile.priority,'simple');
  assert.equal(JSON.stringify(data),original);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(next))),next);
});

test('분석 결과 재조회·재적용은 같은 완료 시각의 이력을 중복 생성하지 않는다',()=>{
  const response=result('2025-03-02');
  const first=savePhotoObservation(fixture(),response,'pore');
  const next=savePhotoObservation(first,response,'texture');
  assert.equal(next.skinCare.observations.length,1);
  assert.equal(next.skinCare.observations[0].id,first.skinCare.observations[0].id);
  assert.equal(next.skinCare.observation.focus,'texture');
  assert.throws(()=>savePhotoObservation(next,result('2025-03-02',20),'pore'),/달라/);
});

test('사진 이력의 미래 시각·중복·알 수 없는 필드·끊긴 비교 기준을 거절한다',()=>{
  const saved=savePhotoObservation(fixture(),result('2025-03-02'),'pore');
  const entry=saved.skinCare.observations[0];
  for(const invalid of [{...entry,photo:'base64'},{...entry,condition:'matched'},{...entry,condition:'matched',baselineId:entry.id},{...entry,completedAt:'2099-01-01T00:00:00.000Z'}])assert.throws(()=>validatePhotoHistory([invalid]));
  assert.throws(()=>validatePhotoHistory([entry,entry]));
  assert.throws(()=>validatePhotoHistory(Array.from({length:241},()=>entry)));
});

test('저장할 상태가 없거나 사진 이력이 가득 차면 비용 발생 전에 분석을 막는다',async()=>{
  const previous={document:globalThis.document,location:globalThis.location},listeners={};
  let data=EMPTY(),requests=0;
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  try {
    const ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),toast(){},photoFetch:async address=>{requests++;return Response.json(address.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:false}:{used:false,job:null});}});
    const start=()=>listeners.click({target:{closest:()=>({dataset:{photo:'start'}})}});
    await listeners.click({target:{closest:()=>({dataset:{photo:'connect'}})}});
    assert.equal(requests,2);
    await start();assert.match(ui.render(),/분석 전에 피부 느낌/);assert.equal(requests,2);
    data=savePhotoObservation(fixture(),result('2025-03-02'),'pore');
    const entry=data.skinCare.observations[0];
    data.skinCare.observations=Array.from({length:240},(_,index)=>({...entry,id:`capacity-${index}`,completedAt:null}));
    await start();assert.match(ui.render(),/240건이 보관 중/);assert.equal(requests,2);
  }finally{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});

test('기존 버전 5의 단일 관찰을 날짜·점수 그대로 이력에 보존한다',()=>{
  const old=fixture();old.version=5;
  old.skinCare.observation={provider:'youcam',version:'v2.1',date:'2025-03-02',focus:'pore',scores:{redness:70,pore:71,texture:72}};
  delete old.skinCare.observations;delete old.skinCare.monthlyAdjustments;
  const before=JSON.stringify(old),migrated=validateData(old);
  assert.equal(migrated.version,6);assert.equal(photoHistory(migrated.skinCare).length,1);
  assert.equal(migrated.skinCare.observations[0].completedAt,null);
  assert.equal(migrated.skinCare.observations[0].condition,'unknown');
  assert.deepEqual(migrated.skinCare.observations[0].reference,old.skinCare.observation);
  assert.equal(JSON.stringify(old),before);
  assert.deepEqual(validateData(migrated),migrated);
});

test('같은 조건 확인 없는 관찰·동일 날짜 재촬영은 변화량을 만들지 않는다',()=>{
  let data=savePhotoObservation(fixture(),result('2025-03-02'),'pore');
  data=savePhotoObservation(data,result('2025-03-28',80),'pore');
  assert.equal(monthlyReport(data,month,asOf).photos.changes,null);
  let sameDay=savePhotoObservation(fixture(),result('2025-03-02'),'pore');
  sameDay=savePhotoObservation(sameDay,result('2025-03-02',85,'10:00:00.000Z'),'pore',sameDay.skinCare.observations[0].id);
  assert.equal(monthlyReport(sameDay,month,asOf).photos.differentDays,false);
  assert.equal(monthlyReport(sameDay,month,asOf).photos.changes,null);
});

test('관찰 삭제는 연결된 비교를 해제하고 현재 적용값만 해당할 때 제외한다',()=>{
  let data=savePhotoObservation(fixture(),result('2025-03-02'),'pore');
  const baseline=data.skinCare.observations[0].id;
  data=savePhotoObservation(data,result('2025-03-28',72),'pore',baseline);
  const next=removePhotoObservation(data,baseline);
  assert.equal(next.skinCare.observations.length,1);
  assert.equal(next.skinCare.observations[0].baselineId,null);
  assert.ok(next.skinCare.observation);
  const empty=removePhotoObservation(next,next.skinCare.observations[0].id);
  assert.equal(photoHistory(validateData(empty).skinCare).length,0);
});

test('월 경계·윤년·중간 집계를 구분하며 다음 달 자료는 섞지 않는다',()=>{
  assert.equal(monthRange('2024-02','2024-03-01').days,29);
  assert.equal(monthRange('2025-02','2025-02-12').days,12);
  assert.equal(monthRange('2025-02','2025-02-28').closed,false);
  assert.equal(monthRange('2025-02','2025-03-01').closed,true);
  assert.throws(()=>monthRange('2025-04',asOf));
  const data=fixture();data.records=[record(),record({id:'future',date:'2025-04-01',amount:90000,rating:1})];
  const report=monthlyReport(data,month,'2025-03-04');
  assert.equal(report.days,4);assert.equal(report.routine.opportunities,0);assert.equal(report.routine.rate,null);
  assert.equal(report.spending.total,20000);assert.equal(report.spending.average,null);
  assert.equal(latestReportMonth(data,'2025-04-01'),'2025-03');
});

test('기록 없음·미평가·체크 없음·0원·예산 미설정은 다른 상태다',()=>{
  const data=EMPTY(),report=monthlyReport(data,month,asOf);
  assert.equal(report.hasData,false);assert.equal(report.spending.average,null);
  assert.equal(report.routine.unchecked,0);assert.equal(report.routine.rate,null);assert.equal(report.spending.budget,null);
  assert.equal(monthlyProposal(data,month,asOf).canApply,false);
  assert.match(renderRealReport(data,month,asOf),/이번 달 기록을 시작해 볼까요/);
  const zero={...fixture(),budgets:{[month]:0},records:[record({amount:0})]};
  assert.equal(monthlyReport(zero,month,asOf).hasData,true);
  assert.equal(monthlyProposal(zero,month,asOf).plan.total,0);
  const unset={...zero,budgets:{}};
  assert.equal(monthlyProposal(unset,month,asOf).plan,null);
  assert.equal(applyMonthlyProposal(unset,month,asOf).budgets['2025-04'],undefined);
});

test('한 건의 낮은 평가로 감액하지 않고 두 건 이상에서만 검토한다',()=>{
  const data={...fixture(),records:[record({rating:1})]};
  assert.equal(monthlyProposal(data,month,asOf).plan.allocations.cosmetic,20000);
  const next={...data,records:[...data.records,record({id:'two',rating:2})]};
  assert.equal(monthlyProposal(next,month,asOf).plan.allocations.cosmetic,20000);
  assert.ok(monthlyProposal(next,month,asOf).reasons.some(reason=>reason.includes('평가 2건')));
});

test('다음 달 기존 총예산·보유금·피부 상한을 지키고 반복 적용해도 금액이 줄지 않는다',()=>{
  const data={...fixture(),records:[record({amount:40000}),record({id:'two',category:'hair',amount:60000}),record({id:'three',category:'other',amount:33333})]};
  data.skinCare.profile.budget=15000;
  data.budgets['2025-04']=70001;
  data.plans['2025-04']={...blankPlan(70001),reserve:10001};
  const proposal=monthlyProposal(data,month,asOf),plan=proposal.plan;
  assert.equal(plan.total,70001);assert.ok(plan.reserve>=10001);
  assert.ok(plan.allocations.cosmetic+plan.allocations.skin<=15000);
  assert.equal(Object.values(plan.allocations).reduce((sum,value)=>sum+value,0)+plan.reserve,plan.total);
  const once=applyMonthlyProposal(data,month,asOf),twice=applyMonthlyProposal(once,month,asOf);
  assert.deepEqual(twice.plans,once.plans);assert.ok(monthlyProposal(once,month,asOf).applied);
});

test('현재 불편함은 사진이 양호해도 신규 피부 지출·루틴 제안보다 우선한다',()=>{
  const data=fixture();data.skinCare.profile.discomfort='yes';data.records=[record()];
  const saved=savePhotoObservation(data,result('2025-03-28',95),'pore');
  const proposal=monthlyProposal(saved,month,asOf);
  assert.equal(proposal.currentPlan.paused,true);assert.equal(proposal.plan.allocations.cosmetic,0);
  assert.equal(proposal.actions[0].kind,'pause');
});

test('지난날 사용감 수정은 해당 날짜를 대체하고 현재 느낌·제품을 덮어쓰지 않는다',()=>{
  const data=fixture();data.skinCare.profile.updatedAt=asOf;
  const changed=saveSkinCheckin(data,feedback({date:'2025-03-03',feeling:'uncomfortable',feel:'dry',product:{id:product.id,title:product.title,kind:product.kind}}),asOf);
  assert.deepEqual(changed.skinCare.profile,data.skinCare.profile);assert.deepEqual(changed.inventory,data.inventory);
  assert.equal(buildSkinPlan(changed,asOf).paused,false);
  const revised=saveSkinCheckin(changed,feedback({date:'2025-03-03',feeling:'comfortable'}),asOf);
  assert.equal(revised.skinCare.checkins.length,1);assert.equal(monthlyReport(revised,month,asOf).feedback.uncomfortable,0);
});

test('복원에서 잘못된 다음 달 목표·사진 이력을 거절하고 삭제하면 파생 리포트도 비운다',()=>{
  const data=fixture();
  for(const adjustment of [{sourceMonth:month,createdAt:asOf,priority:'unknown'},{sourceMonth:'2025-01',createdAt:asOf,priority:'simple'},{sourceMonth:month,createdAt:asOf,priority:'simple',photo:'secret'}]){
    assert.throws(()=>validateData({...data,skinCare:{...data.skinCare,monthlyAdjustments:{'2025-04':adjustment}}}));
  }
  const cleared=validateData({...data,skinCare:emptyCare()});
  assert.equal(monthlyReport(cleared,month,asOf).observations.length,0);
  assert.equal(monthlyReport(cleared,month,asOf).routine.done,0);
});

test('실제 리포트는 제품·기록 문자열을 이스케이프하고 샘플 관찰값을 참조하지 않는다',()=>{
  const data=fixture(),injected='<img src=x onerror=alert(1)>';
  data.records=[record({title:injected})];data.inventory[0].title=injected;
  const html=renderRealReport(data,month,asOf);
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
  for(const path of ['../화면/실제리포트.js','../화면/월간계산.js']){
    const code=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(code,/월간샘플|reviewedObservation|86\.3312|37\.8331|78\.5402/);
  }
});

test('저장 충돌·동시 저장에서 오래된 탭의 쓰기를 막고 원본을 보존한다',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let stored=JSON.stringify(EMPTY());
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}}});
  try {
    const base=await readData(),first={...base,budgets:{[month]:100}},second={...base,budgets:{[month]:200}};
    const results=await Promise.allSettled([writeData(first,base),writeData(second,base)]);
    assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
    assert.equal(results[1].reason.name,'DataConflict');assert.equal((await readData()).budgets[month],100);
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});

test('조정안 UI는 미동의·원본 변경·저장 실패를 성공으로 처리하지 않는다',async()=>{
  const previous={document:globalThis.document,FormData:globalThis.FormData},listeners={};
  const currentMonth=today().slice(0,7);
  let data=fixture();data.records=[record({date:today()})];data.budgets[currentMonth]=100000;
  let consent=false,canSave=false,writes=0;
  const error={textContent:''},button={disabled:false};
  globalThis.document={addEventListener:(type,handler)=>{listeners[type]=handler;}};
  globalThis.FormData=class{get(){return consent?'on':null;}};
  try {
    createReportUI({state:()=>({data,month:currentMonth,busy:false,demo:false,storageError:false}),toast(){},dialog(){},persist:async next=>{writes++;if(!canSave)return false;data=next;return true;}});
    const click=()=>listeners.click({target:{closest:selector=>selector==='[data-report]'?{dataset:{report:'preview'}}:null}});
    const submit=()=>listeners.submit({preventDefault(){},target:{id:'monthly-plan-form',querySelector:selector=>selector==='.form-error'?error:button}});
    await click();await submit();assert.equal(writes,0);assert.match(error.textContent,/동의/);
    consent=true;await submit();assert.equal(writes,1);assert.match(error.textContent,/저장하지 못/);
    data={...data,budgets:{...data.budgets,[currentMonth]:0}};
    await submit();assert.equal(writes,1);assert.match(error.textContent,/바뀌었어요/);
    await click();canSave=true;await submit();assert.equal(writes,2);assert.equal(button.disabled,false);
  }finally{globalThis.document=previous.document;globalThis.FormData=previous.FormData;}
});
