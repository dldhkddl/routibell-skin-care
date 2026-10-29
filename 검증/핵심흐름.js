import { EMPTY, today, validateData } from '../화면/계산.js';
import { saveDaily, saveSkinCheckin, capturePlan } from '../화면/피부계산.js';
import { savePhotoObservation } from '../화면/사진이력.js';

const key='beautylog-core-ui-test';
const originalGet=Storage.prototype.getItem;
const originalSet=Storage.prototype.setItem;
const originalRemove=Storage.prototype.removeItem;
const output=document.getElementById('core-test-output');
Storage.prototype.getItem=function(name){return originalGet.call(this,name==='beautylog-v1'?key:name);};
Storage.prototype.setItem=function(name,value){
  if(name==='beautylog-v1'&&document.getElementById('core-failure').checked)throw new DOMException('격리 검증 저장 실패','QuotaExceededError');
  return originalSet.call(this,name==='beautylog-v1'?key:name,value);
};
Storage.prototype.removeItem=function(name){return originalRemove.call(this,name==='beautylog-v1'?key:name);};
window.fetch=async()=>Response.json({error:'격리 검증에서는 API 통신을 차단합니다.'},{status:503});

function previousMonthData(){
  const now=today(),date=new Date(`${now.slice(0,7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth()-1);
  const month=date.toISOString().slice(0,7);
  let data=EMPTY();
  data.budgets[month]=100000;
  data.inventory=[{id:'fixture-cream',title:'검증 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:60,opened:`${month}-01`,expires:'2099-12-31',memo:''}];
  data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:`${month}-01`};
  data.skinCare.selection.cream='fixture-cream';
  data=capturePlan(data,'profile',`${month}-01`);
  const result=(day,score)=>({provider:'youcam',version:'v2.1',completedAt:`${month}-${day}T09:00:00.000Z`,items:['redness','pore','texture'].map((type,index)=>({type,rawScore:score+index}))});
  data=savePhotoObservation(data,result('02',70),'texture');
  const baseline=data.skinCare.observations[0].id;
  for(let day=2;day<=21;day++){
    const recorded=`${month}-${String(day).padStart(2,'0')}`;
    data=saveDaily(data,'morning',true,recorded);
    if(day%3!==0)data=saveDaily(data,'evening',true,recorded);
    data=saveSkinCheckin(data,{date:recorded,feeling:'comfortable',adherence:day<4?'no':'yes',feel:null,product:null,memo:'검증 기록'},recorded);
  }
  data=savePhotoObservation(data,result('28',72),'texture',baseline);
  data.records=[{id:'fixture-expense',title:'검증 보습제',category:'cosmetic',date:`${month}-04`,amount:20000,rating:null,repurchase:null,memo:''}];
  return {data:validateData(data),month};
}
document.getElementById('core-empty').addEventListener('click',()=>{localStorage.removeItem(key);location.hash='care';location.reload();});
document.getElementById('core-month').addEventListener('click',()=>{
  const loaded=previousMonthData();localStorage.setItem(key,JSON.stringify(loaded.data));location.hash=`report/${loaded.month}`;location.reload();
});
document.getElementById('core-reload').addEventListener('click',()=>location.reload());
document.getElementById('core-width').addEventListener('click',()=>{
  document.documentElement.classList.toggle('core-narrow');
  requestAnimationFrame(()=>{const root=document.getElementById('app');output.textContent=`앱 너비 ${root.clientWidth}px / 콘텐츠 ${root.scrollWidth}px`;});
});
await import('../화면/앱.js');
