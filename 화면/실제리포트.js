import { CATEGORIES, currency, today } from './계산.js';
import { monthlyReport, monthlyProposal, applyMonthlyProposal, latestReportMonth } from './월간계산.js';
import { PHOTO_LABELS } from './사진계산.js';
import { photoHistory, removePhotoObservation } from './사진이력.js';
import { KINDS, PRIORITIES } from './피부계산.js';
import { PRODUCT_KINDS } from './화장대순서.js';
import { icon } from './아이콘.js';
import { buildPhotoGuidance, guidanceFromReference, renderPhotoGuidance } from './사진설명.js';
import { renderPhotoTrends } from './사진그래프.js';
import { renderResultCard } from './결과카드.js';
import { copyDetails } from './화면정리.js';
import { recommendPhoto } from './사진추천.js';
import { PHOTO_CARE_TIPS } from './관리팁.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const labelMonth = month => `${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
const amount = value => value === null ? '미설정' : currency(value);
const link = (view,label) => `<button type="button" class="text-link" ${view==='spend'?'data-record-open="spend"':`data-view="${view}"`}>${label} ${icon('arrow')}</button>`;

function photoPanel(report, data) {
  const {first,latest}=report.photos;
  if (!first) return `<section class="monthly-card"><div class="section-head"><h2>${icon('drop')} 사진 관찰</h2></div><p>이달 저장한 사진 관찰이 없어요.</p>${link('care','사진 관찰 시작하기')}</section>`;
  const guidance=buildPhotoGuidance(guidanceFromReference((latest??first).reference),data,report.end);
  const recommendation=recommendPhoto(data.skinCare,null,{asOf:report.end});
  const graduated=recommendation?.events.filter(event=>event.action==='graduated')??[];
  const returned=new Set(recommendation?.events.filter(event=>event.action==='returned').map(event=>event.type));
  return `<section class="monthly-card monthly-photo" data-photo-card><div class="section-head"><h2>${icon('drop')} 이달의 사진 관찰</h2><span class="small-badge">${report.observations.length}회 저장</span></div>
    ${renderResultCard({reference:(latest??first).reference,care:data.skinCare,asOf:report.end,titleId:'monthly-photo-title'})}${guidance.paused?'<p class="guidance-alert">불편함 기록 · 새 관리 제안을 멈췄어요.</p>':''}<details class="photo-result-details" data-photo-details><summary>자세히 보기 · 사진 관찰</summary><div class="photo-result-detail-body"><div class="monthly-photo-dates"><div><span>이달 첫 관찰</span><strong>${first.reference.date}</strong></div><div><span>이달 최근 관찰</span><strong>${latest?latest.reference.date:'다음 관찰 전'}</strong></div></div>
    ${renderPhotoGuidance(guidance,{title:`${report.asOf} 기록 기준 · 지금 할 일`})}
    ${graduated.length?`<details class="monthly-details"><summary>지금까지 좋아진 항목 · 사진 점수 참고값</summary><ul>${graduated.map(event=>`<li>${esc(event.date)} · ${esc(PHOTO_LABELS[event.type])}${returned.has(event.type)?' · 다시 신경 쓰는 중':' · 기본 루틴 유지'}${PHOTO_CARE_TIPS[event.type]?`<p>${esc(PHOTO_CARE_TIPS[event.type].tip)}</p>`:''}</li>`).join('')}</ul><p>촬영 조건이 같다고 확인한 점수 기록이에요. 피부 개선이나 제품 효과를 확정하지 않아요.</p></details>`:''}
    <p class="field-help">선택한 달까지 저장된 관찰을 보여줘요. 미분석·해석 실패를 0점으로 표시하지 않아요.</p>
    ${renderPhotoTrends({care:data.skinCare,guidance,asOf:report.end})}
    <details class="monthly-details"><summary>관찰 기록 ${report.observations.length}건 관리</summary>${report.observations.map(entry=>`<div class="monthly-history-row"><div><strong>${entry.reference.date} · ${esc(PHOTO_LABELS[entry.reference.focus])}</strong><small>${esc(entry.reference.version)} · ${entry.completedAt?'분석 완료 기록':'이전 버전에서 보존한 기록'}</small></div><button type="button" class="text-link" data-report-delete="${esc(entry.id)}">삭제</button></div>`).join('')}</details></div></details>
  </section>`;
}

function proposalPanel(proposal) {
  const plan=proposal.plan;
  return `<section class="monthly-card monthly-next"><h2>${labelMonth(proposal.targetMonth)} 제안</h2><p class="monthly-action-line">${esc(proposal.actions[0]?.title??'내 기록을 더 모아볼게요')}</p>
    ${proposal.canApply?`<button type="button" class="btn primary full-width" data-report="preview" ${proposal.applied?'disabled':''}>${proposal.applied?'적용한 제안이에요':'다음 달 제안 확인하기'}</button>`:''}
    <details class="monthly-details"><summary>왜 이렇게 제안했나요?</summary><div class="monthly-actions">${proposal.actions.map(action=>`<article><h3>${esc(action.title)}</h3>${copyDetails('',`<p>${esc(action.body)}</p><small>${esc(action.evidence)}</small>${link(action.view,'관련 기록 확인')}`)}</article>`).join('')}</div><div class="monthly-plan-summary">${plan?`<span>다음 달 총예산</span><strong>${currency(plan.total)}</strong>`:''}<span>관리 목표 · ${esc(proposal.priorityLabel ?? '피부 상태 입력 후 제안')}</span></div>${plan?`<details class="card-details monthly-allocation" hidden><summary>자세히 보기 · 분야별 예산</summary><table class="monthly-table"><caption>분야별 구매 상한 검토안</caption><tbody>${CATEGORIES.filter(category=>plan.allocations[category.id]>0).map(category=>`<tr><th scope="row">${category.name}</th><td>${currency(plan.allocations[category.id])}</td></tr>`).join('')}<tr><th scope="row">남겨둘 금액</th><td>${currency(plan.reserve)}</td></tr></tbody></table></details>`:link('life','예산 먼저 설정하기')}<ul>${proposal.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p>전체 지출을 늘리지 않고, 설정한 피부 상한·남겨둘 금액을 지켜요.</p></details>
  </section>`;
}

export function renderRealReport(data, month, asOf = today()) {
  const report=monthlyReport(data,month,asOf), proposal=monthlyProposal(data,month,asOf);
  const {spending,routine,feedback}=report;
  if(!report.hasData)return `<div class="live-report"><section class="monthly-hero"><h2>${labelMonth(month)} 월간 리포트</h2><strong>이번 달 기록을 시작해 볼까요?</strong></section><section class="monthly-card monthly-empty"><h2>오늘의 관리 기록</h2><p>기록이 쌓이면 이곳에 모여요.</p><button type="button" class="btn primary full-width" data-view="care">관리 계획 보기</button></section></div>`;
  return `<div class="live-report"><section class="monthly-hero"><h2>${labelMonth(month)} ${report.closed?'월간 리포트':'중간 리포트'}</h2><strong>${feedback.uncomfortable?'불편했던 사용감을 먼저 확인해요':routine.recordedDays<3?'이번 달 기록을 시작했어요':'내 기록에서 다음 선택을 살펴봐요'}</strong></section>
    <div class="monthly-metrics">${spending.records.length?`<article><span>기록한 소비</span><strong>${currency(spending.total)}</strong></article>`:''}${routine.rate===null||routine.rate===0||routine.recordedDays<3?'':`<article><span>이달 관리 체크율</span><strong>${routine.rate}<small>%</small></strong></article>`}${spending.average===null?'':`<article><span>직접 남긴 만족도</span><strong>${spending.average.toFixed(1)}<small> / 5</small></strong></article>`}</div>
    ${proposalPanel(proposal)}
    ${photoPanel(report,data)}
    <section class="monthly-card"><h2>${icon('calendar')} 관리 기록</h2><p>${routine.recordedDays<3?'이번 달 기록을 시작했어요':`${routine.recordedDays}일 기록했어요`}</p>${feedback.uncomfortable?`<p class="guidance-alert">불편함 기록 · ${feedback.uncomfortable}일을 먼저 확인해요.</p>`:''}<details class="monthly-details"><summary>한 달 기록 보기</summary><span class="monthly-calendar-key">아침 / 저녁</span><ol class="monthly-calendar">${report.calendar.map(day=>`<li class="${day.active?'':'not-tracked'}"><span>${Number(day.date.slice(-2))}일</span><div aria-hidden="true">${['morning','evening'].map(period=>`<i class="${day.entry?.[period]?'checked':''}">${!day.active?'—':day.entry?.[period]?'✓':'·'}</i>`).join('')}</div><span class="sr-only">${!day.active?'관리 기록 시작 전':`아침 ${day.entry?.morning?'완료':'체크 없음'}, 저녁 ${day.entry?.evening?'완료':'체크 없음'}`}</span></li>`).join('')}</ol>
      <div class="monthly-feedback"><h3>직접 남긴 사용감 ${feedback.count}일</h3><ul class="monthly-feedback-counts"><li>편안함 <b>${feedback.comfortable}</b>일</li><li>별 차이 모름 <b>${feedback.same}</b>일</li><li>불편함 <b>${feedback.uncomfortable}</b>일</li>${feedback.unsure?`<li>사용감 미확인 <b>${feedback.unsure}</b>일</li>`:''}</ul>${feedback.uncomfortable?`<p class="guidance-alert">불편함 기록 · ${feedback.uncomfortable}일을 먼저 확인해요.</p>`:''}</div>
      ${report.usedProducts.length?`<details class="monthly-details"><summary>완료 당시 사용 제품 ${report.usedProducts.length}개</summary><ul>${report.usedProducts.map(product=>`<li>${esc(product.title)} · ${esc(PRODUCT_KINDS[product.kind]??KINDS[product.kind])} · ${product.days}일 / ${product.count}회 체크</li>`).join('')}</ul></details>`:''}
      ${report.plans.length?`<details class="monthly-details"><summary>이달 저장된 계획 변경 ${report.plans.length}건</summary>${report.plans.map(plan=>`<p><strong>${plan.date}</strong> · ${esc(plan.title)}</p>`).join('')}</details>`:''}</details>${link('records','관리 기록 열기')}
    </section>
    ${spending.records.length||spending.budget!==null?`<section class="monthly-card"><h2>${icon('wallet')} 소비 기록</h2>${spending.remaining===null?'':`<div class="monthly-balance"><span>${spending.remaining<0?'예산 초과':'남은 예산'}</span><strong>${currency(Math.abs(spending.remaining))}</strong></div>`}${spending.records.length?`<p>${spending.records.length}건의 소비를 기록했어요.</p>`:''}<details class="monthly-details"><summary>소비 내역 보기</summary><div class="monthly-expenses">${spending.records.map(record=>`<button type="button" data-action="edit" data-id="${esc(record.id)}"><span><strong>${esc(record.title)}</strong><small>${record.date} · ${record.rating===null?'미평가':record.rating+' / 5'}</small></span><b>${currency(record.amount)}</b>${icon('chevron')}</button>`).join('')}</div>${spending.budget===null?'<button class="text-link" data-action="budget">예산 정하기 →</button>':''}</details>${link('spend','소비 기록 열기')}</section>`:''}
    <details class="monthly-details monthly-method"><summary>집계·사진 해석 기준</summary><p>로그인한 계정에 저장한 실제 기록만 집계해요. 현재 달은 오늘까지만, 지난달은 말일까지 계산해요. 관리 체크율은 첫 루틴·사용감 기록일부터 하루 두 번을 기준으로 하며, 기록 시작 전 날짜는 제외해요. 왼쪽 아침·오른쪽 저녁이며 빈 체크는 실행 여부를 모르는 상태예요. 저장한 기록을 수정하면 리포트도 자동 갱신돼요. 미평가는 만족도 평균에서 빼고, 관리 체크율은 피부 개선율로 해석하지 않아요.</p><p>사진 원점수는 높을수록 유캠 모델이 양호하게 평가한 방향이에요. 같은 조건 확인은 사용자의 답변이며 촬영 품질 자동 검증이 아니에요. 사진 차이로 제품 효과·질환·심각도를 판단하지 않아요.</p><p>계획은 입력한 느낌·불편함·보유 제품·예산에 따른 규칙 기반 제안이에요. 리포트를 여는 것만으로 사진 분석·결제·예산 변경이 실행되지는 않아요.</p><p>관리·사용감은 최근 365일 기록, 계획 변경은 최근 60건을 보관해요. 예전 달은 현재 남아 있는 기록으로 다시 계산해요.</p><a href="https://docs.perfectcorp.com/reference/ai_skin_analysis" target="_blank" rel="noopener noreferrer">유캠 원점수 해석 기준 ↗</a></details>
  </div>`;
}

export function createReportUI(ctx) {
  let pending=null;
  const guard=()=>{const state=ctx.state();if(state.demo||state.storageError||state.busy){ctx.toast('샘플·보호 모드·저장 중에는 실제 리포트를 변경할 수 없어요.');return false;}return true;};
  function render() {
    const state=ctx.state();
    if(state.demo)return '<section class="monthly-card"><h2>내 기록에서 월간 리포트를 확인해요</h2><p>샘플 자료로 실제 분석 결과나 다음 달 계획을 만들지 않아요.</p><button type="button" class="btn secondary" data-action="demo">내 기록으로 돌아가기</button></section>';
    return renderRealReport(state.data,state.month);
  }
  function home() {
    const state=ctx.state();if(state.demo)return '';
    const month=latestReportMonth(state.data),report=monthlyReport(state.data,month);
    const count=new Set([...state.data.skinCare.days,...state.data.skinCare.checkins].filter(entry=>entry.date.startsWith(month)).map(entry=>entry.date)).size+report.spending.records.length;
    return `<section class="monthly-home"><h2>${labelMonth(month)} ${report.closed?'월간':'중간'} 리포트</h2><p class="card-copy">${count<3?'이번 달 기록을 시작했어요':'내 기록이 리포트로 모였어요'}</p><button type="button" class="text-link" data-report-open="${month}">리포트 보기 ${icon('arrow')}</button></section>`;
  }
  document.addEventListener('click',async event=>{
    const open=event.target.closest('[data-report-open]');
    if(open&&!ctx.state().busy){ctx.setMonth(open.dataset.reportOpen);ctx.navigate('report');return;}
    const deletion=event.target.closest('[data-report-delete]');
    if(deletion&&guard()){
      const entry=photoHistory(ctx.state().data.skinCare).find(item=>item.id===deletion.dataset.reportDelete);
      if(!entry)return;
      ctx.dialog('이 사진 관찰 기록을 삭제할까요?',`<p class="modal-sub">${entry.reference.date} 숫자·촬영 조건 기록을 현재 계정에서 지워요. 연결된 비교는 해제돼요. 유캠 원격 사진·기존 백업·과거 계획 설명은 별개예요.</p><button type="button" class="btn danger" data-report-remove="${esc(entry.id)}">관찰 기록 삭제</button>`);return;
    }
    const remove=event.target.closest('[data-report-remove]');
    if(remove&&guard()){
      try {await ctx.persist(removePhotoObservation(ctx.state().data,remove.dataset.reportRemove),'관찰 기록을 삭제했어요. 리포트도 갱신했어요.');}catch(issue){ctx.toast(issue.message);}return;
    }
    const button=event.target.closest('[data-report]');if(!button||!guard())return;
    if(button.dataset.report==='preview'){
      const {data,month}=ctx.state(),proposal=monthlyProposal(data,month);
      if(!proposal.canApply){ctx.toast('적용할 수 있는 기록과 계획을 먼저 확인해 주세요.');return;}
      pending={base:JSON.stringify(data),month,asOf:today()};
      const before=data.plans[proposal.targetMonth];
      const beforePriority=data.skinCare.monthlyAdjustments?.[proposal.targetMonth]?.priority ?? data.skinCare.profile?.priority;
      ctx.dialog(`${labelMonth(proposal.targetMonth)} 조정안 확인`,`<p class="modal-sub">${proposal.partial?'이번 달 중간 기록으로 만든 초안이에요. ':''}확인 후 저장해야 적용돼요. ${proposal.targetMonth===today().slice(0,7)?'적용 대상이 이번 달이므로 저장하면 현재 루틴 목표에 반영돼요.':'현재 달의 루틴 목표는 변경하지 않아요.'}</p><div class="live-report"><table class="monthly-table"><caption>기존 값 → 저장할 값</caption><tbody><tr><th>총예산</th><td>${amount(data.budgets[proposal.targetMonth]??null)}</td><td>${amount(proposal.plan?.total??null)}</td></tr>${proposal.plan?CATEGORIES.map(category=>`<tr><th>${category.name}</th><td>${before?currency(before.allocations[category.id]):'미설정'}</td><td>${currency(proposal.plan.allocations[category.id])}</td></tr>`).join('')+`<tr><th>남겨둘 금액</th><td>${before?currency(before.reserve):'미설정'}</td><td>${currency(proposal.plan.reserve)}</td></tr>`:''}<tr><th>관리 목표</th><td>${esc(PRIORITIES[beforePriority]??'미설정')}</td><td>${esc(proposal.priorityLabel??'변경 없음')}</td></tr></tbody></table></div><form id="monthly-plan-form"><label class="checkbox"><input name="consent" type="checkbox" required> 다음 달 예산·관리 목표의 변경 내용을 확인했어요.</label><p class="form-error" role="alert"></p><button type="submit" class="btn primary full-width">확인한 조정안 저장</button></form>`);
    }
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='monthly-plan-form')return;
    event.preventDefault();if(!guard())return;
    const form=event.target,submit=form.querySelector('[type="submit"]'),error=form.querySelector('.form-error');
    try {
      if(new FormData(form).get('consent')!=='on')throw Error('변경 내용 확인에 동의해 주세요.');
      if(!pending||pending.asOf!==today()||pending.base!==JSON.stringify(ctx.state().data))throw Error('기록이나 날짜가 바뀌었어요. 조정안을 닫고 다시 확인해 주세요.');
      submit.disabled=true;
      const next=applyMonthlyProposal(ctx.state().data,pending.month,pending.asOf);
      if(!await ctx.persist(next,'다음 달 예산·관리 목표를 저장했어요. 해당 월의 루틴에 반영돼요.'))throw Error('저장하지 못했어요. 기존 예산·관리 목표는 유지했어요.');
      pending=null;
    }catch(issue){error.textContent=issue.message;}finally{submit.disabled=false;}
  });
  return {render,home};
}
