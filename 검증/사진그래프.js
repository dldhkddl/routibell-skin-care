import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/사진분석.css';
import '../화면/사진그래프.css';
import './사진설명.css';
import './사진그래프.css';
import { EMPTY } from '../화면/계산.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { buildPhotoGuidance, guidanceFromReference, renderPhotoGuidance } from '../화면/사진설명.js';
import { renderPhotoTrends } from '../화면/사진그래프.js';

function render(){
  const scenario=document.getElementById('graph-scenario').value;
  const data=EMPTY(),asOf='2025-03-25';
  data.skinCare.profile={feel:scenario==='uncertain'?'oily':'dry',concerns:scenario==='uncertain'?[]:['dryness'],discomfort:scenario==='uncertain'?'unsure':'no',sensitivity:'rare',priority:'comfort',budget:0,updatedAt:asOf};
  const actions=scenario==='all'?PHOTO_ACTIONS:scenario==='skin'?['skin_type']:['pore','moisture','oiliness','skin_type'];
  const dates=['first','uncertain','skin'].includes(scenario)?['2025-03-25']:['2025-03-01','2025-03-13','2025-03-25'];
  data.skinCare.observations=dates.map((date,index)=>({id:`sample-${index}`,completedAt:`${date}T01:00:00.000Z`,condition:index?'matched':'unknown',baselineId:index?`sample-${index-1}`:null,reference:{provider:'youcam',version:'v2.1',date,focus:scenario==='skin'?'skin_type':'moisture',actions,scores:Object.fromEntries(actions.map(type=>[type,type==='skin_type'?null:type==='moisture'?78.5+index*0.4:type==='pore'?37.8:65+index])),skinTypes:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}}}));
  const latest=data.skinCare.observations.at(-1);
  if(scenario==='unmatched'){latest.condition='unknown';latest.baselineId=null;}
  if(scenario==='version')latest.reference.version='v2.0';
  if(scenario==='missing')delete latest.reference.scores.moisture;
  if(scenario==='failed')latest.reference.scores.moisture=null;
  const guidance=buildPhotoGuidance(guidanceFromReference(latest.reference),data,asOf);
  document.getElementById('graph-output').innerHTML=renderPhotoGuidance(guidance,{links:false})+renderPhotoTrends({care:data.skinCare,guidance,asOf});
  document.getElementById('graph-preview').classList.toggle('graph-mobile',document.getElementById('graph-mobile').checked);
}
document.getElementById('graph-scenario').addEventListener('change',render);
document.getElementById('graph-mobile').addEventListener('change',render);
render();
