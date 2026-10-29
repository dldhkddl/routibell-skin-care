import { APP } from '../앱설정.js';
import { withInventory } from './피부계산.js';
import { icon } from './아이콘.js';
import { planPortfolio, categoryColor } from './시각요소.js';
import { CATEGORIES, today, currency, validateData } from './계산.js';
import { nextMonth, blankPlan, validatePlan, validateInventory, validateSchedule, suggestPlan, personalStats, plannedPurchases, advanceSchedule } from './계획계산.js';
import { PRODUCT_KINDS, sortVanity } from './화장대순서.js';
import { renewProduct, updateProductStatus } from './예산계산.js';

const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const button = (label, action, id = '') => `<button type="button" class="btn secondary" data-life="${action}" data-id="${esc(id)}">${label}</button>`;
const categoryOptions = selected => CATEGORIES.map(category => `<option value="${category.id}" ${category.id === selected ? 'selected' : ''}>${category.name}</option>`).join('');
const field = (label, name, value, type = 'text', attrs = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const moneyField = (label, name, value) => field(label, name, value, 'number', 'required min="0" max="100000000" step="1" inputmode="numeric"');
const footer = (id = 'form-error') => `<p id="${id}" class="form-error" role="alert"></p><div class="modal-actions"><button type="submit" class="btn primary">저장하기</button></div>`;

export function createLifeUI(ctx) {
  let planMonth = nextMonth(today().slice(0,7));
  let proposal = null;
  let activePanel = 'plan';
  let proposalInput = null;
  const state = () => ctx.state();
  const guard = () => {
    const current = state();
    if (current.demo || current.storageError) { ctx.toast(current.demo ? '샘플을 종료하고 내 기록에서 시작해 주세요.' : '먼저 백업을 복원해 주세요.'); return false; }
    return !current.busy;
  };
  const save = (next, message) => ctx.persist(validateData(next), message);
  function inventoryForm(id) {
    const item = state().data.inventory.find(item => item.id === id) ?? {id:crypto.randomUUID(), title:'', category:'cosmetic', kind:'', remaining:100, registeredAt:today(), opened:today(), expires:'', memo:''};
    ctx.dialog('내 화장대', `<form id="inventory-form" data-id="${item.id}"><label>제품 종류<select name="kind" required><option value="" disabled ${item.kind?'':'selected'}>종류를 골라 주세요</option>${Object.entries(PRODUCT_KINDS).map(([kind,label])=>`<option value="${kind}" ${item.kind===kind?'selected':''}>${label}</option>`).join('')}</select></label>${field('개봉일 (선택)','opened',item.opened||item.registeredAt||today(),'date',`min="2000-01-01" max="${today()}"`)}${field('제품명 (선택)','title',item.title===PRODUCT_KINDS[item.kind]?'':item.title,'text','maxlength="60" placeholder="제품명은 나중에 적어도 돼요"')}<details><summary>사용 경험·남은 양 더 적기</summary><label>분야<select name="category">${categoryOptions(item.category)}</select></label><label>사용 경험<select name="comfort"><option value="unknown" ${!item.comfort || item.comfort === 'unknown' ? 'selected' : ''}>아직 확인하지 않았어요</option><option value="comfortable" ${item.comfort === 'comfortable' ? 'selected' : ''}>무리 없이 사용했어요</option><option value="uncomfortable" ${item.comfort === 'uncomfortable' ? 'selected' : ''}>불편함이 있었어요</option></select></label>${field('남은 양 (%) · 다 썼다면 0','remaining',item.remaining,'number','required min="0" max="100" step="1"')}${field('표시된 사용기한 (선택)','expires',item.expires,'date','min="2000-01-01" max="2099-12-31"')}<label>제품 메모<textarea name="memo" maxlength="300">${esc(item.memo)}</textarea></label></details><p class="field-help">개봉일을 비우면 등록일을 기준으로 살펴봐요.</p>${footer()}</form>`);
  }
  function scheduleForm(id) {
    const item = state().data.schedules.find(item => item.id === id) ?? {id:crypto.randomUUID(), title:'', category:'hair', amount:0, interval:30, nextDate:today(), active:true};
    ctx.dialog('반복 관리 일정', `<form id="schedule-form" data-id="${item.id}">${field('일정 이름','title',item.title,'text','required maxlength="60"')}<label>분야<select name="category">${categoryOptions(item.category)}</select></label>${moneyField('예상 비용 (원)','amount',item.amount)}<div class="form-grid">${field('다음 예정일','nextDate',item.nextDate,'date','required min="2000-01-01" max="2099-12-31"')}${field('반복 주기 (일)','interval',item.interval,'number','required min="1" max="365" step="1"')}</div><label class="checkbox"><input type="checkbox" name="active" ${item.active ? 'checked' : ''}> 일정 활성화</label><p class="field-help">앱 안에서 예정일을 안내해요. 푸시 알림과 자동 결제·소비 기록은 만들지 않아요.</p>${footer()}</form>`);
  }
  function renderInventory() {
    const data = state().effective;
    return `<section class="panel life-panel"><div class="section-head"><div><h2>내 화장대</h2><p>종류만 고르면 바르는 순서를 정리해요.</p></div>${button('제품 추가','inventory')}</div><div class="life-list">${sortVanity(data.inventory ?? []).map(item => `<article class="inventory-item"><div><strong>${esc(item.title)}</strong><p>${esc(PRODUCT_KINDS[item.kind])} · ${item.status === 'finished' ? '다 썼어요' : item.usageState==='low'?'거의 다 썼어요':`${item.remaining}% 남음`}</p></div><div class="life-actions">${button('수정','inventory',item.id)}${button('삭제','remove-inventory',item.id)}${item.status==='finished'?button('새로 샀어요','renew',item.id):''}</div><div class="inventory-status" aria-label="${esc(item.title)} 사용 상태">${[['using','사용 중'],['low','거의 다 썼어요'],['finished','다 썼어요']].map(([value,label])=>`<button type="button" data-life="status" data-id="${esc(item.id)}" data-status="${value}" aria-pressed="${item.usageState===value}">${label}</button>`).join('')}</div></article>`).join('') || '<p>가지고 있는 제품부터 넣어볼까요?</p>'}</div></section>`;
  }
  function renderPlan() {
    const data = state().effective;
    const plan = data.plans?.[planMonth] ?? blankPlan(data.budgets[planMonth] ?? 0);
    const configured = Boolean(data.plans?.[planMonth]) || Object.hasOwn(data.budgets,planMonth);
    const wishes = plannedPurchases(data, planMonth);
    const schedules = (data.schedules ?? []).filter(item => item.active && item.nextDate.startsWith(planMonth));
    const scheduleTotal = schedules.reduce((sum,item) => sum+item.amount,0);
    return `<section class="life-panel plan-panel"><div class="section-head"><div><h2>나에게 맞는 예산 배분</h2><p>필요한 만큼 정하고, 나머지는 남겨두세요.</p></div></div><label class="plan-period">계획 월<input id="plan-month" type="month" value="${planMonth}" min="2000-01" max="2099-12"></label><form id="plan-form"><div class="plan-budget-fields">${moneyField('전체 월 예산 (원)','total',plan.total)}${moneyField('남겨둘 금액 (원)','reserve',plan.reserve)}</div>${configured?planPortfolio(plan,true):'<p class="field-help plan-unset">아직 저장된 예산이 없어요. 0원도 예산으로 저장할 수 있어요.</p>'}<div class="section-head allocation-heading"><h3>분야별 계획</h3><span>중요도를 함께 정해요</span></div><div class="allocation-list">${CATEGORIES.map(category => `<div class="allocation-row"><span class="allocation-icon" style="--ink:${categoryColor(category.id)}">${icon(category.icon)}</span><div class="form-grid">${moneyField(`${category.name} 계획 (원)`,`amount-${category.id}`,plan.allocations[category.id])}<label>${category.name} 중요도<select name="importance-${category.id}">${[1,2,3].map(value => `<option value="${value}" ${plan.importance[category.id] === value ? 'selected' : ''}>${['','보통','중요','매우 중요'][value]}</option>`).join('')}</select></label></div></div>`).join('')}</div><div class="plan-context"><p>구매 고민 한도 합계 <strong>${currency(wishes)}</strong></p><p>다음 반복 일정 <strong>${currency(scheduleTotal)}</strong></p><span>둘은 같은 소비가 겹칠 수 있어 합산하지 않아요.</span></div><div class="life-actions">${button('기록 기반 조정안 보기','suggest-plan')}</div><div id="proposal" aria-live="polite"></div>${footer('plan-error')}</form><p class="field-help">계획 저장 시 선택한 월의 전체 예산도 함께 변경해요. 제안 확인만으로 예산이 바뀌지는 않아요. 배분 금액은 지출 상한이며 구매 예정액을 더하지 않아요.</p></section>`;
  }
  function renderStats() {
    const data = state().effective;
    return `<section class="panel life-panel"><h2>내 소비 경험 비교</h2><p>전체 기간의 직접 남긴 만족도와 사용기간이에요. 분야마다 가치가 달라 단일 점수로 순위를 매기지 않아요.</p><div class="life-list">${CATEGORIES.map(category => {
      const stats = personalStats(data,category.id);
      return `<article><div><strong>${category.name}</strong><p>${stats.count}건 기록 · ${stats.rated}건 평가${stats.rated < 2 ? ' · 판단 근거 부족' : ''}</p></div><div>${stats.average === null ? '미평가' : `평균 ${stats.average.toFixed(1)}점`}<p>${stats.dailyCost === null ? '사용기간 기록 없음' : `사용 1일당 약 ${currency(Math.round(stats.dailyCost))} · 기간 기록 ${stats.timed}건`}</p></div></article>`;
    }).join('')}</div><p class="field-help">사용 1일당 비용은 기간을 적은 기록의 비용 합계 ÷ 사용일 합계입니다. 치료 효과나 투자 수익률이 아니에요.</p></section>`;
  }
  function renderSchedules() {
    const data = state().effective;
    return `<section class="panel life-panel"><div class="section-head"><h2>반복 관리 일정</h2>${button('일정 추가','schedule')}</div><div class="life-list">${(data.schedules ?? []).map(item => `<article><div><strong>${esc(item.title)}</strong><p>${item.nextDate} · ${item.interval}일마다 · ${currency(item.amount)} · ${!item.active ? '중지' : item.nextDate <= today() ? '예정일 도래' : '예정'}</p></div><div class="life-actions">${button('수정','schedule',item.id)}${item.active ? button('다음 주기로 넘기기','advance',item.id) : ''}${button('삭제','remove-schedule',item.id)}</div></article>`).join('') || '<p>커트·네일·재구매 일정을 추가해 보세요.</p>'}</div><p class="field-help">다음 주기로 넘겨도 소비가 생기지는 않아요. 실제 이용했다면 소비 기록을 따로 남겨주세요.</p></section>`;
  }
  function render() {
    const panels=[['plan','예산·배분',renderPlan],['inventory','내 화장대',renderInventory],['stats','사용 경험',renderStats],['schedules','관리 일정',renderSchedules]];
    return `<div class="life-tabs" aria-label="뷰티 계획 메뉴">${panels.map(([id,title])=>`<button type="button" data-life-tab="${id}" aria-pressed="${activePanel===id}" aria-controls="life-${id}">${title}</button>`).join('')}</div><div class="life-grid">${panels.map(([id,title,content])=>`<div class="life-view-panel" id="life-${id}" ${activePanel===id?'':'hidden'}>${content()}</div>`).join('')}</div>`;
  }
  function home(showIntro=true) {
    const current = state(), data = current.effective;
    const due = data.records.filter(record => record.rating === null && record.reviewDate && record.reviewDate <= today());
    const schedules = (data.schedules ?? []).filter(item => item.active && item.nextDate <= today());
    return `${showIntro&&!data.onboarding ? `<section class="panel life-panel"><h2>${APP.name} 시작하기</h2><p>예산을 정하고, 소비와 만족도를 차근차근 남겨보세요.</p><div class="life-actions"><button class="btn secondary" data-action="budget">예산 설정</button><button class="btn secondary" data-action="add">첫 기록</button><button class="btn secondary" data-view="life">보유 제품·계획</button>${button('안내 완료','onboard')}</div></section>` : ''}${due.length || schedules.length ? `<section class="panel life-panel"><h2>오늘 돌아볼 기록</h2>${due.map(record => `<p>${esc(record.title)} · 평가 예정 ${record.reviewDate} <button class="btn secondary" data-action="edit" data-id="${record.id}">평가하기</button></p>`).join('')}${schedules.length ? `<p>예정일이 된 반복 일정 ${schedules.length}개 <button class="btn secondary" data-view="life">일정 보기</button></p>` : ''}</section>` : ''}`;
  }
  function readPlan(form) {
    const fields = new FormData(form);
    return validatePlan({total:Number(fields.get('total')),reserve:Number(fields.get('reserve')),allocations:Object.fromEntries(CATEGORIES.map(category => [category.id,Number(fields.get(`amount-${category.id}`))])),importance:Object.fromEntries(CATEGORIES.map(category => [category.id,Number(fields.get(`importance-${category.id}`))]))});
  }
  document.addEventListener('change', event => {
    if (event.target.id === 'plan-month' && event.target.checkValidity() && event.target.value) { planMonth=event.target.value; proposal=null; ctx.render(); }
  });
  document.addEventListener('input', event => {
    if (event.target.closest('#plan-form')) { proposal=null; proposalInput=null; const panel=document.querySelector('#proposal'); if(panel)panel.innerHTML=''; }
  });
  document.addEventListener('click', async event => {
    const panelButton=event.target.closest('[data-life-tab]');
    if(panelButton) {
      activePanel=panelButton.dataset.lifeTab;
      for(const item of document.querySelectorAll('[data-life-tab]')) item.setAttribute('aria-pressed',String(item.dataset.lifeTab===activePanel));
      for(const panel of document.querySelectorAll('.life-view-panel')) panel.hidden=panel.id!=='life-'+activePanel;
      return;
    }
    const target = event.target.closest('[data-life]');
    if (!target || !guard()) return;
    const action = target.dataset.life, id=target.dataset.id, data=state().data;
    try {
      if (action === 'inventory') inventoryForm(id);
      else if (action === 'renew') {
        const product=data.inventory.find(item=>item.id===id);
        if(product?.status!=='finished')throw Error('다 쓴 제품만 새로 등록할 수 있어요.');
        ctx.dialog('새로 샀어요',`<form id="renew-product-form" data-id="${esc(id)}"><p>${esc(product.title)} · 오늘부터 다시 사용 중으로 기록해요.</p><label>구매 가격 (선택)<input name="price" type="number" min="1" max="100000000" step="1" inputmode="numeric" placeholder="입력하지 않아도 돼요"></label><p class="form-error" role="alert"></p><button type="submit" class="btn primary full-width">저장하기</button></form>`);
      }
      else if (action === 'status') {
        const updated=updateProductStatus(data,id,target.dataset.status);
        await save(withInventory(updated,updated.inventory),'제품 상태를 기억해둘게요.');
      }
      else if (action === 'schedule') scheduleForm(id);
      else if (action === 'onboard') await save({...data,onboarding:true},'시작 안내를 마쳤어요.');
      else if (action === 'remove-inventory' || action === 'remove-schedule') {
        ctx.dialog('삭제할까요?',`<p>이 항목만 삭제해요. 소비 기록은 유지됩니다.</p>${button('삭제 확인',action === 'remove-inventory' ? 'delete-inventory' : 'delete-schedule',id)}`);
      } else if (action === 'delete-inventory') await save(withInventory(data,data.inventory.filter(item => item.id !== id)),'보유 제품을 삭제했어요.');
      else if (action === 'delete-schedule') await save({...data,schedules:data.schedules.filter(item => item.id !== id)},'일정을 삭제했어요.');
      else if (action === 'advance') await save({...data,schedules:data.schedules.map(item => item.id === id ? advanceSchedule(item) : item)},'다음 예정일로 변경했어요.');
      else if (action === 'suggest-plan') {
        proposalInput=readPlan(document.querySelector('#plan-form'));
        proposal=suggestPlan(data,planMonth,proposalInput);
        document.querySelector('#proposal').innerHTML=`<div class="proposal"><span class="small-badge">기록 기반 · 저장 전 제안</span><h3>다음 선택을 위한 예산 조정</h3><div class="proposal-reasons">${proposal.reasons.map(reason => `<p>${esc(reason)}</p>`).join('')}</div><table class="proposal-table"><thead><tr><th scope="col">분야</th><th scope="col">현재 입력</th><th scope="col">제안</th></tr></thead><tbody>${CATEGORIES.map(category => `<tr><th scope="row"><span style="--ink:${categoryColor(category.id)}">${icon(category.icon)}</span>${category.name}</th><td>${currency(proposalInput.allocations[category.id])}</td><td>${currency(proposal.plan.allocations[category.id])}</td></tr>`).join('')}<tr><th scope="row">남겨둘 금액</th><td>${currency(proposalInput.reserve)}</td><td>${currency(proposal.plan.reserve)}</td></tr></tbody></table>${button('이 조정안을 입력칸에 적용','apply-plan')}<p class="field-help">적용 후 저장하기를 눌러야 확정돼요.</p></div>`;
      } else if (action === 'apply-plan' && proposal) {
        const form=document.querySelector('#plan-form');
        if(JSON.stringify(readPlan(form))!==JSON.stringify(proposalInput)) throw Error('입력이 바뀌었어요. 조정안을 다시 확인해 주세요.');
        form.elements.reserve.value=proposal.plan.reserve;
        for(const category of CATEGORIES) form.elements[`amount-${category.id}`].value=proposal.plan.allocations[category.id];
        document.querySelector('#proposal').innerHTML='<p>입력칸에 적용했어요. 금액을 검토하고 저장해 주세요.</p>';
        proposal=null;
      }
    } catch(error) { const field=document.querySelector('#editor[open] #form-error')??document.querySelector('#plan-error'); if(field)field.textContent=error.message; else ctx.toast(error.message); }
  });
  document.addEventListener('submit', async event => {
    if (!['inventory-form','schedule-form','plan-form','renew-product-form'].includes(event.target.id)) return;
    event.preventDefault(); if(!guard()) return;
    const fields = new FormData(event.target), data=state().data, id=event.target.dataset.id;
    try {
      if(event.target.id === 'renew-product-form') {
        const raw=fields.get('price');
        const price=raw===''?null:Number(raw);
        const renewed=renewProduct(data,id,price);
        await save(withInventory(renewed,renewed.inventory),'새로 산 제품을 화장대에 담았어요.');
      } else if(event.target.id === 'inventory-form') {
        const remaining=Number(fields.get('remaining'));
        const previous=data.inventory.find(item=>item.id===id);
        const item=validateInventory({id,title:fields.get('title')?.trim()||PRODUCT_KINDS[fields.get('kind')],category:fields.get('category'),kind:fields.get('kind'),comfort:fields.get('comfort'),remaining,status:remaining === 0 ? 'finished' : 'available',usageState:remaining===0?'finished':previous?.usageState==='low'?'low':'using',registeredAt:previous?.registeredAt||today(),opened:fields.get('opened')||previous?.registeredAt||today(),finishedAt:remaining===0?today():'',expires:fields.get('expires'),memo:fields.get('memo')});
        let updated=withInventory(data,[...data.inventory.filter(item => item.id !== id),item]);
        if(remaining===0&&previous?.status!=='finished') {
          const pending={...item,status:'available',usageState:'using',remaining:1,finishedAt:''};
          updated=updateProductStatus(withInventory(data,[...data.inventory.filter(entry=>entry.id!==id),pending]),id,'finished');
          updated=withInventory(updated,updated.inventory);
        }
        await save(updated,'보유 제품을 저장했어요.');
      } else if(event.target.id === 'schedule-form') {
        const item=validateSchedule({id,title:fields.get('title'),category:fields.get('category'),amount:Number(fields.get('amount')),nextDate:fields.get('nextDate'),interval:Number(fields.get('interval')),active:fields.get('active')==='on'});
        await save({...data,schedules:[...data.schedules.filter(item => item.id !== id),item]},'반복 일정을 저장했어요.');
      } else {
        const plan=readPlan(event.target);
        await save({...data,plans:{...data.plans,[planMonth]:plan},budgets:{...data.budgets,[planMonth]:plan.total}},'월별 계획과 예산을 저장했어요.');
      }
    } catch(error) { event.target.querySelector('.form-error').textContent=error.message; }
  });
  return {render,home,plan:renderPlan,setPlanMonth:value=>{planMonth=value;proposal=null;proposalInput=null;},inventory:()=>renderInventory()+renderSchedules()};
}
