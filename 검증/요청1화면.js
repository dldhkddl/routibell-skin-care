import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/목표화면.css';
import '../화면/피부계획.css';
import '../화면/사진분석.css';
import '../화면/체크인봇.css';
import '../화면/이용권화면.css';
import '../화면/예산화면.css';
import { APP } from '../앱설정.js';
import { EMPTY, currency, summary, today } from '../화면/계산.js';
import { emptyCare, saveDaily } from '../화면/피부계산.js';
import { saveBotCheckin } from '../화면/체크인계산.js';
import { createFlowUI, addStartProducts } from '../화면/시작흐름.js';
import { createSkinUI } from '../화면/피부계획.js';
import { createCheckinUI } from '../화면/체크인봇.js';
import { renderBudgetResult } from '../화면/예산화면.js';
import { renderSubscription } from '../화면/이용권화면.js';

const mode = new URLSearchParams(location.search).get('상태') || '목표';
const date = today();
const month = date.slice(0, 7);
const profile = {feel:'balanced', concerns:[], sensitivity:'rare', discomfort:'no', priority:'comfort', budget:null, updatedAt:date};
let data = {...EMPTY(), goals:{selected:['skin'], note:''}, skinCare:{...emptyCare(), profile}};
if (mode === '피부느낌') data = {...data, skinCare:{...emptyCare()}};
const pastDate = offset => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
};
const state = () => ({data, effective:data, identity:'preview-account', demo:false, busy:false, storageError:false});
const context = {state, today:()=>date, hour:()=>12, persist:async next=>{data=next;return true;}, render:()=>{}, navigate:()=>{}, toast:()=>{}, dialog:()=>{}};
const flow = createFlowUI(context);
const locked = {tier:'free',trialLocked:true,remaining:0,trialRequiredDays:3,completedCheckinDays:1,capacity:{closedDaily:false,closedTotal:false}};
const skin = createSkinUI({...context, access:()=>locked});
const bot = createCheckinUI({...context,subscription:async()=>({access:{trialUnlocked:mode === '3일째',freeTrialRemaining:1,trialRequiredDays:3,completedCheckinDays:mode === '3일째' ? 3 : 1}})});
let content = '';

if (mode === '목표') {
  document.body.classList.add('goals-mode');
  content = flow.goals();
} else if (mode === '피부느낌') {
  content = skin.render();
} else if (mode === '제품고르기') {
  document.body.classList.add('goals-mode');
  content = flow.products();
} else if (mode === '완료' || mode === '3일째') {
  if (mode === '3일째') {
    data = saveDaily(data, 'morning', true, pastDate(2));
    data = saveDaily(data, 'evening', true, pastDate(1));
  }
  data = saveBotCheckin(data, {adherence:'yes',routine:'both',mood:'balanced'}, date);
  await bot.noteDailySave(mode === '3일째' ? 2 : 0);
  content = bot.home();
} else if (mode === '홈시트') {
  content = bot.home();
} else if (mode === '관리잠김') {
  content = skin.render();
} else if (mode === '예산있음' || mode === '예산없음') {
  data = addStartProducts(data, ['cleanser','cream','sunscreen'], date, (()=>{let index=0;return()=>`preview-${++index}`;})());
  if (mode === '예산있음') data.inventory.find(item=>item.kind==='sunscreen').usageState='low';
  data = {...data, budgets:{[month]:50000}};
  const amount = summary(data, month).budget;
  content = `<section class="panel settings-budget"><h2>이번 달 예산</h2><strong>${currency(amount)}</strong><button class="btn secondary full-width">예산 수정하기</button></section>${renderBudgetResult(data, month)}<details class="budget-more"><summary>자세히</summary><p>관리 계획과 구매 상한</p></details>`;
} else if (mode === '이용권') {
  content = renderSubscription({access:{tier:'free',remaining:0,freeTrialRemaining:0,trialRequiredDays:3,oneTimeRemaining:0,trialLocked:false},priceKrw:7900,monthlyAnalyses:2,analysisPassPriceKrw:3900,paymentsEnabled:false});
}

const title = {목표:'나의 목표',피부느낌:'피부 분석과 관리 계획',제품고르기:'내 화장대',완료:'나를 위한 뷰티 계획','3일째':'나를 위한 뷰티 계획',홈시트:'나를 위한 뷰티 계획',관리잠김:'피부 분석과 관리 계획',예산있음:'예산',예산없음:'예산',이용권:'이용권·구독 관리'}[mode] || '화면 검증';
document.querySelector('#app').innerHTML = `<main><header class="topbar"><a class="app-wordmark" href="#">${APP.name}<small>${APP.englishName}</small></a></header><div class="main-content"><div class="page-head"><h1>${title}</h1></div>${content}</div></main><nav class="mobile-nav" aria-label="모바일 메뉴"><button>홈</button><button>관리</button><button>기록</button><button>마이</button></nav>`;
if (mode === '홈시트') await bot.handle('open');
