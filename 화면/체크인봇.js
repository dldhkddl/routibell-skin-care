import { APP } from '../앱설정.js';
import { today } from './계산.js';
import { copyDetails } from './화면정리.js';
import { ADHERENCE, FEEDBACK, FEELS, buildSkinPlan, weekReport } from './피부계산.js';
import { checkinProducts, checkinQuestions, prepareBotCheckin, saveBotCheckin } from './체크인계산.js';
import { managerMemory, createDailyTemplatePicker, completedCareDates, MANAGER_QUESTION_CATEGORIES, MANAGER_QUESTIONS, managerQuestionAnswer, managerQuestionLabel, recommendedManagerQuestions } from './매니저문구.js';
import { completionMessage, completionTip, managerNext, managerSheetState } from './체크인후.js';
import { icon } from './아이콘.js';
import { markBudgetAlert, nextBudgetAlert } from './예산계산.js';

const esc=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const character=()=>'<svg class="checkin-character" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5C34 5 42 12 42 23C42 33 35 41 24 41H12L7 44L9 33C6 30 5 26 5 23C5 12 13 5 24 5Z" fill="#fff0f5" stroke="#ed487b" stroke-width="1.8"/><path d="M19 5C20 1 25 1 27 5" stroke="#ed487b" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="22" r="2" fill="#253247"/><circle cx="31" cy="22" r="2" fill="#253247"/><ellipse cx="13" cy="27" rx="3" ry="2" fill="#ffb3cb"/><ellipse cx="35" cy="27" rx="3" ry="2" fill="#ffb3cb"/><path d="M20 29Q24 33 28 29" stroke="#ed487b" stroke-width="1.8" stroke-linecap="round"/></svg>';

export function createCheckinUI(ctx) {
  let draft=null,error='',saving=false,completed=false,generation=0,selectedDate=null,lastCompletion=null,shownAlert=null;
  let questionTab='routine',questionId=null,questionAnswer=null,questionRequest=0;
  const now=ctx.today??today;
  const pickTemplate=ctx.pickTemplate??createDailyTemplatePicker();
  const sheet=document.getElementById('checkin-sheet');
  const eligible=state=>!state.demo&&!state.storageError&&Boolean(state.identity&&state.data.skinCare.profile);
  function closeSheet(restore=true) {
    if(!sheet?.open)return false;
    sheet.close();sheet.innerHTML='';
    if(selectedDate!==null){selectedDate=null;draft=null;completed=false;}
    shownAlert=null;
    questionId=null;questionAnswer=null;questionRequest++;
    document.body.classList.remove('checkin-sheet-open');
    if(restore){const target=document.getElementById('checkin-launcher')??document.getElementById('checkin-done')??document.querySelector('.page-head h1');if(target){if(target.tagName==='H1')target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
    return true;
  }
  const reset=()=>{closeSheet(false);selectedDate=null;draft=null;error='';saving=false;completed=false;lastCompletion=null;shownAlert=null;questionTab='routine';questionId=null;questionAnswer=null;questionRequest++;generation++;};
  const redraw=()=>{ctx.render();const target=document.getElementById('checkin-current')??document.getElementById('checkin-done');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});};
  function start(date=selectedDate??now()) {
    const state=ctx.state();
    if(lastCompletion?.date!==date)lastCompletion=null;
    draft={date,identity:state.identity,base:JSON.stringify(state.data),source:state.data,answers:{},quick:true};
    error='';completed=false;
  }
  function ensureDraft(state) {
    const date=selectedDate??now();
    if(completed&&lastCompletion?.date!==date&&(ctx.hour??(()=>new Date().getHours()))()<4){
      const previous=new Date(`${date}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
      if(lastCompletion?.date===previous.toISOString().slice(0,10))return;
    }
    const untouched=draft&&!saving&&Object.keys(draft.answers).length===0;
    if(!draft||draft.identity!==state.identity||((completed||untouched)&&(draft.date!==date||draft.base!==JSON.stringify(state.data)))) {
      start(date);completed=selectedDate===null&&completedCareDates(state.data.skinCare,now()).has(now());
    }
  }
  function showSheet() {
    if(!sheet||document.getElementById('editor')?.open)return;
    if(!sheet.open&&selectedDate===null){
      const state=ctx.state();
      const uncomfortable=state.data.skinCare.checkins.some(entry=>entry.date===now()&&entry.feeling==='uncomfortable');
      shownAlert=(ctx.hour??(()=>new Date().getHours()))()<4||uncomfortable?null:nextBudgetAlert(state.data,now());
    }
    sheet.innerHTML=sheetContent();
    if(!sheet.open)sheet.showModal();
    document.body.classList.add('checkin-sheet-open');
    document.getElementById('checkin-current')?.focus({preventScroll:true});
    if(shownAlert){
      const alert=shownAlert;
      void ctx.persist(markBudgetAlert(ctx.state().data,alert.id),'').then(saved=>{
        if(!saved){shownAlert=null;return;}
        if(draft&&Object.keys(draft.answers).length===0){draft.base=JSON.stringify(ctx.state().data);draft.source=ctx.state().data;}
      });
    }
  }
  function sheetContent(){
    const state=ctx.state();
    const heading=`<header class="checkin-sheet-head"><h2 id="checkin-sheet-title">${selectedDate&&selectedDate!==now()?`${selectedDate} 기록`:'매니저'}</h2><button type="button" class="icon-button" data-checkin="close" aria-label="매니저 시트 닫기">${icon('close')}</button></header>`;
    if(!completed&&selectedDate===null&&(ctx.hour??(()=>new Date().getHours()))()<4)return `${heading}<p>늦었네요. 어제 몫으로 기록할까요, 오늘 몫으로 할까요?</p><div class="manager-date-choice"><button type="button" data-checkin="late-date" data-value="yesterday">어제 몫</button><button type="button" data-checkin="late-date" data-value="today">오늘 몫</button></div>`;
    if(selectedDate!==null)return heading+render('compact');
    if(questionId){
      const label=managerQuestionLabel(questionId,(ctx.hour??(()=>new Date().getHours()))());
      return `${heading}<div class="manager-answer"><button type="button" class="manager-back" data-manager-question-back>← 질문 목록</button><h3>${esc(label)}</h3>${questionAnswer?`<div class="manager-answer-lines">${questionAnswer.lines.map(line=>`<p>${esc(line)}</p>`).join('')}</div><button type="button" class="btn primary full-width" data-manager-next="${esc(questionAnswer.action.kind)}">${esc(questionAnswer.action.label)}</button>`:'<p role="status">기록을 살펴보고 있어요.</p>'}</div>`;
    }
    const summary=managerSheetState(state.data,now(),(ctx.hour??(()=>new Date().getHours()))(),shownAlert);
    const hour=(ctx.hour??(()=>new Date().getHours()))();
    const recommended=recommendedManagerQuestions(state.data,now(),hour);
    const questionButton=id=>`<button type="button" data-manager-question="${id}">${esc(managerQuestionLabel(id,hour))}${icon('chevron')}</button>`;
    return `${heading}<div class="manager-sheet"><p class="manager-first">${esc(summary.first)}</p><h3>오늘 할 일</h3><div class="manager-tasks">${summary.tasks.length?summary.tasks.map(task=>`<button type="button" data-manager-next="${task.kind}">${esc(task.label)} ${icon('chevron')}</button>`).join(''):'<p>오늘 할 건 다 했어요.</p>'}</div><h3>빠르게 기록</h3><div class="manager-quick">${summary.quick.map((label,index)=>`<button type="button" data-manager-quick="${index}">${esc(label)}</button>`).join('')}</div><h3>물어보기</h3><div class="manager-recommended" aria-label="지금 물어볼 만한 질문">${recommended.map(questionButton).join('')}</div><div class="manager-question-tabs" role="tablist" aria-label="질문 종류">${MANAGER_QUESTION_CATEGORIES.map(category=>`<button type="button" role="tab" data-manager-tab="${category.id}" aria-selected="${questionTab===category.id}">${category.label}</button>`).join('')}</div><div class="manager-question-list" role="tabpanel">${MANAGER_QUESTIONS.filter(question=>question.category===questionTab&&!recommended.includes(question.id)).map(question=>questionButton(question.id)).join('')}</div></div>`;
  }
  function completion(state){
    const date=lastCompletion?.date??now(),entry=state.data.skinCare.checkins.find(item=>item.date===date);
    const day=state.data.skinCare.days.find(item=>item.date===date);
    if(!entry&&!day?.morning&&!day?.evening)return null;
    const hour=lastCompletion?.hour??12;
    const reaction=lastCompletion?.trialOpened?'3일 채웠어요. 무료 사진 분석이 열렸어요.':entry?completionMessage(state.data,{date,previous:lastCompletion?.previous??null,answers:lastCompletion?.answers??null,hour,pick:pickTemplate,account:state.identity.split(':')[0]}):day.morning&&day.evening?'아침·저녁 루틴을 챙기셨어요.':'오늘 루틴 하나를 챙기셨어요.';
    return {reaction,tip:completionTip(state.data,date),next:managerNext(state.data,date)};
  }
  function completionCard(state,compact=false){
    const value=completion(state);if(!value)return '';
    const next=lastCompletion?.trialOpened?{kind:'photo',label:'사진 분석하기'}:value.next.label?value.next:{kind:'question',label:'매니저에게 물어보기'};
    return `<div class="checkin-completion ${compact?'checkin-completion-home':''}" role="status"><button type="button" class="checkin-avatar checkin-avatar-button" data-checkin="open" aria-label="매니저 열기">${character()}</button><div><strong id="checkin-done" tabindex="-1">${esc(value.reaction)}</strong><p>${esc(value.tip)}</p><button type="button" class="btn primary" data-manager-next="${next.kind}">${esc(next.label)}</button><button type="button" class="checkin-edit" data-checkin="edit-complete">수정</button></div></div>`;
  }
  function optionalQuickAnswers(state){
    const feelings=[['balanced','편안해요'],['dry','당겨요'],['oily','번들거려요'],['uncomfortable','불편했어요'],['unsure','잘 모르겠어요']];
    const products=draft.answers.mood==='uncomfortable'?`<div class="checkin-extra-options">${checkinProducts(state.data,draft.date).map(product=>`<button type="button" data-checkin="quick-product" data-value="${esc(product.id)}" aria-pressed="${draft.answers.product===product.id}">${esc(product.title)}</button>`).join('')}<button type="button" data-checkin="quick-product" data-value="none" aria-pressed="${draft.answers.product==='none'}">특정하지 않을게요</button></div>`:'';
    return `<details class="checkin-extra"><summary>더 남기기</summary><div class="checkin-extra-options">${feelings.map(([value,label])=>`<button type="button" data-checkin="quick-mood" data-value="${value}" aria-pressed="${draft.answers.mood===value}">${label}</button>`).join('')}</div>${products}</details>`;
  }
  function openDate(date) {
    const state=ctx.state();
    if(!eligible(state)||!sheet||document.getElementById('editor')?.open||!weekReport(state.data,now()).days.some(day=>day.date===date))return;
    selectedDate=date;start(date);showSheet();
  }
  async function noteDailySave(previousCount=0) {
    const state=ctx.state(),date=now();
    if(!completedCareDates(state.data.skinCare,date).has(date))return;
    let trialOpened=false;
    try{
      const access=(await ctx.subscription?.())?.access;
      trialOpened=Boolean(access?.trialUnlocked&&access.freeTrialRemaining>0&&previousCount<access.trialRequiredDays&&access.completedCheckinDays===access.trialRequiredDays);
    }catch{}
    lastCompletion={date,previous:null,answers:null,hour:(ctx.hour??(()=>new Date().getHours()))(),trialOpened};
    completed=true;ctx.render();
  }
  function home() {
    const state=ctx.state();
    if(!eligible(state))return '';
    ensureDraft(state);
    if(completed)return `<section class="checkin-home checkin-done" aria-label="오늘의 체크인">${completionCard(state,true)}</section>`;
    if((ctx.hour??(()=>new Date().getHours()))()<4)return `<section class="checkin-home manager-date-choice"><p>늦었네요. 어제 몫으로 기록할까요, 오늘 몫으로 할까요?</p><button type="button" data-checkin="late-date" data-value="yesterday">어제 몫</button><button type="button" data-checkin="late-date" data-value="today">오늘 몫</button></section>`;
    return `<div class="checkin-home">${render('home')}</div>`;
  }
  function floating(view) {
    const state=ctx.state();
    if(!eligible(state)||['home','checkin','welcome','subscription'].includes(view)||document.getElementById('editor')?.open)return '';
    ensureDraft(state);
    const hasTasks=managerSheetState(state.data,now(),(ctx.hour??(()=>new Date().getHours()))()).tasks.length>0;
    return `<button type="button" id="checkin-launcher" class="checkin-launcher" data-checkin="open" aria-label="${esc(APP.managerName)} 열기" aria-haspopup="dialog" aria-controls="checkin-sheet">${character()}${!completed||hasTasks?'<span class="checkin-unread" aria-hidden="true"></span>':''}</button>`;
  }
  function sync(view) {
    const launcher=floating(view),host=document.getElementById('checkin-assistant');
    if(host)host.innerHTML=launcher;
    if(!launcher){if(view!=='home'||!eligible(ctx.state()))closeSheet(false);else if(sheet?.open)sheet.innerHTML=sheetContent();return;}
    if(sheet?.open)sheet.innerHTML=sheetContent();
  }
  function render(mode='page') {
    const state=ctx.state();
    if(state.demo)return '<section class="checkin-empty"><h2>내 기록에서 체크인을 시작해요.</h2><p>마이에서 샘플을 종료하면 내 답변을 저장할 수 있어요.</p><button class="btn secondary" data-view="settings">마이로 이동</button></section>';
    if(state.storageError||!state.identity)return '<section class="checkin-empty"><h2>내 기록을 먼저 불러와 주세요.</h2><button class="btn secondary" data-view="home">홈으로 이동</button></section>';
    if(!state.data.skinCare.profile)return '<section class="checkin-empty"><span class="checkin-avatar">'+icon('spark')+'</span><h2>먼저 나의 관리 계획을 만들어요.</h2><p>피부 상태를 알려주면, 체크인 답변을 내 루틴에 이어서 기록할 수 있어요.</p><button class="btn primary full-width" data-view="care">피부 상태 입력하기</button></section>';
    ensureDraft(state);
    if(completed)return `<section class="checkin-chat ${mode==='compact'||mode==='home'?'checkin-compact':''}" aria-label="${esc(APP.managerName)} 체크인">${completionCard(state)}</section>`;
    if(draft.quick){
      const routine=Boolean(draft.answers.adherence&&draft.answers.adherence!=='pending');
      const prompt=routine?'오늘 완료한 루틴을 골라주세요.':draft.date===now()?'오늘 루틴 하셨어요?':'그날 루틴 하셨어요?';
      const hour=(ctx.hour??(()=>new Date().getHours()))();
      const options=routine?[['morning','아침만'],['evening','저녁만'],['both','아침·저녁']]:[['yes','했어요'],['some','일부만'],['pending','못 했어요'],['uncomfortable','불편했어요']];
      const preferred=hour<17?'morning':'evening';
      const memory=mode==='home'&&Object.keys(draft.answers).length===0?managerMemory(state.data,draft.date,variants=>pickTemplate(variants,{account:state.identity.split(':')[0],date:draft.date})):'';
      return `<section class="checkin-chat ${mode==='compact'||mode==='home'?'checkin-compact':''}" aria-label="${esc(APP.managerName)} 체크인"><header class="checkin-chat-head">${mode==='home'?`<button type="button" class="checkin-avatar checkin-avatar-button" data-checkin="open" aria-label="매니저 열기">${character()}</button>`:`<span class="checkin-avatar">${character()}</span>`}${memory?`<strong class="checkin-memory">${esc(memory)}</strong>`:''}</header><div class="checkin-current"><h2 id="checkin-current" tabindex="-1">${prompt}</h2><div class="checkin-options" role="group" aria-label="${prompt}">${options.map(([value,label])=>`<button type="button" data-checkin="${routine?'quick-routine':'quick-adherence'}" data-value="${value}" ${routine&&value===preferred?'class="checkin-preferred"':''} ${saving?'disabled':''}>${label}${routine&&value===preferred?'<small>추천</small>':''}</button>`).join('')}</div>${optionalQuickAnswers(state)}</div>${error?`<p class="form-error checkin-error" role="alert">${esc(error)}</p><button class="text-link" data-checkin="save" ${saving?'disabled':''}>다시 저장하기</button>`:''}</section>`;
    }
    const questions=checkinQuestions(draft.source,draft.answers,draft.date);
    const active=questions.find(question=>!Object.hasOwn(draft.answers,question.key));
    const previous=state.data.skinCare.checkins.find(entry=>entry.date===draft.date);
    const paused=buildSkinPlan(draft.source,draft.date).paused;
    const history=questions.filter(question=>Object.hasOwn(draft.answers,question.key)).map(question=>{const prompt=draft.date===now()?question.text:question.text.replaceAll('오늘','그날').replaceAll('지금','그날');return `<div class="checkin-exchange"><p class="checkin-bubble bot">${esc(prompt)}</p><div class="checkin-reply"><p class="checkin-bubble user">${esc(question.options.find(option=>option.value===draft.answers[question.key])?.label??'답변 확인 필요')}</p>${!completed?`<button type="button" class="checkin-edit" data-checkin="edit" data-key="${question.key}" aria-label="${esc(prompt)} 답변 수정" ${saving?'disabled':''}>수정</button>`:''}</div></div>`;}).join('');
    let body;
    if(active){const prompt=draft.date===now()?active.text:active.text.replaceAll('오늘','그날').replaceAll('지금','그날');body=`<div class="checkin-current"><h2 id="checkin-current" tabindex="-1">${esc(prompt)}</h2>${active.help?copyDetails('',`<p>${esc(active.help)}</p>`):''}<div class="checkin-options" role="group" aria-label="${esc(prompt)}">${active.options.map(option=>`<button type="button" data-checkin="answer" data-key="${active.key}" data-value="${esc(option.value)}" ${saving?'disabled':''}>${esc(option.label)} ${icon('chevron')}</button>`).join('')}</div></div>`;}
    else {
      const prepared=prepareBotCheckin(draft.source,draft.answers,draft.date);
      const day=state.data.skinCare.days.find(entry=>entry.date===draft.date);
      const cancelled=prepared.periods?['morning','evening'].filter(period=>day?.[period]&&!prepared.periods[period]):[];
      body=`<div class="checkin-current"><h2 id="checkin-current" tabindex="-1">이렇게 기록할게요.</h2><dl class="checkin-summary"><div><dt>기록 날짜</dt><dd>${draft.date}</dd></div><div><dt>관리 실천</dt><dd>${esc(ADHERENCE[prepared.entry.adherence])}</dd></div>${prepared.periods?`<div><dt>완료한 루틴</dt><dd>${[['morning','아침'],['evening','저녁']].filter(([period])=>prepared.periods[period]).map(([,label])=>label).join(' · ')||'없음'}</dd></div>`:''}<div><dt>피부 느낌</dt><dd>${esc(prepared.entry.feel?FEELS[prepared.entry.feel]:FEEDBACK[prepared.entry.feeling])}</dd></div>${prepared.entry.feel?`<div><dt>사용감</dt><dd>${esc(FEEDBACK[prepared.entry.feeling])}</dd></div>`:''}${prepared.entry.product?`<div><dt>함께 기록할 제품</dt><dd>${esc(prepared.entry.product.title)}</dd></div>`:''}${prepared.entry.memo?`<div><dt>기존 메모</dt><dd>${esc(prepared.entry.memo)}</dd></div>`:''}</dl>${cancelled.length?`<p class="checkin-help">기존 ${cancelled.map(period=>period==='morning'?'아침':'저녁').join('·')} 완료 체크는 이번 답변으로 취소돼요.</p>`:''}${copyDetails('',`<p>내 계정에 저장하고 루틴·월간 리포트에 반영해요.${previous?' 오늘 사용감은 이번 답변으로 수정돼요.':''}</p>`)}<button type="button" class="btn primary full-width" data-checkin="save" ${saving?'disabled':''}>${saving?'저장하고 있어요…':previous?'답변 수정하고 저장':'답변 저장하기'}</button></div>`;
    }
    const hour=(ctx.hour??(()=>new Date().getHours()))();
    const greeting=draft.date!==now()?'그날의 기록을 남겨볼까요?':hour<12?'좋은 아침이에요!':hour<18?'오늘 하루, 잘 보내고 있나요?':'하루를 마무리해 볼까요?';
    const compact=mode==='compact'||mode==='home';
    const memory=draft.extra?'더 남기기 · 피부 느낌과 사용감':mode==='home'?managerMemory(state.data,draft.date,variants=>pickTemplate(variants,{account:state.identity.split(':')[0],date:draft.date})):greeting;
    return `<section class="checkin-chat ${compact?'checkin-compact':''}" aria-label="${esc(APP.managerName)} 체크인"><header class="checkin-chat-head"><span class="checkin-avatar">${character()}</span>${memory?`<div><strong class="${mode==='home'?'checkin-memory':''}">${esc(memory)}</strong></div>`:''}</header>${!completed&&paused&&mode!=='home'?'<p class="guidance-alert">불편함 기록 · 오늘의 느낌부터 확인해요.</p>':''}${!compact&&previous?`<p class="checkin-existing">오늘 남긴 사용감 · ${esc(FEEDBACK[previous.feeling])}</p>`:''}${body}${!completed&&history?compact?`<details class="checkin-answers"><summary>앞서 답한 내용 · 수정</summary><div class="checkin-transcript">${history}</div></details>`:`<div class="checkin-transcript">${history}</div>`:''}${error?`<p class="form-error checkin-error" role="alert">${esc(error)}</p><button class="text-link" data-checkin="restart" ${saving?'disabled':''}>현재 기록으로 다시 시작</button>`:''}</section>`;
  }
  async function handle(action,key,value) {
    if(action==='close'){closeSheet();return;}
    const state=ctx.state();
    if(saving||state.busy)return;
    if(state.demo||state.storageError||!state.identity||!state.data.skinCare.profile)return;
    if(action==='late-date'&&['today','yesterday'].includes(value)){
      const current=now(),previous=new Date(`${current}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
      selectedDate=value==='today'?current:previous.toISOString().slice(0,10);start(selectedDate);showSheet();return;
    }
    if(action==='open') {
      ensureDraft(state);
      if(!sheet||document.getElementById('editor')?.open)return;
      showSheet();return;
    }
    if(!draft||draft.identity!==state.identity){reset();redraw();return;}
    if(action==='restart'){start();redraw();return;}
    if(action==='edit-complete'&&completed){
      start(lastCompletion?.date??now());draft.quick=true;
      redraw();return;
    }
    try {
      if(draft.date!==(selectedDate??now())||draft.date>now())throw Error('날짜가 바뀌었어요. 오늘 기록으로 다시 시작해 주세요.');
      if(JSON.stringify(state.data)!==draft.base)throw Error('대화 중 기록이 바뀌었어요. 현재 기록으로 다시 시작해 주세요.');
      const questions=checkinQuestions(state.data,draft.answers,draft.date);
      const active=questions.find(question=>!Object.hasOwn(draft.answers,question.key));
      if(action==='quick-mood'&&draft.quick){
        if(!['balanced','dry','oily','uncomfortable','unsure'].includes(value))return;
        draft.answers.mood=value;
        if(value!=='uncomfortable')delete draft.answers.product;
        redraw();return;
      }
      if(action==='quick-product'&&draft.quick){
        if(value!=='none'&&!checkinProducts(state.data,draft.date).some(product=>product.id===value))return;
        draft.answers.product=value;redraw();return;
      }
      if(action==='quick-adherence'&&draft.quick){
        if(!['yes','some','pending','uncomfortable'].includes(value))return;
        draft.answers={...draft.answers,adherence:value==='uncomfortable'?'pending':value,...(value==='uncomfortable'?{mood:'uncomfortable'}:{})};
        error='';
        if(value==='pending'||value==='uncomfortable')await handle('save');else redraw();
        return;
      }
      if(action==='quick-routine'&&draft.quick){
        if(!['yes','some'].includes(draft.answers.adherence)||!['morning','evening','both'].includes(value))return;
        draft.answers.routine=value;error='';await handle('save');return;
      }
      if(action==='answer') {
        if(completed||active?.key!==key||!active.options.some(option=>option.value===value))return;
        draft.quick=false;
        draft.answers={...draft.answers,[key]:value};error='';redraw();return;
      }
      if(action==='edit') {
        if(completed||!Object.hasOwn(draft.answers,key))return;
        const index=questions.findIndex(question=>question.key===key);
        draft.answers=Object.fromEntries(questions.slice(0,index).filter(question=>Object.hasOwn(draft.answers,question.key)).map(question=>[question.key,draft.answers[question.key]]));error='';redraw();return;
      }
      if(action!=='save'||(!draft.quick&&active)||completed)return;
      const stamp=generation,identity=state.identity;
      const previousEntry=state.data.skinCare.checkins.find(entry=>entry.date===draft.date)??null;
      const wasTodayComplete=completedCareDates(state.data.skinCare,now()).has(now());
      const savedDate=draft.date,savedAnswers={...draft.answers},savedHour=(ctx.hour??(()=>new Date().getHours()))();
      const next=saveBotCheckin(state.data,draft.quick?{...draft.answers,quick:true}:draft.answers,draft.date,now());
      saving=true;error='';redraw();
      let stored=false;
      try{stored=await ctx.persist(next,'체크인을 저장하고 루틴·월간 리포트를 갱신했어요.');}
      catch{stored=false;}
      if(stamp!==generation||ctx.state().identity!==identity)return;
      saving=false;
      const wasOpen=Boolean(sheet?.open);
      if(stored){
        let trialOpened=false;
        try{const access=(await ctx.subscription?.())?.access;trialOpened=Boolean(!wasTodayComplete&&savedDate===now()&&access?.freeTrialRemaining>0&&access?.trialUnlocked&&access.completedCheckinDays===access.trialRequiredDays);}catch{}
        lastCompletion={date:savedDate,previous:previousEntry,answers:savedAnswers,hour:savedHour,trialOpened};completed=true;draft.base=JSON.stringify(ctx.state().data);closeSheet(false);completed=true;
      }
      else error='저장을 완료하지 못했어요. 답변을 유지했으니 연결을 확인하고 다시 저장해 주세요.';
      redraw();
      if(stored&&savedDate===now()&&completedCareDates(state.data.skinCare,now()).size===0)void ctx.offerReminder?.();
      if(stored&&wasOpen){const target=document.querySelector('.page-head h1');target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}
    }catch(issue){error=issue.message;redraw();}
  }
  document.addEventListener('click',event=>{
    const question=event.target.closest('[data-manager-question]');
    const tab=event.target.closest('[data-manager-tab]');
    const back=event.target.closest('[data-manager-question-back]');
    if(sheet?.open&&(question||tab||back)){
      if(tab&&MANAGER_QUESTION_CATEGORIES.some(category=>category.id===tab.dataset.managerTab)){
        questionTab=tab.dataset.managerTab;sheet.innerHTML=sheetContent();sheet.querySelector(`[data-manager-tab="${questionTab}"]`)?.focus({preventScroll:true});
      }else if(back){questionId=null;questionAnswer=null;questionRequest++;sheet.innerHTML=sheetContent();sheet.querySelector('[data-manager-question]')?.focus({preventScroll:true});}
      else if(question&&MANAGER_QUESTIONS.some(item=>item.id===question.dataset.managerQuestion)){
        questionId=question.dataset.managerQuestion;questionAnswer=null;const request=++questionRequest;
        sheet.innerHTML=sheetContent();sheet.querySelector('[data-manager-question-back]')?.focus({preventScroll:true});
        const answer=access=>managerQuestionAnswer(ctx.state().data,questionId,now(),{hour:(ctx.hour??(()=>new Date().getHours()))(),access});
        if(questionId==='analyses'&&ctx.subscription){
          void ctx.subscription().then(value=>{if(request!==questionRequest||!sheet.open)return;questionAnswer=answer(value.access);sheet.innerHTML=sheetContent();}).catch(()=>{if(request!==questionRequest||!sheet.open)return;questionAnswer=answer(null);sheet.innerHTML=sheetContent();});
        }else{questionAnswer=answer(null);sheet.innerHTML=sheetContent();}
      }
      return;
    }
    const next=event.target.closest('[data-manager-next]');
    const quick=event.target.closest('[data-manager-quick]');
    if(next||quick){
      const action=next?.dataset.managerNext??['checkin','checkin','spend','inventory'][Number(quick.dataset.managerQuick)];
      closeSheet(false);
      if(action==='checkin'){selectedDate=null;start(now());ctx.navigate?.('checkin');}
      else if(action==='question'){questionId=null;questionAnswer=null;showSheet();sheet?.querySelector('.manager-recommended')?.scrollIntoView({block:'nearest'});}
      else if(action==='inventory')ctx.navigate?.('settings','inventory');
      else if(action==='budget')ctx.navigate?.('settings','budget');
      else if(action==='report')ctx.navigate?.('report');
      else if(action==='photo')ctx.navigate?.('care','photo');
      else if(action==='spend')ctx.navigate?.('records','spend');
      else if(action==='records')ctx.navigate?.('records','care');
      else if(action==='subscription')ctx.navigate?.('settings','subscription');
      return;
    }
    const button=event.target.closest('[data-checkin]');
    if(button)void handle(button.dataset.checkin,button.dataset.key,button.dataset.value);
  });
  sheet?.addEventListener('cancel',event=>{event.preventDefault();closeSheet();});
  sheet?.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...sheet.querySelectorAll('button:not(:disabled), summary')].filter(control=>control.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(!first)return;
    if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  sheet?.addEventListener('click',event=>{if(event.target!==sheet)return;const rect=sheet.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeSheet();});
  return {render,home,floating,sync,closeSheet,reset,handle,openDate,noteDailySave};
}
