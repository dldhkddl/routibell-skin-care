import { icon } from './아이콘.js';
import { PHOTO_LABELS, PHOTO_NOTES, photoReference, photoResultUrl } from './사진계산.js';
import { PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { capturePlan, buildSkinPlan } from './피부계산.js';
import { photoHistory, savePhotoObservation } from './사진이력.js';
import { PHOTO_ACTIONS, PHOTO_GROUPS, DEFAULT_PHOTO_ACTIONS, PHOTO_CONSENT_VERSION, validatePhotoActions, photoPriceBand } from './사진항목.js';
import { buildPhotoGuidance, guidanceFromReference, renderPhotoGuidance } from './사진설명.js';
import { renderPhotoTrends, renderPhotoComparison, photoTimeline, revealTrendImages } from './사진그래프.js';
import { renderResultCard } from './결과카드.js';
import { createResultPhoto } from './임시결과사진.js';
import { today } from './계산.js';

const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const renderCapacityNotice=capacity=>`<div class="photo-ready" role="status"><strong>${capacity?.closedTotal?'사진 분석이 잠시 마감됐어요. 다시 열리면 알려드릴게요.':'오늘 분석은 마감됐어요. 내일 다시 열려요.'}</strong></div>`;
const consentVersion = PHOTO_CONSENT_VERSION;
const serviceMessages = {
  PHOTO_OWNER:'이 분석 결과는 다른 계정의 기록이에요. 분석을 요청한 계정으로 로그인해 주세요.',
  LOCAL_AUTH_REQUIRED:'로그인 상태를 확인한 뒤 사진 분석을 다시 열어 주세요.',
  PHOTO_AUTH_REQUIRED:'로그인 후 사진 분석을 다시 열어 주세요.',
  KEY_REQUIRED:'지금은 사진 분석을 이용할 수 없어요. 사진 없이도 관리 기록을 이어갈 수 있어요.',
  AUTH_FAILED:'사진 분석 서비스에 연결할 수 없어요. 사진은 전송하지 않았어요.',
  ANALYSIS_DISABLED:'지금은 사진 분석을 이용할 수 없어요. 사진 없이도 관리 기록을 이어갈 수 있어요.',
  LOOKUP_DISABLED:'지금은 사진 분석을 시작할 수 없어요. 사진은 전송하지 않았어요.',
  ANALYSIS_USED:'이미 요청한 분석이 있어요. 새로 보내지 말고 결과를 확인해 주세요.',
  UPGRADE_REQUIRED:'무료 분석 체험을 사용했어요. 이용권을 확인해 주세요.',
  MONTHLY_LIMIT:'이번 결제 기간의 분석 횟수를 모두 사용했어요.',
  ANALYSIS_DAILY_CAP:'오늘 분석은 마감됐어요. 내일 다시 열려요.',
  ANALYSIS_TOTAL_CAP:'사진 분석이 잠시 마감됐어요. 다시 열리면 알려드릴게요.',
  QUOTE_LIMIT:'잠시 후 다시 시도해 주세요. 사진은 전송하지 않았어요.',
  PRICE_UNCONFIRMED:'지금은 사진 분석을 시작할 수 없어요. 사진은 전송하지 않았어요.',
  PRICE_CHANGED:'분석을 시작하지 않았어요. 잠시 후 다시 시도해 주세요.',
  QUOTE_EXPIRED:'분석 준비 시간이 지났어요. 다시 시도해 주세요.',
  PHOTO_CONSENT_REQUIRED:'사진 전송 동의를 확인해 주세요.',
  ANALYSIS_PROVIDER_ERROR:'분석 서비스에 연결하지 못했어요. 새로 요청하기 전에 기존 결과를 확인해 주세요.',
  ANALYSIS_CONNECTION:'결과를 확인하지 못했어요. 새로 요청하지 말고 기존 결과를 확인해 주세요.',
  ANALYSIS_TIMEOUT:'결과 확인이 늦어지고 있어요. 새로 요청하지 말고 기존 결과를 확인해 주세요.',
};

export function createPhotoUI(ctx) {
  document.addEventListener('toggle',event=>{revealTrendImages(event);if(event.target.id==='photo-result-details'&&event.target.isConnected)detailsOpen=event.target.open;},true);
  let settings = null, quote = null, photo = null, preview = '', dimensions = '', job = null;
  let pending = false, message = '', failure = false, focus = 'pore', proposal = null, timer = null, pollingUntil = 0;
  let selected=[...DEFAULT_PHOTO_ACTIONS];
  let detailsOpen=false,generation=0,revealResult=false;
  const resultPhoto=createResultPhoto({onExpire:()=>repaint()});
  const maximum=()=>settings?.access?.fullAnalysis===true&&settings.access.maxActions===16?16:4;
  const guard = () => {
    const state = ctx.state();
    if (state.demo || state.storageError || state.busy) { ctx.toast(state.demo?'내 기록으로 돌아간 뒤 사진 분석을 이용해 주세요.':state.busy?'기록을 저장하고 있어요. 잠시 후 다시 시도해 주세요.':'기록을 불러온 뒤 사진 분석을 이용할 수 있어요.'); return false; }
    return true;
  };
  const repaint = () => {
    const root = document.getElementById('photo-analysis');
    if (root) {root.outerHTML = render();if(revealResult){revealResult=false;const heading=document.getElementById('photo-title');heading?.scrollIntoView({block:'start',behavior:'smooth'});heading?.focus({preventScroll:true});}}
  };
  const clearPhoto = () => { if (preview) URL.revokeObjectURL(preview); photo = null; preview = ''; dimensions = ''; };
  const active = () => ['running', 'receiving'].includes(job?.state);
  async function request(path, options = {}) {
    const stamp=generation;
    const response = await (ctx.photoFetch ?? fetch)(path.replace(/^\/api\//,'/api/youcam/'), {
      ...options, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(35000),
      headers: { ...(settings ? { 'X-Local-Token': settings.localToken } : {}), ...options.headers },
    });
    const data = await response.json();
    if(stamp!==generation)throw Error('이전 계정의 사진 결과는 표시하지 않아요.');
    if (!response.ok) {
      const issue=Error(serviceMessages[data.error?.code] ?? data.error?.message ?? '사진 분석 요청을 처리하지 못했어요.');
      issue.code=data.error?.code;
      throw issue;
    }
    return data;
  }
  const postConsent = (path,extra={}) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true,...extra }) });
  async function getResult() {
    const stamp=generation;
    clearTimeout(timer);
    const state = await request('/api/analysis/result');
    if (state.job?.state === 'success') {
      if(!state.job.result.items?.some(item=>item.type===focus))focus=state.job.result.items?.[0]?.type;
      for (const item of state.job.result.items) for(const address of item.images??(item.image?[item.image]:[])) photoResultUrl(address);
    }
    if(state.job?.state==='success'&&job?.state!=='success')revealResult=true;
    settings.analysisUsed = state.used; if(state.access)settings.access=state.access; job = state.job;
    if (job?.state === 'success') {
      resultPhoto.bind(job.result.completedAt);
      clearPhoto(); message = '분석이 완료됐어요. 아직 관리 계획에는 반영하지 않았어요.';
    } else if (active()) {
      message = '분석 진행 중이에요. 창을 닫아도 유캠 작업은 취소되지 않아요. 새 요청 대신 기존 결과만 확인해요.';
      if (Date.now() < pollingUntil) timer = setTimeout(async () => {
        try { await getResult(); } catch { if(stamp===generation){failure = true; message = '결과 연결이 끊겼어요. 다시 분석하지 말고 기존 결과 확인을 눌러 주세요.';} }
        if(stamp===generation)repaint();
      }, 2000);
    } else if (job?.message) { message = serviceMessages[job.code] ?? job.message; failure = true; clearPhoto(); resultPhoto.clear(); }
  }
  function comparisonFields(result) {
    const entries=photoHistory(ctx.state().data.skinCare).filter(entry=>entry.completedAt!==result.completedAt && (!entry.completedAt || entry.completedAt<result.completedAt));
    if(!entries.length)return '<p class="field-help">첫 관찰은 비교 기준으로 저장돼요. 다음 분석부터 같은 촬영 조건인지 확인할 수 있어요.</p>';
    return `<label>다음 비교에 쓸 이전 관찰<select id="photo-baseline">${entries.map(entry=>`<option value="${esc(entry.id)}">${entry.reference.date} · ${esc(PHOTO_LABELS[entry.reference.focus])}</option>`).join('')}</select></label><label class="checkbox"><input id="photo-matched" type="checkbox"> 선택한 관찰과 조명·거리·각도·화장 여부가 같음을 직접 확인했어요.</label><p class="field-help">확인하지 않아도 결과는 보관할 수 있어요. 조건이 확인된 서로 다른 날짜의 기록만 차이를 계산해요.</p>`;
  }
  function selectionPanel(){
    const limit=maximum(),locked=pending||active()||settings?.analysisUsed;
    return `<section class="photo-selection" aria-labelledby="photo-selection-title"><div class="section-head"><h3 id="photo-selection-title">분석 항목 고르기</h3><span class="small-badge" role="status">${selected.length} / ${limit}개 선택</span></div><p class="field-help">${limit===16?'최대 16개까지 선택할 수 있어요.':'최대 4개까지 선택할 수 있어요. 다른 항목을 고르려면 먼저 선택을 해제해 주세요.'}</p>${PHOTO_GROUPS.map(group=>`<fieldset ${locked?'disabled':''}><legend>${group.label}</legend><div class="photo-options">${group.actions.map(action=>`<label class="photo-option ${selected.includes(action)?'selected':''}" for="photo-option-${action}"><input id="photo-option-${action}" type="checkbox" data-photo-concern="${action}" ${selected.includes(action)?'checked':''} ${!selected.includes(action)&&selected.length>=limit?'disabled':''}><span>${PHOTO_SIMPLE_LABELS[action]}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="photo-selection-tools"><button type="button" class="text-link" data-photo="select-clear" ${locked?'disabled':''}>모두 해제</button>${limit===16?`<button type="button" class="btn secondary" data-photo="select-all" ${locked?'disabled':''}>전체 선택</button>`:''}</div></section>`;
  }
  function consentSheet(){
    const actions=selected.map(action=>esc(PHOTO_SIMPLE_LABELS[action])).join(' · ');
    return `<div class="photo-consent-sheet">
      <div class="photo-notice"><strong>사진 분석을 위해 해외로 전송돼요</strong><dl class="photo-transfer-list"><div><dt>보내는 정보</dt><dd>얼굴 사진 1장, 선택한 분석 항목 (${actions})</dd></div><div><dt>받는 곳</dt><dd>Perfect Corp. (대만) · person001@example.invalid</dd></div><div><dt>전송 국가·방법</dt><dd>미국 서버 / 분석 시작 버튼을 누를 때 암호화 통신으로 전송</dd></div><div><dt>목적·보관</dt><dd>피부 분석 수행 / 업로드 사진·결과 이미지는 분석 후 최대 30일 보관 뒤 삭제. 모델 학습에는 명시적 동의 없이 쓰지 않아요.</dd></div><div><dt>동의하지 않으면</dt><dd>사진 분석만 쓸 수 없고, 다른 기능은 그대로 쓸 수 있어요.</dd></div></dl><p class="field-help">유캠의 일부 처리 데이터는 법령상 사유 등으로 더 오래 보관될 수 있어요.</p></div>
      <details class="photo-extra"><summary>사진 처리 자세히 보기</summary><p>앱에는 사진 원본을 저장하지 않아요. 결과 표시 이미지는 암호화된 임시 결과로 계정 서버에 남으며, 임시 결과를 지우거나 탈퇴하면 삭제돼요. 동의해 저장한 관찰값·날짜·비교 조건은 계정 기록에 남아요.</p><p>분석이 끝나면 유캠에 작업·파일 삭제를 요청해요. 실패할 수 있어 최대 30일 보관 안내는 유지해요. 사진의 위치 등 메타데이터는 전송 전에 제거하며 얼굴·조명 품질을 자동 판정하지 않아요.</p><a href="https://docs.perfectcorp.com/develop/file_retention_period" target="_blank" rel="noopener noreferrer">보관 안내 ↗</a> · <a href="https://www.perfectcorp.com/perfectbeauty/youcam/privacy-policy-api" target="_blank" rel="noopener noreferrer">유캠 개인정보 안내 ↗</a></details>
      <label class="checkbox"><input id="photo-quality" type="checkbox"> 본인의 성인 사진이며 촬영 조건을 확인했어요.</label>
      <label class="checkbox"><input id="photo-consent" type="checkbox"> 사진을 외부 분석 서비스로 전송하는 데 동의해요.</label>
      <label class="checkbox"><input id="photo-overseas-consent" type="checkbox"> 위 내용을 확인하고 얼굴 사진·선택 항목의 국외 이전에 별도로 동의해요.</label>
      <p id="photo-consent-error" class="form-error" role="alert"></p>
      <div class="modal-actions"><button type="button" class="btn secondary" data-action="close">나중에</button><button type="button" class="btn primary" data-photo="confirm">동의하고 분석 시작</button></div>
    </div>`;
  }
  function render() {
    const state = ctx.state(), saved = state.effective.skinCare?.observation;
    const blocked = state.demo || state.storageError;
    if (blocked) return '<section id="photo-analysis" class="photo-panel"><h2>선택 · 사진 관찰</h2><p>내 기록에서만 연결할 수 있어요. 샘플 사진은 외부로 보내지 않아요.</p></section>';
    const result = job?.state === 'success' ? job.result : null;
    const guidance=result?buildPhotoGuidance(result,state.data):null;
    const savedGuidance=!result&&saved?buildPhotoGuidance(guidanceFromReference(saved),state.data):null;
    const overview=renderResultCard({result,reference:saved,photoUrl:result?resultPhoto.read(result.completedAt):'',care:state.data.skinCare});
    const comparison=overview?renderPhotoComparison(photoTimeline(state.data.skinCare,result)):'';
    const firstStep=!Object.hasOwn(state.data.budgets,today().slice(0,7));
    const alert=(guidance?.paused??savedGuidance?.paused)?'불편함 기록 · 새 관리 제안을 멈췄어요.':null;
    const nextStep=pending?'사진 분석을 준비하고 있어요.':!photo?'먼저 내 얼굴 사진을 선택해 주세요.':!selected.length?'분석할 항목을 1개 이상 선택해 주세요.':'분석 버튼을 누르면 사진 전송 내용을 확인할 수 있어요.';
    const access=settings?.access??ctx.access?.();
    const trialLocked=Boolean(access?.tier==='free'&&access.trialLocked&&access.remaining===0&&!active());
    const capacityClosed=Boolean(access?.capacity?.closedDaily||access?.capacity?.closedTotal);
    const upgrade=Boolean(settings?.analysisUsed&&!active()&&settings?.access?.remaining===0&&!trialLocked);
    const retryPhoto=job?.state==='failed'&&job.code==='PHOTO_RETRY'&&settings?.analysisEnabled&&!settings.analysisUsed;
    return `<section id="photo-analysis" data-photo-card class="photo-panel ${overview?'photo-panel-result':''}" aria-labelledby="photo-title">
      ${overview?`${overview}${comparison}${alert?`<p class="result-alert" role="status">${esc(alert)}</p>`:''}${failure?`<p class="result-alert" role="alert">${esc(message)}</p>`:''}<details class="photo-result-details" data-photo-details id="photo-result-details" ${detailsOpen?'open':''}><summary data-main-action="5">상세 리포트 보기 ${icon('chevron')}</summary><div class="photo-result-detail-body">`:''}
      <div class="section-head"><h2 id="${overview?'photo-detail-title':'photo-title'}">${icon('drop')} 사진으로 피부 살펴보기</h2></div>
      <p>나의 관심 항목을 선택하고, 사진 관찰을 관리 기록으로 이어가요.</p>
      ${saved?`<div class="photo-saved"><strong>내 계획에 반영한 관찰 · ${esc(PHOTO_SIMPLE_LABELS[saved.focus])}</strong><p>${saved.date} · 지금의 피부 느낌과 함께 살펴봐요.</p><button type="button" class="text-link" data-photo="remove">계획에서 사진 참고 제외</button></div>`:''}
      ${savedGuidance?`${renderPhotoGuidance(savedGuidance)}${renderPhotoTrends({care:state.data.skinCare,guidance:savedGuidance,hideComparison:Boolean(overview)})}`:''}
        ${!settings&&!trialLocked&&!capacityClosed?`<div class="photo-ready"><div class="photo-steps"><span>사진 선택</span>${icon('chevron')}<span>전송 동의</span>${icon('chevron')}<span>관찰 결과</span></div><button type="button" class="btn primary full-width" data-photo="connect" ${firstStep?'data-main-action="25"':''} ${pending?'disabled':''}>${pending?'이용 가능 여부 확인 중…':'사진 분석 준비하기'}</button><p class="field-help">사진은 직접 선택하고 동의한 뒤에만 전송해요.</p></div>`:settings&&!settings.analysisEnabled&&!trialLocked?`<div class="photo-ready"><strong>지금은 사진 분석을 이용할 수 없어요</strong><p>피부 느낌을 기록하면 오늘의 관리 계획을 확인할 수 있어요.</p><button type="button" class="btn secondary" data-photo="connect" ${pending?'disabled':''}>다시 확인</button></div>`:''}
        ${retryPhoto?`<div class="photo-retry"><p role="alert">${esc(message)}</p><label class="photo-upload">다른 사진 올리기<input id="photo-file" type="file" accept="image/jpeg,image/png" ${pending?'disabled':''}></label></div>`:''}
        ${capacityClosed?renderCapacityNotice(access.capacity):''}
        ${trialLocked&&!capacityClosed?`<div class="photo-ready photo-trial-lock"><strong>${esc(access.trialRequiredDays)}일만 같이 챙겨보면 사진 분석을 한 번 해드릴게요</strong><span class="photo-trial-progress">${esc(Math.min(access.completedCheckinDays,access.trialRequiredDays))}/${esc(access.trialRequiredDays)}</span><button type="button" class="btn primary full-width" data-photo="checkin">오늘 체크인하기</button></div>`:''}
        ${settings?.analysisEnabled!==false&&!settings?.analysisUsed&&!trialLocked&&!capacityClosed&&settings?selectionPanel():''}
        ${settings?.analysisEnabled&&!settings.analysisUsed&&!retryPhoto&&!trialLocked&&!capacityClosed?`
          <div class="photo-capture"><label class="photo-upload">${preview?'다른 사진 고르기':'내 사진 고르기'}<input id="photo-file" type="file" accept="image/jpeg,image/png" ${pending?'disabled':''}></label>
          <p class="field-help">정면에서 얼굴을 크게(가로 60% 초과) 담아 주세요.<br>한 사람만, 얼굴 전체가 밝게 보이도록 찍어 주세요.</p>
          <details class="photo-shooting-guide"><summary>촬영 방법 자세히 보기</summary><ul><li>앞머리·손·안경이 얼굴을 가리지 않게 해요.</li><li>흔들림·역광·강한 필터를 피하고 메이크업은 지우면 좋아요.</li><li>눈을 뜨고 입을 다문 채 얼굴을 중앙에 둬요.</li></ul></details>
          ${preview?`<img class="photo-preview" src="${esc(preview)}" alt="분석 전 선택한 사진 미리보기"><p class="field-help">사진을 준비했어요. 아직 전송하지 않았어요.</p>`:''}
          <p class="field-help">사진 분석은 선택이에요. 시작 전에 해외 전송 안내와 동의를 확인해요.</p>
          <p id="photo-start-help" class="field-help" role="status">${nextStep}</p>
          <button type="button" class="btn primary full-width" data-photo="start" ${firstStep?'data-main-action="27"':''} aria-describedby="photo-start-help" ${pending||!photo||!selected.length?'disabled':''}>사진 분석하기</button></div>`:''}
        ${upgrade?`<div class="photo-ready"><strong>${settings.access.tier==='free'&&settings.access.freeTrialRemaining===0?'무료 분석 체험을 사용했어요':'이번 분석 이용 횟수를 모두 썼어요'}</strong><button type="button" class="btn primary full-width" data-photo="upgrade">이용권 살펴보기</button></div>`:''}
        ${settings?.analysisUsed&&job?`<button type="button" class="text-link" data-photo="result" ${pending?'disabled':''}>분석 결과 다시 보기</button>`:''}
${retryPhoto?'':`<p class="${failure?'form-error':'field-help'}" role="status" aria-live="polite">${esc(message)}</p>`}${result?`<div class="photo-results"><h3>사진 관찰 결과</h3>${renderPhotoGuidance(guidance)}${renderPhotoTrends({care:state.data.skinCare,result,guidance,hideComparison:Boolean(overview)})}${comparisonFields(result)}<label>내가 관찰하고 싶은 항목<select id="photo-focus">${result.items.map(item=>[item.type,PHOTO_LABELS[item.type]]).map(([key,label])=>`<option value="${key}" ${focus===key?'selected':''}>${label}</option>`).join('')}</select></label><p class="field-help">낮은 점수만으로 우선순위를 정하지 않아요. 피부 느낌을 아래에서 먼저 저장한 뒤 제안을 확인하세요.</p><button type="button" class="btn secondary full-width" data-photo="proposal" ${pending||result.items.some(item=>item.verified===false)?'disabled':''}>현재 피부 느낌·보유 제품과 계획 미리보기</button>${proposal?`<div class="photo-proposal"><h3>적용 전 관리 계획</h3><p>${esc(proposal.plan.title)}</p><p>${esc(PHOTO_NOTES[focus])}</p>${proposal.plan.paused?'<p>현재 불편함 답변을 우선해 제품 사용 제안을 멈춰요.</p>':`<ul>${proposal.plan.morning.map(step=>`<li>${esc(step.title)} · ${step.product?esc(step.product.title):'제품 직접 선택 필요'}</li>`).join('')}</ul>`}<p class="field-help">기존 예산과 선택 제품은 그대로예요. 숫자·관찰 항목·날짜·비교 조건을 이력으로 저장해 월간 리포트에 연결해요. 원본 사진은 저장하지 않아요.</p><label class="checkbox"><input id="photo-save-consent" type="checkbox"> 이 관찰을 이력으로 저장하고 루틴·리포트에 반영할게요.</label><button type="button" class="btn primary full-width" data-photo="apply" ${pending?'disabled':''}>확인한 제안 적용하기</button></div>`:''}<button type="button" class="text-link" data-photo="clear" ${pending?'disabled':''}>임시 결과 지우기</button></div>`:''}
${overview?'</div></details>':''}</section>`;
  }
  document.addEventListener('change', async event => {
    if(event.target.dataset?.photoConcern){
      if(!guard()||pending||active()||settings?.analysisUsed)return;
      const action=event.target.dataset.photoConcern;
      if(!PHOTO_ACTIONS.includes(action))return;
      const next=event.target.checked?[...new Set([...selected,action])]:selected.filter(item=>item!==action);
      if(next.length>maximum()){message=`최대 ${maximum()}개까지 선택할 수 있어요.`;failure=true;}
      else{selected=PHOTO_ACTIONS.filter(item=>next.includes(item));quote=null;proposal=null;failure=false;message='선택 항목이 바뀌었어요. 전송 동의를 다시 확인해 주세요.';}
      repaint();document.getElementById(`photo-option-${action}`)?.focus?.();return;
    }
    if (event.target.id === 'photo-focus' && job?.result?.items.some(item=>item.type===event.target.value)) { focus = event.target.value; proposal = null; repaint(); return; }
    if (event.target.id !== 'photo-file' || !guard() || pending || active()) return;
    const file = event.target.files?.[0];
    const stamp=generation;
    clearPhoto(); proposal = null; failure = false;
    if (!file) { repaint(); return; }
    if(job?.state==='failed')job=null;
    pending = true;
    let bitmap;
    try {
      if (!['image/jpeg','image/png'].includes(file.type) || file.size >= 10000000) throw Error('10MB 미만의 JPEG/PNG 사진을 골라 주세요.');
      try{bitmap = await createImageBitmap(file);}
      catch{throw Error('사진을 열지 못했어요. JPG 또는 PNG 사진을 다시 골라 주세요.');}
      if(stamp!==generation)return;
      if (Math.min(bitmap.width,bitmap.height) < 480 || bitmap.width*bitmap.height > 36000000) throw Error('짧은 변 480px 이상, 3,600만 화소 이하 사진이 필요해요.');
      const scale = Math.min(1, 2560/Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
      if (Math.min(canvas.width,canvas.height) < 480) throw Error('너무 긴 파노라마 사진은 사용할 수 없어요. 정면 세로 사진을 골라 주세요.');
      const context = canvas.getContext('2d');
      if(!context)throw Error('이 기기에서 사진을 준비하지 못했어요. 다른 브라우저에서 다시 시도해 주세요.');
      context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const prepared = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.94));
      if(stamp!==generation)return;
      photo=prepared;
      if (!photo || photo.size >= 10000000) throw Error('사진을 준비하지 못했어요. 다른 JPEG/PNG 사진을 골라 주세요.');
      preview = URL.createObjectURL(photo); dimensions = `${canvas.width} × ${canvas.height}px`;
      message = '사진을 준비했어요. 동의 전에는 전송하지 않아요.';
    } catch (issue) { if(stamp===generation){clearPhoto(); failure = true; message = issue.message;} }
    finally { bitmap?.close(); if(stamp===generation){pending = false; repaint();} }
  });
  document.addEventListener('click', async event => {
    const guidanceLink=event.target.closest('[data-guidance-target]');
    if(['care','records'].includes(guidanceLink?.dataset.guidanceTarget)){
      if(!guard())return;
      if(guidanceLink.dataset.guidanceTarget==='care'){
        const field=guidanceLink.dataset.guidanceField==='discomfort'?'discomfort':'feel';
        location.hash='care';
        setTimeout(()=>{const form=document.getElementById('skin-profile-form');const details=form?.closest('details');if(details)details.open=true;form?.scrollIntoView({block:'start',behavior:'smooth'});form?.querySelector(`select[name="${field}"]`)?.focus();},0);
      }else location.hash='records';
      return;
    }
    const button = event.target.closest('[data-photo]');
    if (!button || !guard() || pending) return;
    const action = button.dataset.photo;
    if(action==='upgrade'){ctx.navigate?.('settings','subscription');return;}
    if(action==='checkin'){ctx.navigate?.('home');return;}
    if(action==='detail'){
      if(!PHOTO_ACTIONS.includes(button.dataset.photoType))return;
      const details=button.closest('[data-photo-card]')?.querySelector('[data-photo-details]')??document.getElementById('photo-result-details');
      if(details){detailsOpen=true;details.open=true;const trend=details.querySelector(`[data-trend="${button.dataset.photoType}"]`);if(trend){trend.open=true;trend.scrollIntoView({block:'center',behavior:'smooth'});trend.querySelector('summary')?.focus({preventScroll:true});}}
      return;
    }
    if(action==='start'){
      try{
        if(!settings?.analysisEnabled||settings.analysisUsed||active())throw Error('요청한 분석이 있는지 먼저 확인해 주세요.');
        if(!ctx.state().data.skinCare.profile)throw Error('분석 전에 피부 느낌·불편함을 저장해 주세요. 결과를 실제 루틴에 연결하는 데 필요해요.');
        if(photoHistory(ctx.state().data.skinCare).length>=240)throw Error('사진 관찰 240건이 보관 중이에요. 오래된 관찰을 정리한 뒤 분석해 주세요. 아직 사진을 전송하지 않았어요.');
        if(!photo||!selected.length)throw Error('사진과 분석 항목을 먼저 골라 주세요.');
        validatePhotoActions(selected,maximum());
        failure=false;message='';repaint();
        ctx.dialog('사진 전송 확인',consentSheet());
        const title=document.getElementById('dialog-title');
        title?.setAttribute('tabindex','-1');
        title?.focus({preventScroll:true});
        const editor=document.getElementById('editor');
        if(editor)editor.scrollTop=0;
      }catch(issue){failure=true;message=issue.message;repaint();}
      return;
    }
    const stamp=generation;
    const baselineId = action === 'proposal' && document.getElementById('photo-matched')?.checked ? document.getElementById('photo-baseline')?.value ?? null : null;
    try {
      failure = false;
      if(action==='select-clear'||action==='select-all'){
        if(active()||settings?.analysisUsed)throw Error('이미 요청한 분석의 항목은 바꿀 수 없어요.');
        if(action==='select-all'&&maximum()!==16)throw Error('현재는 최대 4개까지 선택할 수 있어요.');
        selected=action==='select-all'?[...PHOTO_ACTIONS]:[];quote=null;proposal=null;message='선택 항목의 전송 동의를 다시 확인해 주세요.';repaint();return;
      }
      if (action === 'connect') {
        if (active()) throw Error('분석 중이에요. 새로 연결하지 말고 결과를 확인해 주세요.');
        clearTimeout(timer);
        settings = null; quote = null; proposal = null; job = null;
      }
      if (action === 'confirm') {
        const sheet=document.querySelector('#editor[open] .photo-consent-sheet');
        if(!sheet)return;
        const error=sheet.querySelector('#photo-consent-error');
        if(!settings?.analysisEnabled||settings.analysisUsed||active()||!photo||!selected.length||!ctx.state().data.skinCare.profile||photoHistory(ctx.state().data.skinCare).length>=240){error.textContent='분석 준비 상태가 바뀌었어요. 창을 닫고 다시 확인해 주세요.';return;}
        if(!sheet.querySelector('#photo-quality')?.checked||!sheet.querySelector('#photo-consent')?.checked||!sheet.querySelector('#photo-overseas-consent')?.checked){error.textContent='촬영 조건·사진 전송·국외 이전 동의를 각각 확인해 주세요.';return;}
        try{validatePhotoActions(selected,maximum());}catch(issue){error.textContent=issue.message;return;}
        document.getElementById('editor').close();
      }
      if (action === 'apply' && !document.getElementById('photo-save-consent')?.checked) throw Error('관찰 기록 저장과 계획 적용에 동의해 주세요.');
      pending = true; repaint();
      if (action === 'connect') {
        const connection=ctx.photoConnection?await ctx.photoConnection():{path:'/api/youcam'};
        if(stamp!==generation)return;
        if(connection.path!=='/api/youcam')throw Error('사진 분석 연결을 업데이트한 뒤 다시 열어 주세요.');
        settings = await request('/api/status');
        if(settings.accountScoped!==true){settings=null;throw Error('계정 보호를 위해 사진 분석 연결을 업데이트해야 해요. 사진은 전송하지 않았어요.');}
        if (typeof settings.analysisUsed !== 'boolean') { settings = null; throw Error('사진 분석 연결을 업데이트해야 해요. 사진은 전송하지 않았어요.'); }
        message = settings.access?.trialLocked?'':settings.analysisEnabled?(settings.access?.remaining===0?'':'사진을 선택해 주세요. 동의 전에는 전송하지 않아요.'):'지금은 사진 분석을 이용할 수 없어요. 관리 기록은 계속 이용할 수 있어요.';
          if(selected.length>maximum()){selected=[];quote=null;message='이용 범위가 바뀌었어요. 분석할 항목을 다시 선택해 주세요.';}
          pollingUntil = Date.now() + 210000; await getResult();
      } else if (action === 'confirm') {
        const actions=validatePhotoActions(selected,maximum());
        const response=await postConsent('/api/analysis/quote',{actions});
        if (response.consentVersion !== consentVersion || !Number.isFinite(response.credits) || response.credits > photoPriceBand(actions.length).cap || response.credits < 0 || !Number.isFinite(response.expiresAt)||response.expiresAt<=Date.now()||JSON.stringify(response.actions)!==JSON.stringify(actions)) throw Error('분석 준비를 확인하지 못했어요. 사진은 전송하지 않았어요.');
        quote=response;
        settings.analysisUsed = true;
        job = { state: 'receiving' };
        resultPhoto.remember(photo);detailsOpen=false;
        await request('/api/analysis/start', { method: 'POST', headers: { 'Content-Type': photo.type, 'X-Photo-Consent': consentVersion, 'X-Overseas-Consent': consentVersion, 'X-Quote-Id': quote.id }, body: photo });
        clearPhoto(); pollingUntil = Date.now() + 210000; await getResult();
      } else if (action === 'result') { pollingUntil = Date.now() + 210000; await getResult(); }
      else if (action === 'clear') { await postConsent('/api/analysis/clear'); resultPhoto.clear(); job = null; proposal = null; message = '임시 결과를 지웠어요. 유캠에 보관된 사진과 저장한 관찰 기록은 그대로예요.'; }
      else if (action === 'proposal') {
        const data = ctx.state().data;
        if (!data.skinCare.profile) throw Error('아래에서 피부 느낌·불편함을 먼저 입력하고 저장해 주세요. 사진으로 답변을 대신하지 않아요.');
        const next = savePhotoObservation(data, job.result, focus, baselineId);
        proposal = { next, base: JSON.stringify(data), plan: buildSkinPlan(next) };
      } else if (action === 'apply') {
        const data = ctx.state().data;
        if (!proposal || proposal.base !== JSON.stringify(data)) { proposal = null; throw Error('피부 상태·제품·예산이 바뀌었어요. 현재 상태로 제안을 다시 확인해 주세요.'); }
        const next = capturePlan(proposal.next,'observation');
        if (!await ctx.persist(next,'사진 참고값을 저장했어요. 기존 느낌·예산·제품은 유지했어요.')) throw Error('저장에 실패했어요. 기존 계획은 유지하며 제안은 다시 적용할 수 있어요.');
        proposal = null; message = '사진 관찰을 기록하고 오늘 루틴을 정리했어요.';ctx.navigate?.('care','routine');
      } else if (action === 'remove') {
        const data = ctx.state().data;
        if (!await ctx.persist({...data,skinCare:{...data.skinCare,observation:null}},'계획에서 사진 참고값을 제외했어요.')) throw Error('저장에 실패해 기존 참고값을 유지했어요.');
        proposal = null; message = '현재 참고값을 제외했어요. 과거 계획 설명과 별도 백업은 남아 있어요.';
      }
    } catch (issue) {
      if(stamp!==generation)return;
      if(action==='confirm'&&job?.state==='receiving'){
        try{await getResult();}catch{}
        if(job?.state==='success'){failure=false;return;}
        if(settings?.analysisUsed===false)resultPhoto.clear();
      }
      failure = true; message = job?.state==='failed'&&job.message ? serviceMessages[job.code]??job.message : ['TypeError','TimeoutError'].includes(issue.name) ? '사진 분석에 연결하지 못했어요. 이미 분석을 요청했다면 다시 보내지 말고 결과를 확인해 주세요.' : issue.message;
    } finally { if(stamp===generation){pending = false; repaint();} }
  });
  return { render, reset(){generation++;clearTimeout(timer);clearPhoto();resultPhoto.clear();settings=null;quote=null;job=null;proposal=null;message='';pending=false;failure=false;detailsOpen=false;revealResult=false;selected=[...DEFAULT_PHOTO_ACTIONS];focus='pore';} };
}
