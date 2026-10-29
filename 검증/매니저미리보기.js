import '../화면/체크인봇.css';
import '../화면/이용권화면.css';
import '../화면/사진분석.css';
import '../화면/피부계획.css';
import { EMPTY } from '../화면/계산.js';
import { emptyCare } from '../화면/피부계산.js';
import { saveBotCheckin } from '../화면/체크인계산.js';
import { createCheckinUI } from '../화면/체크인봇.js';
import { renderSubscription } from '../화면/이용권화면.js';
import { renderCapacityNotice } from '../화면/사진분석.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { createSkinUI } from '../화면/피부계획.js';

const stateName=new URLSearchParams(location.search).get('state')??'done';
const date='2025-03-15';
const product={id:'cream-one',title:'내 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:65,opened:'2025-02-01',expires:'2099-12-31',memo:''};
const base=()=>({...EMPTY(),inventory:[{...product}],skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:['dryness'],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date},selection:{cleanser:null,cream:product.id,sunscreen:null}}});
const titles={payment:'결제 오픈 알림',cap:'사진 분석',lock:'무료 체험 · 1/3',step1:'체크인 · 첫 번째 탭',step2:'체크인 · 두 번째 탭',routine:'내 화장대 루틴',done:'체크인 완료 · 했어요',pending:'체크인 완료 · 못 했어요',discomfort:'체크인 완료 · 불편했어요',morning:'체크인 완료 · 아침만',both:'체크인 완료 · 아침·저녁',sheetMorning:'매니저 · 아침 전',sheetEvening:'매니저 · 저녁 남음',sheetProduct:'매니저 · 제품 소진'};
document.getElementById('title').textContent=titles[stateName]??titles.done;
const target=document.getElementById('preview');
if(stateName==='payment')target.innerHTML=renderSubscription({access:{tier:'free',oneTimeRemaining:0,freeTrialRemaining:0,trialRequiredDays:3},priceKrw:7900,monthlyAnalyses:2,analysisPassPriceKrw:3900,paymentsEnabled:false});
else if(stateName==='cap')target.innerHTML=`<section class="photo-panel"><h2>사진으로 피부 살펴보기</h2>${renderCapacityNotice({closedDaily:true})}</section>`;
else if(stateName==='lock'){
  const data=base(),access={tier:'free',remaining:0,freeTrialRemaining:1,trialLocked:true,completedCheckinDays:1,trialRequiredDays:3,maxActions:4};
  const ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),photoConnection:async()=>({path:'/api/youcam'}),photoFetch:async address=>Response.json(address.endsWith('/status')?{accountScoped:true,analysisEnabled:false,analysisUsed:false,localToken:'preview',access}:{used:false,job:null,access}),toast(){},render(){}});
  target.innerHTML=ui.render();target.querySelector('[data-photo="connect"]')?.click();await new Promise(resolve=>setTimeout(resolve,50));target.innerHTML=ui.render();
}
else if(stateName==='routine'){
  const data=base();data.inventory=[{...product,id:'cleanser-one',kind:'cleanser',title:'내 클렌저'},{...product},{...product,id:'sunscreen-one',kind:'sunscreen',title:'내 선크림'}];
  const ui=createSkinUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),toast(){},persist:async()=>true,render(){}});
  target.innerHTML=ui.render();
}
else{
  let data=base();
  if(stateName==='sheetProduct')data.inventory[0].remaining=10;
  if(!stateName.startsWith('sheet')&& !['step1','step2'].includes(stateName)||stateName==='sheetEvening'){
    if(stateName!=='done')data=saveBotCheckin(data,{adherence:'yes',routine:'both',mood:'balanced'},'2025-03-14',date);
    const answers=stateName==='pending'?{adherence:'pending',mood:'balanced'}:stateName==='discomfort'?{adherence:'pending',mood:'uncomfortable',product:'none'}:stateName==='morning'||stateName==='sheetEvening'?{adherence:'yes',routine:'morning',mood:'balanced'}:stateName==='done'?{adherence:'yes',routine:'evening',mood:'balanced'}:{adherence:'yes',routine:'both',mood:'balanced'};
    data=saveBotCheckin(data,answers,date);
  }
  if(['done','pending','morning','both'].includes(stateName))data.skinCare.observations=[{id:'preview-photo',completedAt:'2025-03-10T01:00:00.000Z',condition:'unknown',baselineId:null,reference:{provider:'youcam',version:'v2.1',date:'2025-03-10',scores:{moisture:54},focus:'moisture',actions:['moisture']}}];
  const context={state:()=>({data,identity:'preview:one',demo:false,busy:false,storageError:false}),today:()=>date,hour:()=>stateName==='sheetEvening'?20:11,pickTemplate:lines=>lines[0],render(){},persist:async()=>true,navigate(){}};
  const ui=createCheckinUI(context);
  if(stateName==='step2')await ui.handle('quick-adherence',undefined,'yes');
  target.innerHTML=stateName.startsWith('sheet')?'<p>매니저가 오늘의 기록과 할 일을 정리해요.</p>':ui.home();
  if(stateName.startsWith('sheet')){ui.sync('records');document.getElementById('checkin-launcher')?.click();}
}
