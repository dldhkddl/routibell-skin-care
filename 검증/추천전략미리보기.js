import '../화면/글꼴.css';
import '../화면/스타일.css';
import '../화면/사진분석.css';
import '../화면/사진그래프.css';
import './추천전략미리보기.css';
import { APP } from '../앱설정.js';
import { PHOTO_LABELS } from '../화면/사진항목.js';
import { renderPhotoGuidance } from '../화면/사진설명.js';
import { renderPhotoComparison } from '../화면/사진그래프.js';
import { makeRecommendationScenarios, evaluateRecommendationScenario } from './추천전략시나리오.js';

const esc=value=>String(value??'').replace(/[&<>"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[character]));
const options=new URLSearchParams(location.search);
const scenarioId=options.get('case')??'02';
const strategy=['A','B'].includes(options.get('strategy'))?options.get('strategy'):'A';
const container=document.getElementById('recommendation-preview');

function routine(label,steps){
  return `<section class="review-routine"><h3>${label}</h3><ol>${steps.map(step=>`<li><span>${esc(step.title)}</span><small>${step.product?'가진 제품':'제품 선택 전'}</small></li>`).join('')}</ol></section>`;
}

fetch('./실제응답구조.json').then(response=>response.json()).then(source=>{
  const output=source.data.results.output;
  const scores=Object.fromEntries(output.filter(item=>Number.isFinite(item.raw_score)).map(item=>[item.type,item.raw_score]));
  scores.skin_type=null;
  const summary={overallScore:output.find(item=>item.type==='all')?.score,skinAge:output.find(item=>item.type==='skin_age')?.score};
  const skinTypes=Object.fromEntries(output.filter(item=>item.type==='skin_type').map(item=>[item.region,item.skin_type]));
  const scenario=makeRecommendationScenarios(scores,summary,skinTypes).find(item=>item.id===scenarioId);
  if(!scenario)throw Error('비교할 가상 사례를 찾지 못했어요.');
  const {recommendation,guidance,plan}=evaluateRecommendationScenario(scenario,strategy);
  const focused=recommendation.focused.map(type=>recommendation.items.find(item=>item.type===type)).filter(Boolean);
  const compared=renderPhotoComparison(scenario.data.skinCare.observations);
  container.innerHTML=`<header class="review-header"><strong>${esc(APP.name)}</strong><span>추천 검증 화면</span></header>
    <div class="review-body"><p class="review-note">가상 기록 · 실제 분석/저장 없음</p><h1>${esc(scenario.title)}</h1>
    <p class="review-strategy">전략 ${strategy} · ${strategy==='A'?'고정 구간':'내 피부 기준'}</p>
    ${renderPhotoGuidance(guidance,{links:false})}
    <section class="review-focus"><h2>이번 집중 항목</h2>${focused.length?`<div>${focused.map(item=>`<p><span>${esc(PHOTO_LABELS[item.type])}</span><strong>${item.score.toFixed(1)}</strong></p>`).join('')}</div>`:'<p class="review-empty">억지로 정하지 않고 기본 루틴을 이어가요.</p>'}</section>
    ${compared}
    <section class="review-plan"><h2>오늘의 루틴</h2>${plan.paused?'<p>불편함을 먼저 기록해요. 새 단계는 잠시 멈춰요.</p>':`${routine('아침',plan.morning)}${routine('저녁',plan.evening)}`}</section>
    <p class="review-next">${esc(guidance.nextAnalysis??'')}</p></div>`;
}).catch(error=>{container.innerHTML=`<p class="review-error">${esc(error.message)}</p>`;});
