import { photoResultUrl } from './사진계산.js';
import { photoTimeline, buildPhotoTrend } from './사진그래프.js';
import { icon } from './아이콘.js';
import { PHOTO_ACTIONS, PHOTO_LABELS } from './사진항목.js';
import { validatePhotoSummary } from './사진요약.js';
import { SKIN_TYPE_LABELS, SKIN_TYPE_REGIONS } from './피부타입.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const styles={moisture:['수분','drop','blue'],oiliness:['유분','drop','aqua'],firmness:['탄력','heart','pink'],wrinkle:['주름','sun','orange'],texture:['피부결','spark','purple'],pore:['모공','grid','violet'],redness:['붉은기','spark','rose'],dark_circle_v2:['다크서클','moon','blue'],acne:['트러블','heart','pink'],age_spot:['잡티','sun','orange'],radiance:['광채','spark','aqua'],eye_bag:['눈밑 주머니','moon','purple'],tear_trough:['눈물고랑','drop','blue'],droopy_upper_eyelid:['위눈꺼풀','spark','rose'],droopy_lower_eyelid:['아래눈꺼풀','spark','violet']};
const order=Object.keys(styles);
const score=value=>Number.isFinite(value)&&value>=1&&value<=100;
const number=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(value);

export function renderResultCard({result=null,reference=null,photoUrl='',care=null,titleId='photo-title',asOf}){
  if(!result&&!reference)return '';
  const items=result?.items??Object.entries(reference.scores??{}).map(([type,rawScore])=>({type,rawScore,skinTypes:type==='skin_type'?reference.skinTypes:undefined}));
  const selected=items.filter(item=>PHOTO_ACTIONS.includes(item.type));
  let summary={};
  try{summary=validatePhotoSummary(result?.summary??reference?.summary);}catch{}
  const date=result?new Date(result.completedAt):null;
  const dateText=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date):reference?.date?.replaceAll('-','. ')??'';
  const localPhoto=typeof photoUrl==='string'&&/^blob:(https?:\/\/|capacitor:\/\/|null\/)[^\s"<>]+$/.test(photoUrl)?photoUrl:'';
  const cards=order.flatMap(type=>{
    const item=selected.find(entry=>entry.type===type);
    if(!item)return [];
    const [label,glyph,tone]=styles[type],valid=item.verified!==false&&score(item.rawScore);
    return [`<button type="button" class="result-metric tone-${tone}" data-photo="detail" data-photo-type="${type}" aria-label="${esc(PHOTO_LABELS[type])} ${valid?number(item.rawScore)+'점':'확인 필요'} 자세히 보기"><span class="result-metric-icon">${icon(glyph)}</span><span class="result-metric-label">${label}</span><strong class="${valid?'':'result-metric-missing'}">${valid?number(item.rawScore):'확인 필요'}</strong></button>`];
  });
  const skin=selected.find(item=>item.type==='skin_type');
  const thumbnails=PHOTO_ACTIONS.flatMap(type=>{
    const item=selected.find(entry=>entry.type===type);if(!item)return [];
    for(const address of item.images??(item.image?[item.image]:[])){
      try{return [{type:item.type,address:photoResultUrl(address)}];}catch{}
    }
    return [];
  }).slice(0,3);
  const timeline=care?photoTimeline(care,result,asOf):[];
  const warnings=selected.flatMap(item=>{
    if(item.verified===false||(item.type!=='skin_type'&&!score(item.rawScore)))return [`<p role="status">${esc(PHOTO_LABELS[item.type])} · 결과 해석 확인 필요</p>`];
    if(item.type!=='skin_type'&&timeline.length>1&&buildPhotoTrend(timeline,item.type).hasUnmatched)return [`<p role="status">${esc(PHOTO_LABELS[item.type])} · 비교 조건 미확인</p>`];
    return [];
  });

  return `<div class="result-overview"><header class="result-heading"><h2 id="${esc(titleId)}" tabindex="-1">AI 분석 결과</h2><span>${esc(dateText)}</span></header>${localPhoto?`<figure class="result-portrait"><img src="${esc(localPhoto)}" alt="이번 분석에 사용한 내 사진"><figcaption>내 사진</figcaption></figure>`:''}<div class="result-overview-body"><div class="result-score-row">${score(summary.overallScore)?`<div><span class="result-eyebrow">종합 피부 점수</span><div class="result-total"><strong>${number(summary.overallScore)}</strong><span>/ 100</span></div></div>`:''}${Number.isFinite(summary.skinAge)?`<div class="result-age"><span>추정 피부 나이</span><strong>${number(summary.skinAge)}<small>세</small></strong></div>`:''}</div><div class="result-metrics">${cards.slice(0,8).join('')}</div>${cards.length>8?`<details class="result-more"><summary>나머지 ${cards.length-8}개 항목 보기 ${icon('chevron')}</summary><div class="result-metrics">${cards.slice(8).join('')}</div></details>`:''}${skin?`<div class="result-skin-type"><span>피부 타입</span>${skin.verified!==false&&SKIN_TYPE_REGIONS.every(region=>Object.hasOwn(SKIN_TYPE_LABELS,skin.skinTypes?.[region.key]))?SKIN_TYPE_REGIONS.map(region=>`<span><small>${region.label==='전체 얼굴'?'전체':region.label}</small> ${esc(SKIN_TYPE_LABELS[skin.skinTypes[region.key]])}</span>`).join(''):'<span>분류 확인 필요</span>'}</div>`:''}${thumbnails.length?`<div class="result-thumbnails" aria-label="분석 결과 썸네일">${thumbnails.map(item=>`<button type="button" class="result-thumbnail" data-photo="detail" data-photo-type="${item.type}" aria-label="${esc(PHOTO_LABELS[item.type])} 분석 이미지 자세히 보기"><img src="${esc(item.address)}" alt="${esc(PHOTO_LABELS[item.type])} 분석 표시" loading="lazy" referrerpolicy="no-referrer"><span>${esc(PHOTO_LABELS[item.type])}</span></button>`).join('')}</div>`:''}<p class="result-caption">사진 기반 참고값 · 점수를 눌러 자세히 보기</p></div>${warnings.length?`<div class="result-warning-list">${warnings.join('')}</div>`:''}</div>`;
}
