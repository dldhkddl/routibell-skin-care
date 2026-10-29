import { APP } from '../앱설정.js';
import { icon } from './아이콘.js';
import { today } from './계산.js';
import { validateInventory } from './계획계산.js';
import { withInventory } from './피부계산.js';
import { PRODUCT_KINDS } from './화장대순서.js';
export const GOALS = [
  {id:'skin',title:'맑고 편안한 피부',description:'사용 경험을 살펴 나에게 맞는 제품 찾기',photo:'피부.webp'},
  {id:'hair',title:'나에게 맞는 헤어',description:'마음에 들었던 스타일과 관리 기억하기',photo:'헤어.webp'},
  {id:'makeup',title:'자연스러운 메이크업',description:'내 취향에 맞는 색과 사용감 알아가기',photo:'메이크업.webp'},
  {id:'style',title:'새로운 이미지',description:'변화하고 싶은 모습을 구체적으로 정하기',photo:'이미지변신.webp'},
  {id:'save',title:'현명한 뷰티 소비',description:'가진 제품부터 쓰고 불필요한 구매 줄이기',photo:'현명한소비.webp'},
  {id:'routine',title:'꾸준한 관리 습관',description:'소비와 사용 후 평가를 차근차근 기록하기',photo:'꾸준한관리.webp'},
];
export function validateGoals(value) {
  if(value === undefined) return {selected:[],note:''};
  if(!value || !Array.isArray(value.selected) || value.selected.length>3 || new Set(value.selected).size!==value.selected.length || value.selected.some(id=>!GOALS.some(goal=>goal.id===id)) || typeof value.note!=='string' || value.note.length>200) throw Error('목표는 최대 3개, 직접 입력은 200자까지 적어 주세요.');
  return {selected:[...value.selected],note:value.note.trim()};
}
export function needsGoalSetup(data) {
  return !data.goals?.selected?.length && !data.goals?.note &&
    !data.skinCare?.profile && !data.skinCare?.observation && !data.skinCare?.observations?.length &&
    !data.skinCare?.days?.length && !data.skinCare?.checkins?.length && !data.records.length &&
    !data.inventory.length && !data.wishes.length && !data.schedules.length &&
    !Object.keys(data.budgets).length && !Object.keys(data.plans).length;
}
export function goalFirstRoute(data, target) {
  return needsGoalSetup(data) && !['privacy','terms','settings'].includes(target) ? 'goals' : target;
}
const esc = value => String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const START_PRODUCT_KINDS=['cleanser','toner','serum','cream','sunscreen','eyecream','retinol','exfoliant'];
export function addStartProducts(data,kinds,asOf=today(),makeId=()=>crypto.randomUUID()) {
  if(!Array.isArray(kinds)||new Set(kinds).size!==kinds.length||kinds.some(kind=>!START_PRODUCT_KINDS.includes(kind)))throw Error('사용 중인 제품 종류를 다시 골라 주세요.');
  const added=kinds.filter(kind=>!data.inventory.some(item=>item.category==='cosmetic'&&item.kind===kind)).map(kind=>validateInventory({id:makeId(),title:`내 ${PRODUCT_KINDS[kind]}`,category:'cosmetic',kind,comfort:'unknown',status:'available',usageState:'using',remaining:100,registeredAt:asOf,opened:asOf,finishedAt:'',expires:'',memo:''}));
  return withInventory(data,[...data.inventory,...added]);
}
export function createFlowUI(ctx) {
  function welcome() {
    return `<section class="welcome-card"><img class="welcome-photo" src="/화면사진/시작화면.webp" alt="따뜻한 분홍 배경의 AI 생성 뷰티 스타일 참고 사진" width="1024" height="1536" fetchpriority="high"><div class="welcome-copy"><p class="flow-eyebrow">${APP.englishName}</p><h1>나의 선택으로 만드는<br>나만의 뷰티 포트폴리오</h1><p>피부, 헤어, 메이크업, 그루밍까지.<br>나를 위한 뷰티 라이프를 시작해보세요.</p><button class="btn primary" data-view="goals">시작하기 ${icon('arrow')}</button><button class="text-link" data-view="home">먼저 둘러보기</button><p class="welcome-note">${icon('lock')} 나의 기록으로 이어가는 뷰티 관리<br>스타일 사진은 AI로 만든 참고 이미지예요.</p></div></section>`;
  }
  function goals() {
    const value=ctx.state().effective.goals??validateGoals();
    return `<section class="goal-screen" aria-labelledby="goal-title">
      <header class="goal-heading"><h1 id="goal-title">먼저, 나의 뷰티 목표</h1><p id="goal-description">목표를 최대 3개까지 골라 주세요.<br>사진 분석은 피부만 해요.</p></header>
      <form id="goals-form">
        <fieldset class="goal-options" aria-describedby="goal-description goal-limit"><legend class="sr-only">원하는 뷰티 목표</legend>
          ${GOALS.map(goal=>`<label class="goal-tile ${goal.upcoming?'goal-upcoming':''}"><input type="checkbox" name="goal" value="${goal.id}" aria-labelledby="goal-label-${goal.id}" aria-describedby="goal-help-${goal.id}" ${value.selected.includes(goal.id)?'checked':''} ${goal.upcoming?'disabled':''}><span class="goal-tile-content"><span class="goal-tile-photo goal-tile-photo-${goal.id}"><img src="/목표사진/${goal.photo}" alt="" width="1402" height="1122" decoding="async"></span><strong id="goal-label-${goal.id}">${goal.title}</strong>${goal.upcoming?'<span class="goal-soon">곧 나와요</span>':''}<span class="goal-tile-check" aria-hidden="true">${icon('check')}</span></span><span id="goal-help-${goal.id}" class="sr-only">${goal.description}</span></label>`).join('')}
        </fieldset>
        <div class="goal-input-heading"><label for="goal-note">직접 입력하기 <span>(선택)</span></label><span id="goal-limit">최대 3개 선택</span></div>
        <textarea id="goal-note" name="note" maxlength="200" rows="2" aria-label="직접 입력하기 (선택)" placeholder="예: 나에게 어울리는 스타일을 찾고 싶어요.">${esc(value.note)}</textarea>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="goal-next" aria-label="목표 저장하고 내 루틴 보기">저장하고 내 루틴 보기</button><p class="field-help">사진 분석은 3일 체크인하면 무료로 열려요.</p>
      </form>
      <details class="goal-disclosure"><summary>사진·목표 안내</summary><p>사진은 AI로 만든 목표 참고 이미지이며, 실제 분석이나 가상체험 결과가 아니에요. 헤어·메이크업·이미지 목표는 저장할 수 있지만 사진 분석 대상은 아니에요. 선택한 절약·꾸준한 관리 목표는 피부 계획에 반영해요. 자유 입력 목표나 피부 적합성을 분석하지는 않아요.</p></details>
    </section>`;
  }
  function products() {
    return `<section class="start-products"><h1>지금 쓰는 제품이 있나요?</h1><p>종류만 골라도 내 루틴에 맞춰볼게요.</p><form id="start-products-form"><fieldset><legend class="sr-only">사용 중인 제품 종류</legend><div class="start-product-chips">${START_PRODUCT_KINDS.map(kind=>`<label><input type="checkbox" name="kind" value="${kind}"><span>${PRODUCT_KINDS[kind]}</span></label>`).join('')}</div></fieldset><p class="form-error" role="alert"></p><button class="btn primary full-width" type="submit">다음</button></form><button type="button" class="text-link" data-start-products-skip>건너뛰기</button></section>`;
  }
  function overview() {
    const value=ctx.state().effective.goals??validateGoals();
    return `<section class="portfolio-intro"><div><h2>내가 원하는 모습에,<br>한 걸음 더 가까이.</h2><p>${value.selected.length?value.selected.map(id=>GOALS.find(goal=>goal.id===id).title).join(' · '):'나의 목표부터 차근차근 정해보세요.'}</p>${value.note?`<p class="goal-quote">${esc(value.note)}</p>`:''}<button class="text-link" data-view="goals">${value.selected.length||value.note?'내 목표 수정':'내 목표 정하기'} ${icon('chevron')}</button></div><img class="portfolio-portrait" src="/목표사진/피부.webp" width="1402" height="1122" alt="AI 생성 뷰티 스타일 참고 이미지"></section>`;
  }
  function preview() {
    return `<section class="upcoming-panel"><div class="preview-hero"><img src="/목표사진/메이크업.webp" width="1402" height="1122" alt="AI로 만든 메이크업 스타일 참고 이미지"><span class="image-caption">AI로 만든 스타일 참고 이미지</span></div><span class="small-badge">나의 스타일 노트</span><h2>내가 좋아하는 모습을 찾아요</h2><p>자연스러운 메이크업부터 새로운 헤어까지.<br>마음에 드는 스타일을 나의 목표로 이어가세요.</p><div class="style-samples"><figure><img src="/목표사진/헤어.webp" alt="레이어드 헤어 스타일 참고" width="1402" height="1122" loading="lazy"><figcaption>부드러운 레이어드 헤어</figcaption></figure><figure><img src="/목표사진/이미지변신.webp" alt="단발 헤어 스타일 참고" width="1402" height="1122" loading="lazy"><figcaption>가볍고 단정한 단발</figcaption></figure></div><p class="field-help">스타일 참고용 이미지이며 내 얼굴에 적용한 가상체험 결과는 아니에요.</p><button class="btn primary full-width" data-view="goals">나의 목표 정하기 ${icon('arrow')}</button><button class="btn secondary full-width" data-view="care">오늘의 관리 계획 보기</button></section>`;
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='goals-form')return;
    event.preventDefault();const state=ctx.state(),error=event.target.querySelector('.form-error');
    if(state.busy)return;
    if(state.demo||state.storageError){error.textContent=state.demo?'샘플을 종료한 뒤 내 목표를 저장해 주세요.':'먼저 설정에서 백업을 복원해 주세요.';return;}
    try {
      const fields=new FormData(event.target),goals=validateGoals({selected:fields.getAll('goal'),note:fields.get('note')});
      if(!goals.selected.length&&!goals.note)throw Error('목표를 하나 선택하거나 직접 적어 주세요.');
      const submit=event.target.querySelector('[type="submit"]');submit.disabled=true;
      const saved=await ctx.persist({...state.data,goals,onboarding:true},'나의 뷰티 목표를 저장했어요.');
      if(saved)ctx.navigate('care');else{error.textContent='저장하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.';submit.disabled=false;}
    }catch(issue){error.textContent=issue.message;}
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='start-products-form')return;
    event.preventDefault();
    const form=event.target,error=form.querySelector('.form-error'),state=ctx.state();
    if(state.busy)return;
    try{
      const kinds=new FormData(form).getAll('kind');
      if(!kinds.length)throw Error('쓰는 제품을 골라 주세요. 없다면 건너뛰어도 돼요.');
      const submit=form.querySelector('[type="submit"]');submit.disabled=true;
      const saved=await ctx.persist(addStartProducts(state.data,kinds),'내 화장대에 담았어요.');
      if(saved)ctx.navigate('care','routine');else{error.textContent='저장하지 못했어요. 다시 시도해 주세요.';submit.disabled=false;}
    }catch(issue){error.textContent=issue.message;form.querySelector('[type="submit"]').disabled=false;}
  });
  document.addEventListener('click',event=>{if(event.target.closest('[data-start-products-skip]'))ctx.navigate('care','routine');});
  return {welcome,goals,products,overview,preview};
}
