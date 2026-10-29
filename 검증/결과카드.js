import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/사진분석.css';
import '../화면/사진그래프.css';
import '../화면/결과카드.css';
import './결과카드.css';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { PHOTO_ACTIONS, PHOTO_CONSENT_VERSION, photoPriceBand } from '../화면/사진항목.js';
import { savePhotoObservation } from '../화면/사진이력.js';
import source from './실제응답구조.json';

const output=source.data.results.output;
const base=()=>({...EMPTY(),skinCare:{...EMPTY().skinCare,profile:{feel:'balanced',concerns:[],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:null,updatedAt:today()}}});
let data=base(),started=false,actions=[...PHOTO_ACTIONS],result=null;
function sample(){return {provider:'youcam',version:'v2.1',completedAt:new Date().toISOString(),actions,summary:{overallScore:80.6,skinAge:28},items:actions.map(type=>({type,verified:true,rawScore:type==='skin_type'?null:output.find(entry=>entry.type===type)?.raw_score,...(type==='skin_type'?{skinTypes:{whole:'Normal',t_zone:'Normal',u_zone:'Normal'}}:{})}))};}
const ui=createPhotoUI({state:()=>({data,effective:data}),toast:message=>{document.getElementById('preview-status').textContent=message;},persist:async next=>{data=validateData(next);return true;},photoFetch:async(address,options)=>{
  if(address.endsWith('/status'))return Response.json({accountScoped:true,analysisEnabled:true,analysisUsed:started,access:{fullAnalysis:true,maxActions:16}});
  if(address.endsWith('/quote')){actions=JSON.parse(options.body).actions;return Response.json({id:'preview-only',actions,credits:photoPriceBand(actions.length).cap,expiresAt:Date.now()+600000,consentVersion:PHOTO_CONSENT_VERSION});}
  if(address.endsWith('/start')){started=true;result=sample();return Response.json({});}
  if(address.endsWith('/clear')){result=null;return Response.json({});}
  return Response.json({used:started,job:result?{state:'success',result}:null});
}});
const render=()=>{document.getElementById('preview-output').innerHTML=ui.render();};
document.getElementById('preview-result').addEventListener('click',()=>{ui.reset();actions=[...PHOTO_ACTIONS];data=savePhotoObservation(base(),sample(),'moisture');started=false;result=null;render();});
document.getElementById('preview-reset').addEventListener('click',()=>{ui.reset();data=base();started=false;result=null;render();});
render();
