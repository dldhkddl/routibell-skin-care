import { today, currency } from './계산.js';
import { copyDetails, numericCard } from './화면정리.js';
import { availableInventory } from './계획계산.js';
import { icon } from './아이콘.js';
import { createPhotoUI } from './사진분석.js';
import { weeklyCareLine, completedCareDates } from './매니저문구.js';
import { saveSkinCheckin } from './피부계산.js';
import { photoHistory } from './사진이력.js';
import { PRODUCT_KINDS, vanityRoutine } from './화장대순서.js';
import { FEELS, CONCERNS, SENSITIVITIES, PRIORITIES, FEEDBACK, ADHERENCE, CARE_SOURCES, KINDS, emptyCare, emptySelection, validateSkinProfile, validateCheckin, validateSelection, validateProductSnapshot, buildSkinPlan, capturePlan, saveDaily, weekReport, withInventory } from './피부계산.js';

const esc=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const select=(label,name,options,value,required=true)=>`<label>${label}<select name="${name}" ${required?'required':''}><option value="" ${!value?'selected':''} ${required?'disabled':''}>${required?'선택해 주세요':'기록하지 않음'}</option>${Object.entries(options).map(([key,title])=>`<option value="${key}" ${value===key?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;
const footer=label=>`<p class="form-error" role="alert"></p><button type="submit" class="btn primary full-width">${label}</button>`;
const reasonNames={profile:'상태·목표 수정',products:'사용 제품 선택',feedback:'사용 경험 반영',daily:'실천 당시 계획',observation:'사진 관찰 참고 반영'};
const inheritedPriority=data=>data.goals?.selected?.includes('save')?'save':data.goals?.selected?.includes('routine')?'simple':'comfort';

export function createSkinUI(ctx) {
  let feedbackDate=today();
  const photoUI=createPhotoUI(ctx);
  const current=()=>ctx.state();
  const guard=()=>{
    const state=current();
    if(state.demo||state.storageError){ctx.toast(state.demo?'샘플을 종료하고 내 기록에서 시작해 주세요.':'원본 보호를 위해 먼저 백업을 복원해 주세요.');return false;}
    return !state.busy;
  };
  function daily(data,compact=false) {
    const plan=buildSkinPlan(data);if(!plan)return '';
    const day=data.skinCare.days?.find(entry=>entry.date===today());
    return `<div class="care-daily">${plan.paused?'<p class="care-safety-summary">불편함 기록 · 사용감부터 확인해요.</p>':''}<div class="daily-buttons">${[['morning','아침','sun'],['evening','저녁','moon']].map(([period,label,mark])=>`<button type="button" class="daily-button ${day?.[period]?'done':''}" data-care-day="${period}" aria-pressed="${Boolean(day?.[period])}" ${plan.paused&&!day?.[period]?'disabled':''}>${icon(day?.[period]?'check':mark)}<span><strong>${label} ${day?.[period]?'완료':'체크'}</strong></span></button>`).join('')}</div></div>`;
  }
  function home() {
    const data=current().effective,plan=buildSkinPlan(data);
    return `<section class="care-home"><h2>나의 관리 계획</h2><p class="card-copy">${plan?esc(plan.title):'피부 느낌부터 알려주세요.'}</p><button class="btn primary full-width" data-view="care">${plan?'오늘 루틴 보기':'관리 계획 시작하기'} ${icon('arrow')}</button></section>`;
  }
  function profileForm(data) {
    const profile=data.skinCare?.profile,value=profile??{},priority=data.skinCare?.monthlyAdjustments?.[today().slice(0,7)]?.priority??value.priority??inheritedPriority(data);
    return `<details class="care-profile" ${profile?'':'open'}><summary>${profile?'피부 상태·목표 수정':'사진 분석 전, 피부 느낌만 알려주세요'}</summary><form id="skin-profile-form"><p class="field-help">오늘 느끼는 상태만 알려주세요. 진단명·치료 내역은 입력하지 마세요.</p>${select('평소 피부 느낌','feel',FEELS,value.feel)}${select('새 제품을 사용할 때','sensitivity',SENSITIVITIES,value.sensitivity)}${select('지금 제품 사용 후 불편함이 있나요?','discomfort',{no:'없어요',yes:'있어요',unsure:'잘 모르겠어요'},value.discomfort)}<p class="care-inherited-goal">적용 목표 · <strong>${PRIORITIES[priority]}</strong></p><details class="care-optional"><summary>고민·목표 더 설정하기 <small>선택</small></summary><fieldset class="care-concerns"><legend>먼저 챙길 고민 <small>최대 3개</small></legend>${Object.entries(CONCERNS).map(([key,label])=>`<label class="checkbox"><input type="checkbox" name="concern" value="${key}" ${value.concerns?.includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset>${select('관리 목표 변경','priority',PRIORITIES,priority)}</details><input type="hidden" name="budget" value="${value.budget??''}"><label class="checkbox care-consent"><input type="checkbox" name="consent" required> 입력한 상태와 사용 경험을 내 계정에 저장하는 데 동의해요.</label><p class="field-help">저장한 답변으로 관리 계획을 만들어요. 사진 전송은 별도로 동의를 받아요.</p>${footer(profile?'상태 수정하고 계획 갱신':'저장하고 내 루틴 보기')}${profile?'':'<p class="field-help">사진 분석은 3일 체크인하면 무료로 열려요.</p>'}</form></details>`;
  }
  function skinBudget() {
    const profile=current().effective.skinCare?.profile;
    return `<section class="panel settings-skin-budget"><h2>피부 관리 구매 상한</h2>${profile?`<details><summary>${profile.budget===null?'상한 정하기':currency(profile.budget)+' · 수정하기'}</summary><form id="skin-budget-form"><label>한 달 구매 상한 (원)<input name="budget" type="number" inputmode="numeric" min="0" max="100000000" step="1" value="${profile.budget??''}" placeholder="설정하지 않으려면 비워두세요"></label><p class="field-help">0원도 저장할 수 있어요. 전체 예산은 바뀌지 않아요.</p>${footer('피부 상한 저장')}</form></details>`:'<p>관리 계획에서 피부 느낌을 먼저 알려주세요.</p>'}</section>`;
  }
  function products(data) {
    const selected=data.skinCare.selection??emptySelection();
    const eligible=availableInventory(data).filter(item=>item.category==='cosmetic'&&item.comfort==='comfortable');
    const missing=Boolean(buildSkinPlan(data)?.missing.length);
    return `<details class="care-products"><summary>${missing?'<span>사용할 제품을 아직 안 골랐어요</span><strong>고르기</strong>':'사용 제품 바꾸기'}</summary><form id="skin-products-form">${Object.entries(KINDS).map(([kind,label])=>{const options=eligible.filter(item=>item.kind===kind),missing=selected[kind]&&!options.some(item=>item.id===selected[kind]);return `<label>${label}<select name="${kind}"><option value="" ${!selected[kind]?'selected':''}>선택하지 않음</option>${missing?`<option value="${selected[kind]}" selected disabled>기존 선택 제품 확인 필요</option>`:''}${options.map(item=>`<option value="${item.id}" ${selected[kind]===item.id?'selected':''}>${esc(item.title)} · ${item.remaining}%</option>`).join('')}</select></label>`;}).join('')}${footer('선택 제품 저장')}</form><button class="text-link" data-settings="inventory">보유 제품 관리 ${icon('chevron')}</button></details>`;
  }
  function routine(label,steps) {
    return `<article class="care-routine"><h3>${icon(label==='아침'?'sun':'moon')} ${label}</h3><ol>${steps.map(step=>`<li><details><summary>${esc(step.title)}${step.product?`<small class="care-routine-product">내 화장대 · ${esc(step.product.title)}</small>`:''}</summary><p>${esc(step.text)}</p></details></li>`).join('')}</ol></article>`;
  }
  function budget(plan) {
    const allowance=plan.allowance;
    return `<section class="care-budget"><h3>이번 달 구매 상한</h3>${allowance.cap===null?'<button class="text-link" data-action="budget">예산 정하기 →</button>':`<div class="care-budget-number"><span>남은 한도</span><strong>${currency(allowance.cap)}</strong></div>`}${plan.paused?'<p class="care-safety-summary">불편함 기록 · 새 제품 제안을 멈췄어요.</p>':''}${copyDetails(allowance.cap===0?'추가 구매보다 가진 제품부터 확인해요.':'',`<p>이번 달 피부관리·화장품 지출 ${currency(allowance.skinSpent)}</p><p>피부 상한 ${allowance.profileBudget===null?'미설정':currency(allowance.profileBudget)} · 전체 예산 ${allowance.monthlyBudget===null?'미설정':currency(allowance.monthlyBudget)} · 남겨둘 금액 ${currency(allowance.reserve)}. 설정한 한도 중 가장 작은 값이며 구매 고민·일정은 예약 차감하지 않아요.</p><p>${plan.paused?'예상 구매 비용: 산정하지 않음':plan.missing.length?'예상 추가 비용: 미정 · 제품 필요와 가격부터 확인해요.':'선택한 보유 제품을 그대로 쓰면 추가 구매 비용 0원'}</p><p>한도가 미설정이면 상태 수정에서 입력할 수 있어요. 남은 금액을 모두 쓸 필요는 없어요.</p>`,'자세히 보기 · 한도 계산')}</section>`;
  }
  function render() {
    const data=current().effective,care=data.skinCare??emptyCare(),plan=buildSkinPlan(data);
    const vanity=vanityRoutine(data.inventory??[],today());
    return `<div class="care-screen" id="care-routine-start"><section class="care-routine-block"><h2>${plan?'오늘 루틴':'사진 분석 전 피부 느낌'}</h2>${plan?`<p>${esc(plan.title)}</p>${daily(data)}${plan.paused?'<p class="care-safety-summary">불편했던 제품은 사용을 멈추고 확인해요.</p>':`<p class="care-vanity-tip">${esc(vanity.tips[0]??'가지고 있는 제품의 순서를 정리했어요.')}</p><div class="care-routines">${routine('아침',plan.morning)}${routine('저녁',plan.evening)}</div><button class="text-link" data-settings="inventory">내 화장대 제품 추가·수정 →</button>`}`:profileForm(data)}</section><details class="care-reasons"><summary>왜 이렇게 제안했나요?</summary>${plan?`<ul>${plan.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>${vanity.tips.slice(1).map(tip=>`<p>${esc(tip)}</p>`).join('')}<p>성분·알레르기 안전 판정이나 진단은 아니에요.</p>${products(data)}${profileForm(data)}`:'<p>직접 입력한 피부 느낌을 바탕으로 계획을 만들어요.</p>'}</details></div>`;
  }
  function feedbackProducts(data, date=today()) {
    const day=data.skinCare.days?.find(day=>day.date===date);
    const products=[...(day?.morningProducts??[]),...(day?.eveningProducts??[]),...(data.inventory??[]).filter(item=>item.category==='cosmetic'&&Object.hasOwn(PRODUCT_KINDS,item.kind))];
    return [...new Map(products.map(item=>[item.id,validateProductSnapshot(item)])).values()];
  }
  function fullReview() {
    const data=current().effective,care=data.skinCare??emptyCare();
    if(!care.profile)return `<section class="care-empty"><h2>내 관리 기록을 시작해요</h2><p>피부 느낌을 입력하면 오늘 체크와 주간 비교를 사용할 수 있어요.</p><button class="btn primary" data-view="care">관리 계획 시작하기</button></section>`;
    const report=weekReport(data),entry=care.checkins.find(item=>item.date===feedbackDate),history=care.history??[];
    const choices=feedbackProducts(data,feedbackDate);if(entry?.product&&!choices.some(item=>item.id===entry.product.id))choices.push(entry.product);
    return `<div class="care-screen"><section class="care-week"><h2>최근 7일, 나의 관리</h2><small>${report.current.start} ~ ${report.current.end}</small>${report.current.rate===null?'<p class="card-copy">첫 관리 기록부터 함께 시작해요.</p>':numericCard('최근 7일 체크율',report.current.rate,'%',`${report.current.done} / ${report.current.opportunities}회 · ${report.current.activeDays}일 기준`)}${report.current.uncomfortable?`<p class="care-safety-summary">불편함 기록 · ${report.current.uncomfortable}일</p>`:''}<div class="week-days">${report.days.map(day=>`<div><span>${day.date.slice(5)}</span><strong>${day.entry?`${Number(day.entry.morning)+Number(day.entry.evening)}/2`:'—'}</strong></div>`).join('')}</div><details class="card-details"><summary>자세히 보기 · 이전 7일 비교</summary><table class="week-table"><caption>실천·사용감 기록 비교</caption><thead><tr><th>기록</th><th>이전 7일</th><th>최근 7일</th></tr></thead><tbody>${[['체크한 날','recordedDays'],['아침 완료','morning'],['저녁 완료','evening'],['사용감 기록','feedbackDays'],['편안했던 기록','comfortable'],['불편했던 기록','uncomfortable']].map(([label,key])=>`<tr><th scope="row">${label}</th><td>${report.previous[key]}</td><td>${report.current[key]}</td></tr>`).join('')}</tbody></table><p>첫 관리 기록 전 날짜는 체크율에서 제외하며, 시작일 이후 최근 7일의 아침·저녁 두 번을 기준으로 집계해요.</p><p>피부 느낌: ${report.previous.lastFeel?`${report.previous.lastFeel.date} ${FEELS[report.previous.lastFeel.feel]}`:'이전 기록 없음'} → ${report.current.lastFeel?`${report.current.lastFeel.date} ${FEELS[report.current.lastFeel.feel]}`:'최근 기록 없음'}</p><p class="field-help">—는 미기록이에요. 미기록은 실패나 0점이 아니에요. 숫자는 기록 횟수이지 피부 개선 점수나 제품 효과가 아니에요.</p></details></section><section class="panel"><h2>사용감 남기기·수정</h2><label>조회할 기록 날짜<input type="date" id="skin-feedback-date" value="${feedbackDate}" min="2000-01-01" max="${today()}"></label><button type="button" class="text-link" data-care="feedback-date">이 날짜 기록 불러오기</button>${copyDetails('같은 날짜의 기록은 수정돼요.',`<p>${feedbackDate} · 지난날 기록은 현재 피부 상태·제품 사용감을 바꾸지 않아요.</p>`)}<form id="skin-checkin-form"><input type="hidden" name="date" value="${feedbackDate}">${select(feedbackDate===today()?'오늘의 현재 사용감':'선택한 날의 사용감','feeling',FEEDBACK,entry?.feeling)}${select('기본 관리 실천 정도','adherence',ADHERENCE,entry?.adherence)}<details class="care-optional"><summary>피부 느낌·관련 제품·메모 <small>선택</small></summary>${select('오늘 피부 느낌','feel',FEELS,entry?.feel,false)}<label>함께 기록할 사용 제품<select name="product"><option value="">특정하지 않음 · 모르겠어요</option>${choices.map(product=>`<option value="${product.id}" ${entry?.product?.id===product.id?'selected':''}>${esc(product.title)}</option>`).join('')}</select></label><p class="field-help">불편함과 제품을 함께 저장하면 해당 제품을 사용 후보에서 제외해요. 원인이나 알레르기를 확정하는 것은 아니에요.</p><label>짧은 사용 메모 (선택)<textarea name="memo" maxlength="200" rows="2" placeholder="진단·치료 정보는 적지 마세요.">${esc(entry?.memo??'')}</textarea></label></details><details class="card-details"><summary>저장하면 달라지는 것</summary><p>${feedbackDate===today()?'‘편안했어요’이면 상태의 불편함도 해제하고, ‘불편했어요’이면 사용 제안을 멈춰요. 제외된 제품은 자동으로 다시 선택하지 않아요.':'지난날 사용감은 그날의 월간 기록에만 반영해요. 현재 피부 상태·선택 제품은 유지해요.'}</p></details>${footer(entry?'사용감 기록 수정':'사용감 기록 저장')}</form></section><details class="care-history"><summary>사용 경험 ${care.checkins.length}일 · 최근 14일 표시</summary><ul>${[...care.checkins].reverse().slice(0,14).map(item=>`<li><strong>${item.date} · ${FEEDBACK[item.feeling]}</strong><p>${ADHERENCE[item.adherence]}${item.feel?' · '+FEELS[item.feel]:''}${item.product?' · '+esc(item.product.title):''}${item.memo?' · '+esc(item.memo):''}</p></li>`).join('')}</ul></details><details class="care-history"><summary>계획 변경 이력 ${history.length}건</summary><p class="field-help">상태·제품·경험 저장 시 달라진 계획과 실천 당시 계획을 보관해요. 최근 60건을 유지하며 제품을 삭제해도 당시 이름이 남아요.</p>${[...history].reverse().map(plan=>`<article class="plan-history-entry"><h3>${plan.date} · ${reasonNames[plan.reason]}</h3><p>${esc(plan.title)} · ${FEELS[plan.profile.feel]} · ${PRIORITIES[plan.profile.priority]}</p><p>당시 구매 상한 ${plan.cap===null?'미설정':currency(plan.cap)}</p><details><summary>당시 단계·제품·변경 근거</summary><ul>${plan.steps.map(step=>`<li>${step.period==='morning'?'아침':'저녁'} · ${KINDS[step.kind]} · ${step.product?esc(step.product.title):'제품 미선택'}<p>${esc(step.text)}</p></li>`).join('')}</ul>${plan.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}</details></article>`).join('')||'<p>변경 이력이 아직 없어요. 다음 상태·제품 저장 또는 관리 체크부터 남겨요.</p>'}</details></div>`;
  }
  function review() {
    const data=current().effective,care=data.skinCare??emptyCare();
    if(!care.profile)return `<section class="care-empty"><h2>내 관리 기록을 시작해요</h2><button class="btn primary" data-view="care">관리 계획 시작하기</button></section>`;
    const report=weekReport(data),recordedDays=report.current.recordedDays;
    const weeklyLine=weeklyCareLine(data);
    const rate=weeklyLine?'':report.current.rate===null||report.current.rate===0?'<p class="care-week-start">이번 주 기록을 시작해 볼까요?</p>':recordedDays<3?'<p class="care-week-start">기록을 시작했어요</p>':numericCard('최근 7일 체크율',report.current.rate,'%');
    return `<div class="care-screen"><section class="care-week"><h2>최근 7일</h2>${weeklyLine?`<p class="care-week-summary">${weeklyLine}</p>`:''}${rate}${report.current.uncomfortable?`<p class="care-safety-summary">불편함 기록 · ${report.current.uncomfortable}일</p>`:''}<div class="week-days">${report.days.map(day=>`<button type="button" class="week-day ${day.date===today()?'today':''}" data-care-record-date="${day.date}" ${day.date===today()?'data-main-action="3"':''} aria-label="${day.date} 아침 ${day.entry?.morning?'완료':'미기록'}, 저녁 ${day.entry?.evening?'완료':'미기록'} 기록 열기"><span>${day.date.slice(5)}</span><span class="week-dots" aria-hidden="true"><i class="${day.entry?.morning?'done':''}"></i><i class="${day.entry?.evening?'done':''}"></i></span></button>`).join('')}</div><details class="card-details"><summary>지난주와 비교하기</summary><table class="week-table"><caption>실천·사용감 기록 비교</caption><thead><tr><th scope="row">기록</th><th>이전 7일</th><th>최근 7일</th></tr></thead><tbody>${[['체크한 날','recordedDays'],['아침 완료','morning'],['저녁 완료','evening'],['사용감 기록','feedbackDays'],['편안했던 기록','comfortable'],['불편했던 기록','uncomfortable']].map(([label,key])=>`<tr><th scope="row">${label}</th><td>${report.previous[key]}</td><td>${report.current[key]}</td></tr>`).join('')}</tbody></table></details></section></div>`;
  }
  function history() {
    const plans=current().effective.skinCare?.history??[];
    return `<section class="panel care-history"><h2>계획 변경 이력</h2>${[...plans].reverse().map(plan=>`<article class="plan-history-entry"><h3>${plan.date} · ${reasonNames[plan.reason]}</h3><p>${esc(plan.title)} · ${FEELS[plan.profile.feel]} · ${PRIORITIES[plan.profile.priority]}</p><p>당시 구매 상한 ${plan.cap===null?'설정 안 함':currency(plan.cap)}</p><details><summary>당시 단계·제품·변경 근거</summary><ul>${plan.steps.map(step=>`<li>${step.period==='morning'?'아침':'저녁'} · ${KINDS[step.kind]} · ${step.product?esc(step.product.title):'제품 미선택'}<p>${esc(step.text)}</p></li>`).join('')}</ul>${plan.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}</details></article>`).join('')||'<p>변경 이력이 생기면 여기에 보여드려요.</p>'}</section>`;
  }
  function sources() {
    return `<section class="panel care-sources"><h2>서비스 안내·참고 자료</h2><p>의료 진단·처방, 질환 치료, 성분 적합성 판정은 제공하지 않아요. 사진 관찰은 유캠의 참고값이며 정확도·효과가 검증된 진단이 아니에요.</p><ul>${CARE_SOURCES.map(source=>`<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title} ↗</a></li>`).join('')}</ul><p>계획 계산은 앱 자체 규칙이며 효과를 보장하지 않아요.</p></section>`;
  }
  document.addEventListener('submit',async event=>{
    if(!['skin-profile-form','skin-budget-form','skin-products-form','skin-checkin-form'].includes(event.target.id))return;
    event.preventDefault();if(!guard())return;
    const form=event.target,error=form.querySelector('.form-error'),submit=form.querySelector('[type="submit"]');
    try {
      const fields=new FormData(form),data=current().data,care=data.skinCare??emptyCare();
      let next,reason;
      if(form.id==='skin-profile-form'){
        if(fields.get('consent')!=='on')throw Error('입력한 상태의 저장에 동의해 주세요.');
        const profile=validateSkinProfile({feel:fields.get('feel'),concerns:fields.getAll('concern'),sensitivity:fields.get('sensitivity'),discomfort:fields.get('discomfort'),priority:fields.get('priority'),budget:fields.get('budget')===''?null:Number(fields.get('budget')),updatedAt:today()});
        const monthlyAdjustments={...care.monthlyAdjustments};
        delete monthlyAdjustments[today().slice(0,7)];
        next={...data,skinCare:{...care,profile,monthlyAdjustments}};reason='profile';
      }else if(form.id==='skin-budget-form'){
        if(!care.profile)throw Error('먼저 피부 상태를 저장해 주세요.');
        const profile=validateSkinProfile({...care.profile,budget:fields.get('budget')===''?null:Number(fields.get('budget')),updatedAt:today()});
        next={...data,skinCare:{...care,profile}};reason='profile';
      }else if(form.id==='skin-products-form'){
        if(!care.profile)throw Error('먼저 피부 상태를 저장해 주세요.');
        const selection=validateSelection(Object.fromEntries(Object.keys(KINDS).map(kind=>[kind,fields.get(kind)||null])));
        const eligible=availableInventory(data).filter(item=>item.category==='cosmetic'&&item.comfort==='comfortable');
        for(const [kind,id] of Object.entries(selection))if(id&&!eligible.some(item=>item.id===id&&item.kind===kind))throw Error('제품 종류·사용 경험·기한을 확인하고 다시 선택해 주세요.');
        next={...data,skinCare:{...care,selection}};reason='products';
      }else{
        if(!care.profile)throw Error('먼저 피부 상태를 저장해 주세요.');
        const date=fields.get('date')||today();
        const previous=care.checkins.find(item=>item.date===date),options=feedbackProducts(data,date);
        if(previous?.product&&!options.some(item=>item.id===previous.product.id))options.push(previous.product);
        const product=options.find(item=>item.id===fields.get('product'))??null;
        if(fields.get('product')&&!product)throw Error('기록할 제품을 다시 선택해 주세요.');
        const entry=validateCheckin({date,feeling:fields.get('feeling'),adherence:fields.get('adherence'),memo:fields.get('memo'),feel:fields.get('feel')||null,product});
        next=saveSkinCheckin(data,entry);
      }
      if(reason)next=capturePlan(next,reason);submit.disabled=true;
      if(await ctx.persist(next,form.id==='skin-checkin-form'?'사용감을 저장하고 월간 리포트를 갱신했어요.':'저장했어요. 관리 계획과 변경 이력을 갱신했어요.'))ctx.navigate(form.id==='skin-checkin-form'?'records':form.id==='skin-budget-form'?'settings':form.id==='skin-profile-form'&&!care.profile?'products':'care',form.id==='skin-budget-form'?'budget':'routine');
      else{error.textContent='저장하지 못했어요. 입력과 기존 기록을 유지했으니 다시 시도해 주세요.';submit.disabled=false;}
    }catch(issue){error.textContent=issue.message;submit.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const recordDay=event.target.closest('[data-care-record-date]');
    if(recordDay){ctx.openCheckin?.(recordDay.dataset.careRecordDate);return;}
    const dayButton=event.target.closest('[data-care-day]');
    if(dayButton){
      if(!guard())return;const period=dayButton.dataset.careDay,data=current().data;
      try {const day=data.skinCare.days.find(entry=>entry.date===today()),previousCount=completedCareDates(data.skinCare).size,firstCheckin=previousCount===0;dayButton.disabled=true;const saved=await ctx.persist(saveDaily(data,period,!day?.[period]),'오늘 관리 체크를 저장했어요.');if(saved){await ctx.afterDailySave?.(previousCount);if(firstCheckin&&!day?.[period])void ctx.offerReminder?.();}else dayButton.disabled=false;}
      catch(issue){dayButton.disabled=false;ctx.toast(issue.message);}return;
    }
    const button=event.target.closest('[data-care]');if(!button||!guard())return;
    if(button.dataset.care==='feedback-date'){
      const input=document.getElementById('skin-feedback-date');
      if(!input?.value||!input.checkValidity()){ctx.toast('오늘 또는 이전 날짜를 선택해 주세요.');return;}
      const form=document.getElementById('skin-checkin-form');
      if(form?.dataset.dirty==='true'&&!confirm('저장하지 않은 사용감 입력을 버리고 선택한 날짜를 불러올까요?'))return;
      feedbackDate=input.value;ctx.render?.();return;
    }
    if(button.dataset.care==='delete')ctx.dialog('피부 정보를 삭제할까요?','<p class="modal-sub">피부 상태·실천 체크·사용 경험·사진 관찰 이력·계획 이력·월별 관리 목표를 삭제해요. 소비·예산·뷰티 목표·보유 제품과 제품의 불편함 표시는 남아요. 별도 백업 파일과 유캠 원격 사진은 삭제되지 않아요.</p><div class="modal-actions"><button class="btn secondary" data-action="close">취소</button><button class="btn danger" data-care="confirm-delete">피부 정보 삭제</button></div>');
    if(button.dataset.care==='confirm-delete')await ctx.persist({...current().data,skinCare:emptyCare()},'피부 상태와 관리 기록을 삭제했어요.');
  });
  document.addEventListener('input',event=>{const form=event.target.closest('#skin-checkin-form');if(form)form.dataset.dirty='true';});
  return {home,render:()=>{const data=current().effective,photo=photoUI.render(),routineView=render();return routineView+photo;},review,history,sources,skinBudget,resetPhoto:()=>photoUI.reset()};
}
