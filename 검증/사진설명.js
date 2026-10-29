import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/사진분석.css';
import './사진설명.css';
import { EMPTY } from '../화면/계산.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { buildPhotoGuidance, renderPhotoGuidance, renderPhotoItemGuidance } from '../화면/사진설명.js';

const asOf='2025-03-15';
function renderScenario(scenario){
  const data=EMPTY();
  if(scenario!=='empty')data.skinCare.profile={feel:'dry',concerns:['dryness'],sensitivity:'rare',discomfort:scenario==='discomfort'?'yes':'no',priority:'comfort',budget:0,updatedAt:asOf};
  const result={items:PHOTO_ACTIONS.map(type=>({type,rawScore:type==='skin_type'?null:68,...(type==='skin_type'?{skinTypes:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}}:{}),verified:scenario!=='failed'||type!=='moisture'}))};
  const guidance=buildPhotoGuidance(result,data,asOf);
  document.getElementById('guidance-preview').innerHTML=`${renderPhotoGuidance(guidance,{links:false})}<h2>선택한 항목별 설명</h2><div class="preview-items">${guidance.entries.map(entry=>`<article><h3>${entry.label}</h3>${renderPhotoItemGuidance(entry)}</article>`).join('')}</div>`;
}
document.querySelector('.preview-scenarios').addEventListener('change',event=>{
  if(['recorded','empty','discomfort','failed'].includes(event.target.value))renderScenario(event.target.value);
});
renderScenario('recorded');
