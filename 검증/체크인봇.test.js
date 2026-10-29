import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData } from '../화면/계산.js';
import { emptyCare, buildSkinPlan, saveDaily } from '../화면/피부계산.js';
import { monthlyReport } from '../화면/월간계산.js';
import { checkinQuestions, prepareBotCheckin, saveBotCheckin } from '../화면/체크인계산.js';
import { createCheckinUI } from '../화면/체크인봇.js';

const date='2025-03-15';
const product={id:'cream-one',title:'내 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:60,opened:'2025-02-01',expires:'2099-12-31',memo:''};
const fixture=()=>({...EMPTY(),inventory:[{...product}],skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date},selection:{cleanser:null,cream:product.id,sunscreen:null}}});
const answers={adherence:'yes',routine:'morning',mood:'balanced'};

test('봇 답변은 루틴·사용감·월간 집계에 함께 저장되고 반복 저장은 중복되지 않는다',()=>{
  const original=fixture(),before=JSON.stringify(original);
  const saved=saveBotCheckin(original,answers,date);
  assert.equal(JSON.stringify(original),before);
  assert.equal(saved.skinCare.days[0].morning,true);
  assert.equal(saved.skinCare.days[0].evening,false);
  assert.equal(saved.skinCare.days[0].morningProducts[0].id,product.id);
  const restored=validateData(JSON.parse(JSON.stringify(saved)));
  const report=monthlyReport(restored,'2025-03',date);
  assert.equal(report.routine.morning,1);
  assert.equal(report.feedback.comfortable,1);
  assert.deepEqual(saveBotCheckin(restored,answers,date),restored);
  const edited=saveBotCheckin(restored,{adherence:'some',routine:'none',mood:'oily',comfort:'unsure'},date);
  assert.equal(edited.skinCare.checkins.length,1);
  assert.equal(edited.skinCare.days[0].morning,false);
  assert.equal(monthlyReport(edited,'2025-03',date).routine.done,0);
});

test('아직 안 한 관리·부분 실천·미기록은 어려움으로 집계하지 않고 당김을 불편함으로 추정하지 않는다',()=>{
  const data=fixture();
  const pending=saveBotCheckin(data,{adherence:'pending',mood:'dry',comfort:'unsure'},date);
  assert.equal(pending.skinCare.checkins[0].adherence,'pending');
  assert.equal(pending.skinCare.profile.feel,'dry');
  assert.equal(pending.skinCare.profile.discomfort,'no');
  assert.equal(monthlyReport(pending,'2025-03',date).feedback.difficult,0);
  assert.equal(monthlyReport(pending,'2025-03',date).feedback.unsure,1);
  assert.equal(monthlyReport(pending,'2025-03',date).feedback.same,0);
  assert.ok(buildSkinPlan(pending,date).reasons.some(reason=>reason.includes('아직 확인 중')));
  assert.equal(checkinQuestions(data,{adherence:'pending'}).some(question=>question.key==='routine'),false);
  assert.ok(checkinQuestions(data,{adherence:'pending',mood:'dry'}).some(question=>question.key==='comfort'));
  assert.equal(checkinQuestions(data,{adherence:'pending',mood:'dry',comfort:'comfortable'}).some(question=>question.key==='product'),false);
  const partial=saveBotCheckin(data,{adherence:'some',routine:'none',mood:'balanced'},date);
  assert.equal(monthlyReport(partial,'2025-03',date).routine.done,0);
  assert.equal(partial.skinCare.checkins[0].adherence,'some');
  for(const invalid of [{...answers,routine:'none'},{...answers,mood:'dry'},{...answers,extra:true},{adherence:'some',routine:'both',mood:'balanced'},{adherence:'pending',mood:'uncomfortable',product:'unknown'}])assert.throws(()=>prepareBotCheckin(data,invalid,date));
});

test('불편함과 명시적으로 고른 제품만 반영하며 중지 중에는 완료 체크를 바꾸지 않는다',()=>{
  let data=fixture();
  data=saveDaily(data,'evening',true,date);
  const saved=saveBotCheckin(data,{adherence:'yes',routine:'both',mood:'dry',comfort:'uncomfortable',product:product.id},date);
  assert.equal(saved.skinCare.profile.discomfort,'yes');
  assert.equal(saved.inventory[0].comfort,'uncomfortable');
  assert.equal(saved.skinCare.selection.cream,product.id);
  assert.equal(buildSkinPlan(saved,date).paused,true);
  assert.deepEqual(checkinQuestions(saved,{},date).map(question=>question.key),['mood','product']);
  const next=saveBotCheckin(saved,{mood:'balanced',product:'none'},date);
  assert.deepEqual(next.skinCare.days,saved.skinCare.days);
  assert.equal(next.skinCare.profile.discomfort,'no');
  assert.equal(next.inventory[0].comfort,'uncomfortable');
  assert.ok(buildSkinPlan(next,date).morning.every(step=>step.product?.id!==product.id));
  const paused=fixture();paused.skinCare.profile.discomfort='yes';
  const onlyFeeling=saveBotCheckin(paused,{mood:'unsure'},date);
  assert.equal(onlyFeeling.skinCare.checkins[0].adherence,'unreported');
  assert.equal(onlyFeeling.skinCare.days.length,0);
});

test('수정 시 기존 메모와 완료 당시 제품을 보존하고 잘못된 과거 답변은 거절한다',()=>{
  let data=saveBotCheckin(fixture(),answers,date);
  data.skinCare.checkins[0].memo='기존 메모';
  data.inventory[0].title='변경된 이름';
  const saved=saveBotCheckin(data,{...answers,mood:'oily',comfort:'comfortable'},date);
  assert.equal(saved.skinCare.checkins[0].memo,'기존 메모');
  assert.equal(saved.skinCare.days[0].morningProducts[0].title,'내 보습제');
  assert.throws(()=>saveBotCheckin(EMPTY(),answers,date),/먼저/);
  assert.throws(()=>saveBotCheckin(fixture(),answers,'2099-12-31'));
});

test('지난날 체크인은 해당 날짜만 기록하고 현재 피부 상태를 덮어쓰지 않는다',()=>{
  const current=fixture();
  current.skinCare.profile.feel='oily';
  const saved=saveBotCheckin(current,{adherence:'pending',mood:'dry',comfort:'comfortable'},'2025-03-14',date);
  assert.equal(saved.skinCare.checkins[0].date,'2025-03-14');
  assert.equal(saved.skinCare.checkins[0].feel,'dry');
  assert.equal(saved.skinCare.profile.feel,'oily');
  assert.equal(saved.skinCare.days[0].date,'2025-03-14');
  assert.equal(monthlyReport(saved,'2025-03',date).feedback.count,1);
});

test('지난 7일 날짜를 누르면 같은 버튼형 대화가 하단 시트에 열린다',context=>{
  const previous=globalThis.document;
  const sheet={open:false,innerHTML:'',addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
  globalThis.document={body:{classList:{add(){},remove(){}}},addEventListener(){},getElementById:id=>id==='checkin-sheet'?sheet:null};
  context.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const state={data:fixture(),identity:'account-test',demo:false,busy:false,storageError:false};
  const ui=createCheckinUI({state:()=>state,today:()=>date,render(){},persist:async()=>true});
  ui.openDate('2025-03-14');
  assert.equal(sheet.open,true);
  assert.match(sheet.innerHTML,/2025-03-14 기록/);
  assert.match(sheet.innerHTML,/그날 루틴 하셨어요/);
  ui.closeSheet(false);
  assert.equal(sheet.open,false);
  ui.openDate('2025-03-01');
  assert.equal(sheet.open,false);
});

test('교체 알림을 한 번 저장해도 열린 시트의 체크인을 이어서 저장할 수 있다',async context=>{
  const previous=globalThis.document;
  const sheet={open:false,innerHTML:'',addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
  globalThis.document={body:{classList:{add(){},remove(){}}},addEventListener(){},getElementById:id=>id==='checkin-sheet'?sheet:null};
  context.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const state={data:fixture(),identity:'account-test',demo:false,busy:false,storageError:false};
  const ui=createCheckinUI({state:()=>state,today:()=>date,hour:()=>12,render(){},persist:async next=>{state.data=validateData(next);return true;}});
  await ui.handle('open');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(sheet.innerHTML,/로션\/크림이 곧 떨어질 것 같아요/);
  assert.deepEqual(state.data.budgetCare.notified,[product.id]);
  await ui.handle('quick-adherence','', 'pending');
  assert.equal(state.data.skinCare.checkins.length,1);
});

function harness(context,options={}) {
  const previous=globalThis.document;
  globalThis.document={addEventListener(){},getElementById(){return null;}};
  context.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const state={data:fixture(),identity:'account-test',demo:false,busy:false,storageError:false};
  let dateNow=date,writes=0;
  const ui=createCheckinUI({state:()=>state,today:()=>dateNow,pickTemplate:variants=>variants[0],render(){ui.render();},persist:async next=>{writes++;if(options.persist)return options.persist(next,state);state.data=validateData(next);return true;},subscription:options.subscription});
  ui.render();
  const answer=async values=>{for(const [key,value]of Object.entries(values))await ui.handle('answer',key,value);};
  return {state,ui,answer,writes:()=>writes,setDate:value=>{dateNow=value;}};
}

test('대화는 저장 확인 전 기록을 바꾸지 않으며 이전 답변 수정 시 뒤의 분기를 다시 묻는다',async context=>{
  const {ui,state,answer,writes}=harness(context);
  await answer({adherence:'yes',routine:'morning',mood:'dry',comfort:'uncomfortable',product:product.id});
  assert.match(ui.render(),/이렇게 기록할게요/);
  assert.equal(writes(),0);assert.equal(state.data.skinCare.checkins.length,0);
  await ui.handle('edit','mood');
  assert.doesNotMatch(ui.render(),/data-key="product"/);
  await answer({mood:'balanced'});
  await ui.handle('save');await ui.handle('save');
  assert.equal(writes(),1);assert.match(ui.render(),/checkin-completion/);
  assert.equal(state.data.skinCare.checkins[0].product,null);
  state.data=fixture();
  assert.doesNotMatch(ui.render(),/저장 완료/);
  assert.match(ui.render(),/오늘 루틴 하셨어요/);
});

test('저장 실패는 답변과 원본을 유지하고 재시도·중복 클릭·세션 변경을 구분한다',async context=>{
  let resolveWrite;
  const {ui,state,answer,writes}=harness(context,{persist:()=>new Promise(resolve=>{resolveWrite=resolve;})});
  const original=JSON.stringify(state.data);
  await answer(answers);
  const pending=ui.handle('save');await ui.handle('save');
  assert.equal(writes(),1);resolveWrite(false);await pending;
  assert.equal(JSON.stringify(state.data),original);
  assert.match(ui.render(),/저장을 완료하지 못/);
  assert.match(ui.render(),/아침만 완료/);
  const retry=ui.handle('save');state.identity='another-account';state.data=fixture();ui.reset();resolveWrite(true);await retry;
  assert.doesNotMatch(ui.render(),/저장 완료/);
});

test('대화 도중 날짜·기록 변경과 샘플 저장을 막고 제품 이름을 이스케이프한다',async context=>{
  const {ui,state,answer,writes,setDate}=harness(context);
  state.data.inventory[0].title='<img src=x onerror=alert(1)>';
  ui.reset();ui.render();
  await answer({adherence:'pending',mood:'uncomfortable'});
  assert.ok(ui.render().includes('&lt;img'));
  assert.ok(!ui.render().includes('<img src=x'));
  await answer({product:'none'});
  setDate('2025-03-16');await ui.handle('save');assert.equal(writes(),0);assert.match(ui.render(),/날짜가 바뀌었어요/);
  await ui.handle('restart');await answer({adherence:'pending',mood:'balanced'});
  state.data={...state.data,budgets:{'2025-03':10000}};
  await ui.handle('save');assert.equal(writes(),0);assert.match(ui.render(),/기록이 바뀌었어요/);
  state.demo=true;await ui.handle('restart');assert.match(ui.render(),/샘플을 종료/);
  await ui.handle('save');assert.equal(writes(),0);
});

test('홈 최상단 카드는 질문을 바로 보여주고 다른 화면에서는 미완료 캐릭터만 표시한다',context=>{
  const {ui,state}=harness(context);
  assert.match(ui.home(),/오늘 루틴 하셨어요/);
  assert.match(ui.home(),/>했어요\s*</);
  assert.match(ui.home(),/>못 했어요\s*</);
  assert.match(ui.home(),/>일부만\s*</);
  assert.match(ui.home(),/>불편했어요\s*</);
  for(const view of ['home','checkin','welcome','subscription'])assert.equal(ui.floating(view),'');
  for(const view of ['care','records','settings','wishes']) {
    assert.match(ui.floating(view),/aria-haspopup="dialog"/);
    assert.doesNotMatch(ui.floating(view),/오늘 루틴 하셨어요/);
  }
  for(const flag of ['demo','storageError']) {
    state[flag]=true;assert.equal(ui.home(),'');assert.equal(ui.floating('care'),'');state[flag]=false;
  }
  state.identity=null;assert.equal(ui.home(),'');assert.equal(ui.floating('care'),'');
  state.identity='account-test';state.data.skinCare.profile=null;
  assert.equal(ui.home(),'');assert.equal(ui.floating('care'),'');
});

test('홈은 저장된 기억 한 줄과 질문만 보여주고 답하면 기록 기반 응답으로 바뀐다',async context=>{
  const {ui,state}=harness(context);
  state.data.inventory=[];
  state.data.skinCare.selection={cleanser:null,cream:null,sunscreen:null};
  ui.reset();
  assert.doesNotMatch(ui.home(),/checkin-memory|좋은 아침이에요/);
  state.data.skinCare.days=['2025-03-12','2025-03-13','2025-03-14'].map(date=>({date,morning:true,evening:false,morningProducts:[],eveningProducts:[]}));
  assert.match(ui.home(),/3일 연속 챙기셨네요/);
  assert.match(ui.home(),/오늘 루틴 하셨어요/);
  await ui.handle('answer','adherence','yes');
  assert.doesNotMatch(ui.home(),/좋아요, 4일째예요/);
  await ui.handle('edit','adherence');
  await ui.handle('answer','adherence','pending');
  assert.doesNotMatch(ui.home(),/괜찮아요, 저녁에 다시 기록해도 돼요/);
});

test('홈과 하단 대화는 같은 답변을 이어가며 끝까지 답해도 저장 전에는 완료되지 않는다',async context=>{
  const {ui,state,answer}=harness(context);
  await answer({adherence:'yes'});
  assert.match(ui.home(),/id="checkin-current"[^>]*>오늘 완료한 루틴/);
  assert.match(ui.render('compact'),/id="checkin-current"[^>]*>오늘 완료한 루틴/);
  await answer({routine:'morning',mood:'balanced'});
  assert.match(ui.home(),/이렇게 기록할게요/);
  assert.match(ui.home(),/<details class="checkin-answers">/);
  assert.match(ui.floating('records'),/checkin-launcher/);
  assert.equal(state.data.skinCare.checkins.length,0);
  await ui.handle('edit','adherence');
  assert.match(ui.home(),/id="checkin-current"[^>]*>오늘 루틴/);
});

test('저장 성공은 반응 카드로 바뀌고 새로고침 뒤에도 매니저를 열 수 있다',async context=>{
  const {ui,state,answer,setDate}=harness(context);
  await answer(answers);await ui.handle('save');
  assert.match(ui.home(),/첫 기록이에요|반가워요|시작이 제일/);
  assert.doesNotMatch(ui.home(),/checkin-options|checkin-transcript/);
  assert.match(ui.floating('care'),/checkin-launcher/);
  ui.reset();assert.match(ui.home(),/첫 기록이에요|반가워요|시작이 제일/);
  assert.match(ui.floating('records'),/checkin-launcher/);
  await ui.handle('restart');
  assert.doesNotMatch(ui.home(),/checkin-completion/);
  await answer({adherence:'pending',mood:'balanced'});await ui.handle('save');
  assert.equal(state.data.skinCare.checkins.length,1);
  assert.equal(state.data.skinCare.days[0].morning,false);
  assert.match(ui.home(),/바꿔둘게요|수정했어요/);
  setDate('2025-03-16');assert.match(ui.home(),/오늘 루틴 하셨어요/);
  assert.match(ui.floating('care'),/checkin-launcher/);
  state.identity='another-account';state.data=fixture();
  assert.doesNotMatch(ui.home(),/checkin-completion|앞서 답한 내용/);
});

test('저장 실패는 홈 카드·보조 버튼을 완료로 숨기지 않는다',async context=>{
  const {ui,answer,writes}=harness(context,{persist:async()=>false});
  await answer(answers);await ui.handle('save');
  assert.equal(writes(),1);
  assert.match(ui.home(),/저장을 완료하지 못/);
  assert.doesNotMatch(ui.home(),/오늘 기록 완료/);
  assert.match(ui.floating('care'),/checkin-launcher/);
  assert.match(ui.render('compact'),/아침만 완료/);
});

test('대화를 시작하지 않은 상태에서 다른 화면의 기록이 바뀌면 최신 기록으로 시작한다',async context=>{
  const {ui,state,writes}=harness(context);
  ui.home();
  state.data=saveDaily(state.data,'evening',true,date);
  ui.home();
  assert.equal(writes(),0);
  assert.match(ui.home(),/checkin-completion/);
  assert.equal(state.data.skinCare.days[0].evening,true);
});

test('관심 항목이 없고 아침·저녁을 마쳐도 완료 카드에 팁·버튼·매니저 입구가 남는다',context=>{
  const {ui,state}=harness(context);
  state.data=saveBotCheckin(state.data,{adherence:'yes',routine:'both',mood:'balanced'},date);
  const html=ui.home();
  assert.match(html,/checkin-completion/);
  assert.match(html,/<p>[^<]+<\/p>/);
  assert.match(html,/data-manager-next="question"[^>]*>매니저에게 물어보기/);
  assert.match(html,/data-checkin="open"/);
});

test('셋째 날 무료 체험 안내는 첫 완료에만 보이고 답변 수정에는 반복하지 않는다',async context=>{
  const {ui,state}=harness(context,{subscription:async()=>({access:{freeTrialRemaining:1,trialUnlocked:true,completedCheckinDays:3,trialRequiredDays:3}})});
  state.data=saveDaily(state.data,'morning',true,'2025-03-13');
  state.data=saveDaily(state.data,'morning',true,'2025-03-14');
  ui.reset();ui.home();
  await ui.handle('quick-adherence',undefined,'yes');
  await ui.handle('quick-routine',undefined,'morning');
  assert.match(ui.home(),/3일 채웠어요/);
  await ui.handle('edit-complete');
  await ui.handle('quick-adherence',undefined,'yes');
  await ui.handle('quick-routine',undefined,'morning');
  assert.doesNotMatch(ui.home(),/3일 채웠어요/);
});

test('빠른 체크인은 두 번 탭으로 저장하고 저장 전 칭찬하지 않는다',async context=>{
  const {ui,state,writes}=harness(context);
  state.data.skinCare.profile.concerns=['dryness'];
  ui.reset();
  assert.match(ui.home(),/data-checkin="quick-adherence"/);
  await ui.handle('quick-adherence',undefined,'yes');
  assert.equal(writes(),0);
  assert.doesNotMatch(ui.home(),/좋아요, 오늘도 챙기셨네요|첫 기록이에요/);
  assert.match(ui.home(),/data-checkin="quick-routine"/);
  assert.doesNotMatch(ui.home(),/앞서 답한 내용|자세히 보기|이렇게 기록할게요/);
  await ui.handle('quick-routine',undefined,'morning');
  assert.equal(writes(),1);
  assert.equal(state.data.skinCare.days[0].morning,true);
  assert.equal(state.data.skinCare.checkins[0].feel,null);
  assert.match(ui.home(),/첫 기록이에요/);
  assert.match(ui.home(),/보습/);
  assert.match(ui.home(),/저녁 루틴 체크하기/);
  assert.match(ui.home(),/data-checkin="edit-complete">수정/);
  assert.doesNotMatch(ui.home(),/앞서 답한 내용|자세히 보기/);
});

test('못 했어요와 불편했어요는 한 번 탭 뒤 저장하고 불편함에는 쉬어가기를 우선한다',async context=>{
  const {ui,state,writes}=harness(context);
  await ui.handle('quick-adherence',undefined,'pending');
  assert.equal(writes(),1);
  assert.equal(state.data.skinCare.checkins[0].feeling,'unsure');
  assert.equal(state.data.skinCare.profile.feel,'balanced');
  await ui.handle('edit-complete');
  assert.match(ui.home(),/더 남기기/);
  ui.reset();state.data=fixture();ui.home();
  await ui.handle('quick-adherence',undefined,'uncomfortable');
  assert.equal(writes(),2);
  assert.equal(state.data.skinCare.checkins[0].feeling,'uncomfortable');
  assert.match(ui.home(),/쉬어가요|새 제품 없이/);
  assert.doesNotMatch(ui.home(),/세안 후 바로 보습해요/);
});

test('더 남기기는 선택이며 저장 전 칭찬·확인 화면 없이 두 번 탭으로 저장한다',async context=>{
  const {ui,state,writes}=harness(context);
  state.data.skinCare.profile.concerns=['dryness'];
  ui.reset();
  assert.match(ui.home(),/<summary>더 남기기<\/summary>/);
  await ui.handle('quick-mood',undefined,'dry');
  await ui.handle('quick-adherence',undefined,'yes');
  assert.equal(writes(),0);
  assert.doesNotMatch(ui.home(),/좋아요, 오늘도 챙기셨네요|이렇게 기록할게요|앞서 답한 내용/);
  await ui.handle('quick-routine',undefined,'morning');
  assert.equal(writes(),1);
  assert.equal(state.data.skinCare.checkins[0].feel,'dry');
  assert.match(ui.home(),/보습/);
  assert.match(ui.home(),/저녁 루틴 체크하기/);
});
