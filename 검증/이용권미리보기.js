import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/사진분석.css';
import '../화면/사진그래프.css';
import '../화면/결과카드.css';
import '../화면/이용권화면.css';
import { EMPTY } from '../화면/계산.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { renderSubscription } from '../화면/이용권화면.js';

const root=document.getElementById('preview-content');
const locked=new URLSearchParams(location.search).get('view')==='locked';
const access={tier:'free',maxActions:4,fullAnalysis:false,remaining:0,freeTrialRemaining:locked?1:0,trialLocked:locked,completedCheckinDays:locked?1:3,trialRequiredDays:3,oneTimeRemaining:0};
const data=EMPTY();
data.goals={selected:['skin'],note:''};
data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:'2026-09-29'};

if(!locked){
  root.innerHTML=renderSubscription({priceKrw:7900,analysisPassPriceKrw:3900,monthlyAnalyses:2,billingAvailable:false,access});
}else{
  const photo=createPhotoUI({
    state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),
    photoConnection:async()=>({path:'/api/youcam'}),
    photoFetch:async address=>Response.json(address.endsWith('/status')
      ?{accountScoped:true,analysisEnabled:true,analysisUsed:false,localToken:'preview-only',access}
      :{used:false,job:null,access}),
    navigate(){},toast(){},
  });
  root.innerHTML=photo.render();
  document.querySelector('[data-photo="connect"]').click();
  setTimeout(()=>{root.innerHTML=photo.render();},100);
}
