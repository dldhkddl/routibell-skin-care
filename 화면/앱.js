import { APP } from '../앱설정.js';
import './글꼴.css';
import './스타일.css';
import './시작화면.css';
import { spendingPortfolio, trendChart, categoryColor } from './시각요소.js';
import './구매고민.css';
import './생활계획.css';
import './목표화면.css';
import './피부계획.css';
import './사진분석.css';
import './사진그래프.css';
import './결과카드.css';
import './화면정리.css';
import { renderHomeMetrics } from './핵심숫자.js';
import { copyDetails, installScreenHierarchy, syncScreenAction } from './화면정리.js';
import './실제리포트.css';
import { createReportUI } from './실제리포트.js';
import { createSkinUI } from './피부계획.js';
import { createFlowUI, goalFirstRoute } from './시작흐름.js';
import { createLifeUI } from './생활계획.js';
import { createWishUI } from './구매고민.js';
import { removeRecord } from './추천계산.js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CATEGORIES, EMPTY, today, currency, summary, suggestions, validateRecord, validateData, demoData } from './계산.js';
import { readData as readLegacyData } from './저장.js';
import { createAccountClient } from './계정연결.js';
import { createAccountUI } from './계정화면.js';
import './계정화면.css';
import './카카오로그인.css';
import { renderPrivacyPolicy } from './개인정보방침.js';
import { renderTerms } from './이용약관.js';
import './개인정보방침.css';
import { createCheckinUI } from './체크인봇.js';
import './체크인봇.css';
import { createReminderUI } from './알림화면.js';
import { icon } from './아이콘.js';
import { buildSkinPlan } from './피부계산.js';
import { photoHistory } from './사진이력.js';
import './베타화면.css';
import { renderSubscription } from './이용권화면.js';
import './이용권화면.css';
import { addPurchasePrice } from './예산계산.js';
import { renderBudgetForm, renderBudgetResult, formatBudgetInput } from './예산화면.js';
import { PRODUCT_KINDS } from './화장대순서.js';
import './예산화면.css';

installScreenHierarchy();
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=EMPTY(), month=today().slice(0,7), view='home', demo=false, filter='all', query='', busy=false, storageError=false;
let undoData=null;
let recordPanel='care';
let settingsPanel='main';
let subscriptionState=null,subscriptionError='';
let subscriptionAccess=null;
let accountLoaded=false;
const accountChannel=typeof BroadcastChannel==='function'?new BroadcastChannel(`beauty-account:${location.origin}`):null;
const accountClient=createAccountClient({onLost:expireAccount});
const accountUI=createAccountUI({client:accountClient,beforeSignOut:()=>reminderUI.clear(),render,dialog,toast,onReady:initializeAccount,hidePrivate,closeDialog:()=>$('#editor').close(),onSignedOut:()=>{announceSession();location.replace('#login');location.reload();},announceSession,readLegacy:async()=>{const original=await readLegacyData();return JSON.stringify(validateData(original))===JSON.stringify(validateData(EMPTY()))?null:original;}});
function announceSession(){accountChannel?.postMessage({type:'session-changed'});}
function hidePrivate(){data=EMPTY();undoData=null;demo=false;accountLoaded=false;subscriptionAccess=null;$('#editor').close();$('#editor').innerHTML='';careUI.resetPhoto();checkinUI.reset();void reminderUI.sync();}
function expireAccount(){hidePrivate();document.getElementById('app').innerHTML='<main class="account-shell"><h1>로그인 상태를 다시 확인하고 있어요.</h1></main>';void reminderUI.clear().catch(()=>{}).finally(()=>{location.replace('#login');location.reload();});}
accountChannel?.addEventListener('message',event=>{if(event.data?.type==='session-changed')expireAccount();});
async function initializeAccount(){
  accountLoaded=false;
  try{
    const user=await accountClient.refresh();
    if(!user){data=EMPTY();accountUI.setError('');render();return;}
    data=await accountClient.read();accountLoaded=true;storageError=false;undoData=null;
    const initial=routeFromHash();
    if(goalFirstRoute(data,initial)==='goals'&&initial!=='goals'){view='goals';history.replaceState(null,'','#goals');}
    else if(routes.includes(initial)){view=initial;if(['review','report'].includes(view)){recordPanel=view;view='records';}if(view==='life')view='care';}
    else view='home';
    render();void refreshSubscriptionAccess();
  }catch(issue){data=EMPTY();accountLoaded=false;accountUI.setError(issue.message);render();}
}
const navs=[['home','home','홈'],['care','drop','분석·계획'],['records','book','기록·리포트'],['settings','person','마이']];
const routes=[...navs.map(item=>item[0]),'goals','products','report','checkin','privacy','terms'];
function routeFromHash(){const [route,selectedMonth]=location.hash.slice(1).split('/');if(route==='report'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(selectedMonth??'')&&selectedMonth<=today().slice(0,7))month=selectedMonth;return route;}
function navigate(target,panel=null){
 if(!accountLoaded)return;
 target=goalFirstRoute(data,target);
 if(target==='life'){target='settings';panel='budget';}
 if(target==='review'){target='records';recordPanel='report';}
 if(!routes.includes(target))return;
 if(target==='report'){recordPanel='report';target='records';}
 else if(target==='records')recordPanel=panel==='spend'?'spend':'care';
 if(target==='settings'){settingsPanel=panel??'main';if(['budget','plan'].includes(settingsPanel))month=today().slice(0,7);if(settingsPanel==='plan')lifeUI.setPlanMonth(month);}
 view=target;if(view==='home'||month>today().slice(0,7))month=today().slice(0,7);
 history.replaceState(null,'',`#${view==='records'&&recordPanel==='report'?'report/'+month:view}`);render();
 if(view==='care'||view==='home')void refreshSubscriptionAccess();
 if(view==='settings'&&settingsPanel==='subscription')void loadSubscription();
 if(view==='care'&&['photo','routine'].includes(panel))document.getElementById(panel==='photo'?'photo-analysis':'care-routine-start')?.scrollIntoView({block:'start'});
 else window.scrollTo(0,0);
}
async function loadSubscription(){
 const identity=accountClient.state().identity;
 subscriptionState=null;subscriptionError='';render();
 try{const value=await accountClient.subscription();if(identity!==accountClient.state().identity)return;subscriptionState=value;}
 catch(issue){if(identity!==accountClient.state().identity)return;subscriptionError=issue.message;}
 if(view==='settings'&&settingsPanel==='subscription')render();
}
async function refreshSubscriptionAccess(){
 const identity=accountClient.state().identity;
 try{const result=await accountClient.subscription();if(identity!==accountClient.state().identity)return;subscriptionAccess=result.access; if(view==='care'||view==='home')render();}
 catch{if(identity===accountClient.state().identity)subscriptionAccess=null;}
}
const effective=()=>demo?demoData(month):data;
const monthText=()=>`${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
const btn=(text,action,cls='primary',extra='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`;
const empty=(title,description,action='add',label='소비 기록하기')=>`<div class="empty"><span class="empty-icon">${icon('book')}</span><h3>${title}</h3><p>${description}</p>${btn(icon('plus')+label,action,'soft')}</div>`;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function row(r){
  const c=CATEGORIES.find(c=>c.id===r.category);
  return `<button class="record" type="button" data-action="edit" data-id="${r.id}" aria-label="${esc(r.title)} 기록 ${demo?'보기':'수정'}">
    <span class="category-icon" style="--ink:${categoryColor(c.id)}">${icon(c.icon)}</span><span class="record-body"><strong>${esc(r.title)}</strong><span>${c.name}<i>·</i>${Number(r.date.slice(5,7))}.${r.date.slice(8)}${r.rating===null?'':`<i>·</i><span class="rating">★ ${r.rating}.0</span>`}</span></span><span class="record-price">${currency(r.amount)}<small>${r.rating===null?'평가 전':r.repurchase===true?'다시 사고 싶어요':r.repurchase===false?'재구매는 쉬어가요':'평가 완료'}</small></span>${icon('chevron','muted')}</button>`;
}
function tip(t){return `<article class="tip"><span class="tip-icon">${icon(t.icon)}</span><div><h3>${esc(t.title)}</h3>${copyDetails('',`<p>${esc(t.text)}</p>`)}${t.action?btn(t.label+icon('arrow'),t.action,'text',t.id?`data-id="${t.id}"`:''):''}</div></article>`;}

function home(){
 const current=effective(),report=summary(current,today().slice(0,7)),plan=buildSkinPlan(current);
 const observation=photoHistory(current.skinCare).at(-1)?.reference;
 const score=observation?.summary?.overallScore;
 const shortcuts=[
   ['사진 분석',Number.isFinite(score)?`${score.toLocaleString('ko-KR')}점 · 결과 보기`:observation?'저장한 결과 보기':subscriptionAccess?.trialLocked?`무료 체험까지 ${Math.max(0,subscriptionAccess.trialRequiredDays-subscriptionAccess.completedCheckinDays)}일`:'사진으로 살펴보기','data-care-section="photo"'],
   ['관리 계획',plan?plan.title:'피부 느낌 알려주기','data-care-section="routine"'],
   ['예산',report.budget===null?'예산 정하기':currency(report.budget),'data-settings="budget"'],
   ['소비 기록',report.records.length?`${report.records.length}건 보기`:'첫 기록 남기기','data-record-open="spend"'],
   ['변화 리포트','월간 기록 보기','data-view="report"'],
 ];
 return `${checkinUI.home()}<section class="home-shortcuts" aria-label="내 뷰티 흐름"><h2>내 뷰티 흐름</h2><div>${shortcuts.map(([title,value,action])=>`<button type="button" class="home-shortcut" ${action}><strong>${title}</strong><span>${esc(value)}</span>${icon('chevron')}</button>`).join('')}</div></section>${renderHomeMetrics(current,today(),{showBudgetPrompt:false})}`;
}
function records(){
 const panels=[['care','관리 기록',()=>careUI.review()],['spend','소비 기록',spendingRecords],['report','월간 리포트',()=>reportUI.render()]];
 return `<div class="record-tabs" aria-label="기록 메뉴">${panels.map(([id,label])=>`<button data-record-tab="${id}" aria-pressed="${recordPanel===id}" aria-controls="record-${id}">${label}</button>`).join('')}</div>${panels.map(([id,label,content])=>`<section id="record-${id}" class="record-view-panel" ${recordPanel===id?'':'hidden'}>${content()}</section>`).join('')}`;
}
function spendingRecords(){
 const s=summary(effective(),month);
 return `<section class="panel record-panel"><div class="record-intro"><h2>소비 기록</h2>${s.records.length?`<strong>${s.records.length}건</strong>`:''}</div><div class="filters"><label class="search">${icon('search')}<input id="search" aria-label="소비 기록 검색" placeholder="관리·제품 이름 검색" value="${esc(query)}"></label><div class="chips" aria-label="카테고리 필터">${[{id:'all',name:'전체'},...CATEGORIES].map(c=>`<button type="button" class="chip ${filter===c.id?'selected':''}" data-filter="${c.id}" aria-pressed="${filter===c.id}">${c.name}</button>`).join('')}</div></div><div id="record-results"></div></section>`;
}
function updateResults(){
 const el=$('#record-results');if(!el)return;
 const rows=summary(effective(),month).records.filter(r=>(filter==='all'||r.category===filter)&&r.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 el.innerHTML=rows.length?`<p class="list-count">${rows.length}건 · ${currency(rows.reduce((a,r)=>a+r.amount,0))}</p><div class="records-list">${rows.map(row).join('')}</div>`:query||filter!=='all'?empty('해당하는 기록이 없어요','검색어나 카테고리를 바꿔보세요.','reset-filter','전체 기록 보기'):'<div class="empty"><h3>첫 번째 소비를 남겨보세요</h3></div>';
}
function review(){
 const current=summary(effective(),month);
 return `<section class="review-intro"><span class="review-mark">${icon('chart')}</span><div><h2>내가 좋아했던 선택을<br>다음 달에도 기억하도록.</h2><p>지출과 직접 남긴 만족도를 함께 돌아봐요.</p></div></section><section class="metrics-grid"><article><span>이번 달 지출</span><strong>${currency(current.total)}</strong></article>${current.average===null?'':`<article><span>평균 만족도 · ${current.rated}건 평가</span><strong>${current.average.toFixed(1)}<small>/ 5.0</small></strong></article>`}</section><section class="panel"><div class="section-head"><h2>지출 & 만족도 추이</h2><span class="small-badge">최근 6개월</span></div>${trendChart(effective(),month)}<p class="field-help">미평가 달은 만족도 선을 이어 그리지 않아요. 두 지표의 눈금은 서로 달라요.</p></section><section class="panel"><div class="section-head"><h2>분야별 소비 경험</h2></div>${current.records.length?current.categories.filter(category=>category.count).map(category=>{const rated=current.records.filter(record=>record.category===category.id&&record.rating!==null);return `<div class="review-row"><span class="category-icon" style="--ink:${categoryColor(category.id)}">${icon(category.icon)}</span><div><strong>${category.name}</strong><small>${category.count}건 · ${currency(category.amount)}</small></div><b>${rated.length?(rated.reduce((total,record)=>total+record.rating,0)/rated.length).toFixed(1)+' / 5':'평가 전'}<small>${rated.length}건 평가</small></b></div>`}).join(''):empty('아직 돌아볼 기록이 없어요','소비와 만족도를 함께 남겨주세요.')}</section><section class="panel"><div class="section-head"><h2>다음 달을 위한 제안</h2></div>${suggestions(effective(),month).map(tip).join('')}<button class="btn primary full-width" data-view="life">다음 달 예산 검토하기 ${icon('arrow')}</button></section><details class="card-details"><summary>자세히 보기 · 소비 제안 기준</summary><p>이 제안은 지출과 직접 남긴 평가를 바탕으로 한 단순 규칙이에요. 피부 개선, 치료 효과나 투자 수익률을 뜻하지 않아요.</p></details>`;
}
const settingsRow=(label,attribute,tone='')=>`<button type="button" class="settings-list-row ${tone}" ${attribute}><span>${label}</span>${icon('chevron')}</button>`;
function compactSettings(){
 if(settingsPanel!=='main'){
   const content={budget:budgetOverview,plan:()=>lifeUI.plan(),inventory:()=>lifeUI.inventory(),history:()=>careUI.history(),service:()=>careUI.sources(),subscription:()=>renderSubscription(subscriptionState,subscriptionError),reminder:()=>Capacitor.getPlatform()==='android'?reminderUI.panel():''}[settingsPanel];
   return `<div class="settings-subview"><button class="settings-back" data-settings-back>← ${settingsPanel==='plan'?'예산':'마이'}</button>${content?content():''}</div>`;
 }
 return `${accountUI.panel()}<div class="settings-list">${settingsRow('내 목표','data-view="goals" data-main-action="1"','settings-first')}${settingsRow('예산','data-settings="budget"')}${settingsRow('보유 제품·일정','data-settings="inventory"')}${settingsRow('이용권·구독 관리','data-settings="subscription"')}${Capacitor.getPlatform()==='android'?settingsRow('알림','data-settings="reminder"'):''}<p class="settings-divider">설정</p>${accountUI.kakaoSettings()}${settingsRow('계획 변경 이력','data-settings="history"')}${settingsRow('서비스 안내·참고 자료','data-settings="service"')}${settingsRow('개인정보 처리방침','data-view="privacy"')}${settingsRow('이용약관','data-view="terms"')}${settingsRow('피부 기록만 삭제','data-care="delete"')}${settingsRow('로그아웃','data-account="logout"')}${settingsRow('계정 탈퇴','data-account="delete-open"','settings-muted')}</div>`;
}
function budgetOverview(){
 const current=summary(effective(),today().slice(0,7)),plan=buildSkinPlan(effective());
 const allocation=effective().plans?.[today().slice(0,7)];
 return `<section class="panel settings-budget"><h2>이번 달 예산</h2>${current.budget===null?'<p>이번 달 쓸 수 있는 금액부터 정해요.</p>':`<strong>${currency(current.budget)}</strong>`}<button class="btn ${current.budget===null?'primary':'secondary'} full-width" data-action="budget">${current.budget===null?'예산 정하기':'예산 수정하기'}</button></section>${renderBudgetResult(effective(),today().slice(0,7))}<details class="budget-more"><summary>자세히</summary><button type="button" class="text-link budget-purchase-link" data-action="budget-purchase">구매 가격 남기기 (선택)</button>${current.budget===null?'':`<section class="panel budget-next"><h2>예산 안의 관리 계획</h2><p>${plan?esc(plan.title):'지금 피부 느낌을 알려주시면 루틴을 정리해요.'}</p>${plan&&plan.allowance.cap!==null?`<div class="budget-limit"><span>지금 남은 피부 구매 상한</span><strong>${currency(plan.allowance.cap)}</strong></div>`:''}<button class="btn secondary full-width" data-care-section="routine">${plan?'오늘 루틴 보기':'피부 느낌 알려주기'}</button><details><summary>분야별 예산 살펴보기</summary>${allocation?`<ul>${CATEGORIES.filter(category=>allocation.allocations[category.id]>0).map(category=>`<li>${category.name} · ${currency(allocation.allocations[category.id])}</li>`).join('')||'<li>정해 둔 분야별 금액은 없어요.</li>'}</ul>`:'<p>소비 기록이 없으면 분야별 금액을 임의로 나누지 않아요.</p>'}<button type="button" class="text-link" data-settings="plan">분야별 예산 직접 조정하기 →</button></details></section>`}${effective().skinCare.profile?careUI.skinBudget():''}</details>`;
}
const careUI=createSkinUI({state:()=>({data,demo,busy,storageError:storageError||!accountLoaded,effective:effective()}),access:()=>subscriptionAccess,photoFetch:accountClient.photoFetch,photoConnection:accountClient.photoConnection,dialog,toast,persist,navigate,render,openCheckin:date=>checkinUI.openDate(date),afterDailySave:previousCount=>checkinUI.noteDailySave(previousCount),offerReminder:()=>reminderUI.offerFirstCheckin()});
const care=()=>careUI.render();
const checkinUI=createCheckinUI({state:()=>({data,demo,busy,storageError:storageError||!accountLoaded,identity:accountClient.state().identity}),persist,render,navigate,subscription:()=>accountClient.subscription(),offerReminder:()=>reminderUI.offerFirstCheckin()});
const checkin=()=>checkinUI.render();
const reminderUI=createReminderUI({state:()=>({data,demo,user:accountClient.state().user,identity:accountClient.state().identity,ready:accountLoaded&&!storageError&&!demo&&!accountUI.locked()}),toast,navigate,dialog});
const flowUI=createFlowUI({state:()=>({data,demo,busy,storageError,effective:effective()}),persist,navigate});
const welcome=()=>flowUI.welcome(),goals=()=>flowUI.goals(),products=()=>flowUI.products(),preview=()=>flowUI.preview();
const lifeUI=createLifeUI({state:()=>({data,month,demo,busy,storageError,effective:effective()}),dialog,toast,persist,render});
const life=()=>lifeUI.render();
const wishUI=createWishUI({setMonth:value=>{month=value;},state:()=>({data,month,demo,busy,storageError,effective:effective()}),dialog,toast,persist,render});
const wishes=()=>wishUI.render();
const reportUI=createReportUI({state:()=>({data,month,demo,busy,storageError,effective:effective()}),dialog,toast,persist,navigate,setMonth:value=>{if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)&&value<=today().slice(0,7))month=value;}});
function render(){
 if(!accountLoaded||accountUI.locked()){checkinUI.reset();checkinUI.sync(view);void reminderUI.sync();document.body.classList.remove('welcome-mode','goals-mode');$('#app').innerHTML=accountUI.gate();syncScreenAction();return;}
 if(goalFirstRoute(data,view)!==view){view='goals';history.replaceState(null,'','#goals');}
 if(view==='privacy'||view==='terms'){$('#app').innerHTML=`<main class="account-shell">${view==='privacy'?renderPrivacyPolicy({signedIn:true}):renderTerms({signedIn:true})}</main>`;return;}
 document.body.classList.toggle('welcome-mode',view==='welcome');
 document.body.classList.toggle('goals-mode',view==='goals'||view==='products');
 const title={care:'피부 분석과 관리 계획',checkin:'오늘의 체크인',goals:'나의 목표',products:'내 화장대',home:'나를 위한 뷰티 계획',records:'기록과 리포트'}[view];
 const activeView=view==='checkin'?'care':view;
 const pageHead=view==='settings'?'':`<div class="page-head"><h1>${title}</h1>${view==='records'?`<div class="head-actions" ${recordPanel==='care'?'hidden':''}><div class="month-control"><button type="button" data-action="prev-month" aria-label="이전 달">${icon('chevron','rotate')}</button><label><span class="sr-only">조회 월</span><input type="month" id="month" value="${month}" min="2000-01" max="${today().slice(0,7)}" aria-label="조회 월"></label><button type="button" data-action="next-month" aria-label="다음 달" ${month>=today().slice(0,7)?'disabled':''}>${icon('chevron')}</button></div>${btn(icon('plus'),'add','primary add-record-button',`aria-label="소비 기록" ${recordPanel==='spend'?'':'hidden'}`)}</div>`:''}</div>`;
 $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#home" aria-label="${APP.name} 홈"><img src="/아이콘.svg" alt=""><span>${APP.name}</span></a><nav aria-label="주 메뉴">${navs.map(([route,glyph,label])=>`<button type="button" data-view="${route}" class="nav-item ${activeView===route?'active':''}" ${activeView===route?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav></aside><main><header class="topbar"><a class="app-wordmark" href="#home" aria-label="${APP.name} 홈">${icon('diamond')} ${APP.name}<small>${APP.englishName}</small></a><button class="profile" data-view="settings" aria-label="마이페이지">${icon('person')}</button></header>${storageError?'<div class="error-banner">기록을 불러오지 못했어요. 다시 연결을 확인해 주세요.</div>':''}<div class="main-content">${pageHead}${undoData&&!demo?'<div class="undo-banner" role="status">최근 삭제한 소비 기록을 복구할 수 있어요. <button class="btn secondary" data-action="undo-delete">삭제 취소</button></div>':''}${({home,records,settings:compactSettings,goals,products,care,checkin}[view])()}</div></main><nav class="mobile-nav" aria-label="모바일 메뉴">${navs.map(([route,glyph,label])=>`<button data-view="${route}" class="${activeView===route?'active':''}" ${activeView===route?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>`;
 updateResults();checkinUI.sync(view==='settings'&&settingsPanel==='subscription'?'subscription':view);void reminderUI.sync();syncScreenAction();
}
function dialog(title,body){
 const el=$('#editor');el.innerHTML=`<div class="modal-head"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button></div>${body}`;
 if(!el.open)el.showModal();
 el.querySelector('input,textarea,select,button[type="submit"]')?.focus();
}
function openRecord(id,copy=false){
 if(demo){toast('샘플을 종료하고 내 기록에서 시작해 주세요.');return;}
 if(storageError){toast('원본 기록 보호를 위해 먼저 백업을 복원해 주세요.');return;}
 let r=id?data.records.find(r=>r.id===id):{id:crypto.randomUUID(),title:'',category:'hair',amount:'',date:month===today().slice(0,7)?today():month+'-01',rating:null,repurchase:null,memo:''};
 if(!r)return;
 if(copy){r={...r,id:crypto.randomUUID(),date:today(),rating:null,repurchase:null,useDays:null,reviewDate:'',good:'',bad:''};id=null;}
 dialog(id?'소비 기록 수정':'새로운 소비 기록',`<p class="modal-sub">작은 소비도 좋아요. 나의 경험을 남겨보세요.</p><form id="record-form" data-id="${r.id}"><label>관리·제품 이름 <input name="title" placeholder="예: 헤어 커트, 수분 크림" required maxlength="60" value="${esc(r.title)}" autocomplete="off"></label><div class="form-grid"><label>카테고리<select name="category">${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===r.category?'selected':''}>${c.name}</option>`).join('')}</select></label><label>소비 날짜<input type="date" name="date" value="${r.date}" required min="2000-01-01" max="${today()}"></label></div><label>사용한 금액 <span class="input-unit"><input type="number" inputmode="numeric" name="amount" min="0" max="100000000" step="1" required placeholder="0" value="${r.amount}"><span>원</span></span></label><div class="form-grid"><label>만족도<select name="rating"><option value="" ${r.rating===null?'selected':''}>아직 평가하지 않았어요</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${r.rating===n?'selected':''}>${'★'.repeat(n)} · ${n}점</option>`).join('')}</select></label><label>다시 선택할까요?<select name="repurchase"><option value="" ${r.repurchase===null?'selected':''}>아직 모르겠어요</option><option value="yes" ${r.repurchase===true?'selected':''}>네, 다시 선택할래요</option><option value="no" ${r.repurchase===false?'selected':''}>아니요, 쉬어갈래요</option></select></label></div><label>나에게 남기는 메모 <small>선택</small><textarea name="memo" rows="3" maxlength="500" placeholder="어떤 점이 좋았나요?">${esc(r.memo)}</textarea></label><div class="experience-fields"><div class="form-grid"><label>실제 사용기간 (일, 선택)<input name="useDays" type="number" min="1" max="36500" step="1" value="${r.useDays??''}"></label><label>평가 예정일 (선택)<input name="reviewDate" type="date" min="${r.date}" max="2099-12-31" value="${r.reviewDate??''}"></label></div><label>만족한 이유<textarea name="good" maxlength="300">${esc(r.good??'')}</textarea></label><label>불만족한 이유<textarea name="bad" maxlength="300">${esc(r.bad??'')}</textarea></label></div>${id?btn('이 기록 복사','copy','secondary',`data-id="${r.id}"`):''}<p id="form-error" class="form-error" role="alert"></p><div class="modal-actions">${id?btn(icon('trash')+'삭제','delete','danger',`data-id="${r.id}"`):'<span></span>'}<button type="submit" class="btn primary">${icon('check')} 기록 저장</button></div></form>`);
}
function budgetDialog(){
 if(demo){toast('샘플을 종료하고 내 예산을 정해 주세요.');return;}
 if(storageError){toast('먼저 백업을 복원해 주세요.');return;}
 dialog('이번 달 예산 정하기',renderBudgetForm(monthText(),data.budgets[month]));
}
function budgetPurchaseDialog(){
 if(demo||storageError){toast('로그인한 내 계정에서만 기록할 수 있어요.');return;}
 dialog('구매 가격 남기기',`<form id="budget-purchase-form"><label>제품 종류<select name="kind" required>${Object.entries(PRODUCT_KINDS).map(([kind,label])=>`<option value="${kind}">${label}</option>`).join('')}</select></label><label>실제 구매 가격 (원)<input type="number" name="price" required min="1" max="100000000" step="1" inputmode="numeric"></label><p class="field-help">종류와 가격만 기억해둘게요. 예산 예상 금액에만 사용해요.</p><p id="form-error" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn primary" type="submit">가격 저장</button></div></form>`);
}
async function persist(next,success){
 if(!accountLoaded||!accountClient.state().user||demo){toast('로그인한 내 계정에서만 저장할 수 있어요.');return false;}
 if(busy)return false;busy=true;
 const submit=$('#editor button[type="submit"]');if(submit)submit.disabled=true;
 try{next=validateData(next);data=await accountClient.write(next,data);undoData=null;storageError=false;$('#editor').close();render();void refreshSubscriptionAccess();if(success)toast(success);return true;}
 catch(e){const message=e.code?e.message:'저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요. 원래 기록은 유지됩니다.';const el=$('#editor[open] .form-error')??$('#plan-error');if(el)el.textContent=message;toast(message);return false;}
 finally{busy=false;if(submit)submit.disabled=false;}
}
function confirmDelete(id){
 const r=data.records.find(r=>r.id===id);if(!r)return;
 dialog('이 기록을 삭제할까요?',`<p class="modal-sub">${esc(r.title)} · ${currency(r.amount)}<br>다음 저장 작업 전까지 삭제 취소로 복구할 수 있어요. 새로고침하면 취소할 수 없어요.</p><div class="modal-actions">${btn('취소','edit','secondary',`data-id="${id}"`)}${btn('기록 삭제','confirm-delete','danger',`data-id="${id}"`)}</div>`);
}
function backup(mode){
 if(demo){toast('내 기록으로 돌아간 후 이용해 주세요.');return;}
 if(mode==='export'&&storageError){toast('기록을 읽지 못해 백업을 만들 수 없어요. 원본 저장 데이터는 보존되어 있어요.');return;}
 if(mode==='export')dialog('내 기록 백업',`<p class="modal-sub">아래 내용을 복사해 안전한 곳에 보관해 주세요.<br>현재 계정의 모든 월별 기록·예산·피부 상태·사용 경험이 포함돼요. 개인정보가 포함된 파일이므로 안전하게 보관하세요.</p><textarea class="backup-text" aria-label="백업 내용" readonly rows="9">${esc(JSON.stringify(data,null,2))}</textarea><div class="modal-actions">${btn('닫기','close','secondary')}${btn('전체 선택','select-backup')}</div>`);
 else dialog('백업으로 복원',`<p class="modal-sub">백업 내용을 붙여넣어 주세요. 현재 기록 전체가 교체돼요.</p><form id="import-form"><label>백업 내용<textarea name="backup" rows="8" required maxlength="5000000" placeholder="${APP.name}에서 복사한 백업 내용을 붙여넣으세요."></textarea></label><label class="checkbox"><input type="checkbox" required name="confirm"> 현재 기록을 교체하는 데 동의해요.</label><p id="form-error" class="form-error" role="alert"></p><div class="modal-actions">${btn('취소','close','secondary')}<button type="submit" class="btn primary">복원하기</button></div></form>`);
}
document.addEventListener('click',async e=>{
 if(!accountLoaded)return;
 if(e.target.closest('[data-subscription-retry]')){void loadSubscription();return;}
 const interest=e.target.closest('[data-payment-interest]');if(interest&&!busy){interest.disabled=true;try{await accountClient.paymentInterest(interest.dataset.paymentInterest);toast('알림을 원하시는 마음을 기억해둘게요.');}catch(issue){interest.disabled=false;toast(issue.message);}return;}
 const recordLink=e.target.closest('[data-record-open]');if(recordLink&&!busy){view='records';recordPanel=recordLink.dataset.recordOpen;history.replaceState(null,'','#records');render();window.scrollTo(0,0);return;}
 const recordTab=e.target.closest('[data-record-tab]');if(recordTab&&!busy){recordPanel=recordTab.dataset.recordTab;history.replaceState(null,'',recordPanel==='report'?'#report/'+month:'#records');for(const button of document.querySelectorAll('[data-record-tab]'))button.setAttribute('aria-pressed',String(button.dataset.recordTab===recordPanel));for(const panel of document.querySelectorAll('.record-view-panel'))panel.hidden=panel.id!=='record-'+recordPanel;document.querySelector('.head-actions').hidden=recordPanel==='care';const add=document.querySelector('.add-record-button');if(add)add.hidden=recordPanel!=='spend';syncScreenAction();return;}
 const setting=e.target.closest('[data-settings]');if(setting&&!busy){navigate('settings',setting.dataset.settings);return;}
 if(e.target.closest('[data-settings-back]')&&!busy){settingsPanel=settingsPanel==='plan'?'budget':'main';render();return;}
 const careSection=e.target.closest('[data-care-section]');if(careSection&&!busy){navigate('care',careSection.dataset.careSection);return;}
 const v=e.target.closest('[data-view]');if(v){if(!busy)navigate(v.dataset.view);return;}
 const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;for(const chip of document.querySelectorAll('[data-filter]')){const selected=chip.dataset.filter===filter;chip.classList.toggle('selected',selected);chip.setAttribute('aria-pressed',String(selected));}updateResults();return;}
 const b=e.target.closest('[data-action]');if(!b||busy)return;
 const a=b.dataset.action;
 if(a==='copy')openRecord(b.dataset.id,true);else if(a==='add')openRecord();else if(a==='edit')openRecord(b.dataset.id);else if(a==='budget'){if(view==='care')month=today().slice(0,7);budgetDialog();}
 else if(a==='close')$('#editor').close();else if(a==='delete')confirmDelete(b.dataset.id);
 else if(a==='confirm-delete'){const previous=data;if(await persist(removeRecord(data,b.dataset.id),'기록을 삭제했어요. 삭제 취소로 복구할 수 있어요.')){undoData=previous;render();}}
 else if(a==='undo-delete'&&undoData&&!demo&&!storageError)await persist(undoData,'삭제한 기록과 구매 연결을 복구했어요.');
 else if(a==='demo'){demo=!demo;render();}
 else if(a==='reset-filter'){filter='all';query='';render();}
 else if(a==='quick-budget')$('#budget-form input[name="budget"]').value=Number(b.dataset.value).toLocaleString('ko-KR');
 else if(a==='budget-purchase')budgetPurchaseDialog();
 else if(a==='export'||a==='import')backup(a);
 else if(a==='select-backup'){$('.backup-text').focus();$('.backup-text').select();toast('전체 내용을 선택했어요. 복사해서 보관해 주세요.');}
 else if(a==='prev-month'||a==='next-month'){
   const date=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1+(a==='prev-month'?-1:1),1,12);
   const next=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
   if(next>='2000-01'&&next<=(view==='wishes'?'2099-12':today().slice(0,7))){month=next;if(view==='records'&&recordPanel==='report')history.replaceState(null,'','#report/'+month);render();}
 }
});
document.addEventListener('input',event=>{
 if(event.target.id==='search'){query=event.target.value;updateResults();}
 if(event.target.matches('#budget-form input[name="budget"]')){
   const input=event.target,caret=input.selectionStart,priorDigits=input.value.slice(0,caret).replace(/\D/g,'').length;
   input.value=formatBudgetInput(input.value);
   const nextCaret=priorDigits?Array.from(input.value).findIndex((character,index)=>index>=0&&input.value.slice(0,index+1).replace(/\D/g,'').length===priorDigits)+1:0;
   input.setSelectionRange(nextCaret,nextCaret);
 }
});
document.addEventListener('change',e=>{if(e.target.id==='month'&&e.target.checkValidity()&&e.target.value){month=e.target.value;if(view==='records'&&recordPanel==='report')history.replaceState(null,'','#report/'+month);render();}});
document.addEventListener('submit',async e=>{
 if(!accountLoaded)return;
 if(!['record-form','budget-form','budget-purchase-form','import-form'].includes(e.target.id))return;
 e.preventDefault();if(busy)return;
 const f=new FormData(e.target);let next;
 try{
   if(e.target.id==='record-form'){
     const r=validateRecord({id:e.target.dataset.id,title:f.get('title'),category:f.get('category'),date:f.get('date'),amount:Number(f.get('amount')),rating:f.get('rating')===''?null:Number(f.get('rating')),repurchase:f.get('repurchase')===''?null:f.get('repurchase')==='yes',memo:f.get('memo'),useDays:f.get('useDays')===''?null:Number(f.get('useDays')),reviewDate:f.get('reviewDate'),good:f.get('good'),bad:f.get('bad')});
     next={...data,records:[...data.records.filter(x=>x.id!==r.id),r]};
   }else if(e.target.id==='budget-purchase-form'){
     next=addPurchasePrice(data,f.get('kind'),Number(f.get('price')));
   }else if(e.target.id==='budget-form'){
     const amount=Number(String(f.get('budget')).replaceAll(',',''));
     if(!Number.isSafeInteger(amount)||amount<0||amount>100000000)throw Error('예산은 0원부터 1억 원까지 입력해 주세요.');
     next=validateData({...data,budgets:{...data.budgets,[month]:amount},plans:data.plans[month]?{...data.plans,[month]:{...data.plans[month],total:amount}}:data.plans});
   }else next=validateData(JSON.parse(f.get('backup')));
   const saved=await persist(next,e.target.id==='import-form'?'백업을 복원했어요.':e.target.id==='budget-form'?'예산을 저장했어요.':'저장했어요. 나의 선택을 기억할게요.');
   if(saved&&e.target.id==='budget-form'&&view==='care')navigate('settings','budget');
 }catch(err){($('#editor[open] #form-error')??$('#plan-error')).textContent=err instanceof SyntaxError?'백업 내용의 형식이 올바르지 않아요. 전체 내용을 복사해 주세요.':err.message;}
});
$('#editor').addEventListener('click',e=>{if(e.target===$('#editor')&&!busy){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
window.addEventListener('hashchange',()=>{const hash=routeFromHash();if(!accountLoaded){render();return;}if(routes.includes(hash))navigate(hash);});
await reminderUI.initialize();
await accountUI.initialize();
await initializeAccount();
if(Capacitor.isNativePlatform())App.addListener('appStateChange',({isActive})=>{if(isActive)void reminderUI.sync(true);});
document.addEventListener('visibilitychange',async()=>{
 if(!accountLoaded)return;
 if(document.hidden){checkinUI.closeSheet(false);if(!document.getElementById('account-privacy')){const curtain=document.createElement('div');curtain.id='account-privacy';curtain.className='account-privacy';curtain.textContent='로그인 상태를 확인한 뒤 기록을 표시해요.';document.body.append(curtain);}return;}
 try{await accountClient.refresh();void reminderUI.sync(true);document.getElementById('account-privacy')?.remove();}catch{expireAccount();}
});
window.addEventListener('pageshow',event=>{if(event.persisted)expireAccount();});
if(Capacitor.isNativePlatform())App.addListener('backButton',()=>{if(checkinUI.closeSheet())return;if($('#editor').open){if(!busy)$('#editor').close();}else if(view!=='home'){view='home';render();}else App.minimizeApp();});
