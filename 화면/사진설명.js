import { PHOTO_ACTIONS, PHOTO_LABELS, PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { FEELS, CONCERNS, FEEDBACK } from './피부계산.js';
import { today } from './계산.js';
import { careTip } from './관리팁.js';
import { recommendPhoto } from './사진추천.js';
import { RECOMMENDATION_SETTINGS, STRATEGY } from './추천전략설정.js';
import { SKIN_TYPE_LABELS } from './피부타입.js';
import { withParticle } from './조사.js';

export const PHOTO_COPY = {
  redness:{meaning:'사진에서 붉게 보이는 특징을 살펴본 항목이에요.',question:'제품 사용 후 불편함이 있었나요?',action:'오늘 사용감과 불편함 유무를 기록해요.',concern:'redness'},
  pore:{meaning:'사진에서 모공이 보이는 특징을 살펴본 항목이에요.',question:'세안 후 피부 느낌은 어떤가요?',action:'세안 방법을 바꾸기 전에 지금의 세안 후 느낌부터 기록해요.',concern:'pore'},
  texture:{meaning:'사진에 나타난 피부결을 살펴본 항목이에요.',question:'직접 느끼기에도 피부결이 거친가요?',action:'거친 느낌이 있는 날을 기록하고 기본 관리 실천을 확인해요.',concern:'texture'},
  acne:{meaning:'사진의 여드름 관련 시각적 특징을 살펴본 항목이에요.',question:'오늘 제품 사용 후 편안했나요?',action:'새 제품을 추가하기 전에 오늘 쓴 제품과 사용감을 남겨요.',concern:'acne'},
  moisture:{meaning:'사진으로 추정한 수분 관련 참고값이에요.',question:'세안 후 당기는 느낌이 있나요?',action:'보습제 사용 여부와 사용 후 느낌을 함께 기록해요.',concern:'dryness'},
  oiliness:{meaning:'사진에 나타난 유분 관련 특징을 살펴본 항목이에요.',question:'평소 번들거림이 신경 쓰이나요?',action:'번들거림이 신경 쓰인 때와 사용 제품을 기록해요.',concern:'oil'},
  skin_type:{meaning:'피부 타입은 숫자 점수가 아닌 분류형 항목이에요.',question:'당김·번들거림 중 직접 느끼는 쪽이 있나요?',action:'사진의 타입을 대신 입력하지 않고 직접 느낀 피부 상태를 남겨요.'},
  age_spot:{meaning:'사진에서 색소 반점처럼 보이는 특징을 살펴본 항목이에요.',question:'평소에도 같은 부분이 눈에 띄나요?',action:'신경 쓰인 부분을 메모하고 기존 자외선 차단 루틴을 확인해요.',concern:'pigment'},
  radiance:{meaning:'사진에 나타난 광채 관련 특징을 살펴본 항목이에요.',question:'평소에도 칙칙해 보이는 인상이 고민인가요?',action:'조명이 달랐는지 확인하고 평소 느끼는 인상을 기록해요.',concern:'dullness'},
  wrinkle:{meaning:'사진에서 주름처럼 보이는 선을 살펴본 항목이에요.',question:'표정을 편하게 했을 때도 신경 쓰이나요?',action:'표정과 조명 조건을 메모하고 기존 기본 관리를 확인해요.'},
  firmness:{meaning:'사진으로 추정한 탄력 관련 참고값이에요.',question:'평소에도 탄력이 관심 항목인가요?',action:'관심 항목을 메모하고 지금 하는 기본 관리부터 확인해요.'},
  dark_circle_v2:{meaning:'사진에서 눈 아래 어둡게 보이는 특징을 살펴본 항목이에요.',question:'평소에도 눈 아래가 어둡게 보이나요?',action:'그림자와 화장 여부를 확인하고 평소와 다른 점을 메모해요.'},
  eye_bag:{meaning:'사진에서 눈밑 주머니처럼 보이는 특징을 살펴본 항목이에요.',question:'평소와 비교해 다르게 보이는 부분이 있나요?',action:'평소와 다른 점을 메모하고 사진만으로 제품을 더하지 않아요.'},
  tear_trough:{meaning:'사진에서 눈물고랑처럼 보이는 특징을 살펴본 항목이에요.',question:'조명을 바꾸면 보이는 인상이 달라지나요?',action:'사진의 조명·각도를 메모하고 관심 부분을 기록해요.'},
  droopy_upper_eyelid:{meaning:'사진에서 위눈꺼풀 모양의 특징을 살펴본 항목이에요.',question:'촬영 때 눈을 평소처럼 편하게 뜨셨나요?',action:'촬영 당시 표정을 메모하고 사진만으로 시술을 선택하지 않아요.'},
  droopy_lower_eyelid:{meaning:'사진에서 아래눈꺼풀 모양의 특징을 살펴본 항목이에요.',question:'평소와 다른 표정으로 촬영했나요?',action:'표정·각도를 기록하고 평소와 다른 점을 남겨요.'},
};

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const numeric=value=>Number.isFinite(value)&&value>=1&&value<=100;

export function buildPhotoGuidance(result,data,asOf=today(),strategy=STRATEGY){
  const care=data.skinCare??{};
  const profile=care.profile?.updatedAt<=asOf?care.profile:null;
  const latest=(care.checkins??[]).filter(entry=>entry.date<=asOf).sort((first,second)=>first.date.localeCompare(second.date)).at(-1);
  const feedback=profile&&latest?.date>=profile.updatedAt?latest:null;
  const paused=profile?.discomfort==='yes'||feedback?.feeling==='uncomfortable';
  const unknown=!profile;
  const uncertainDiscomfort=profile?.discomfort==='unsure'&&feedback?.feeling!=='comfortable';
  const cautious=profile&&(profile.sensitivity!=='rare'||uncertainDiscomfort);
  const recommendation=recommendPhoto({...care,profile},result?.items?result:null,{asOf,strategy});
  const focus=new Set(recommendation?.focused??[]);
  const entries=PHOTO_ACTIONS.filter(type=>result.items?.some(item=>item.type===type)).map(type=>{
    const matches=result.items.filter(item=>item.type===type),item=matches[0],copy=PHOTO_COPY[type],tip=careTip(type,data,asOf,result);
    const failed=matches.length!==1||item.verified===false||(type!=='skin_type'&&!numeric(item.rawScore));
    const rating=recommendation?.items.find(value=>value.type===type);
    let mode='record',action=copy.action;
    if(paused){mode='pause';action='새 관리보다 불편했던 제품·사용감을 먼저 기록해요.';}
    else if(failed){mode='unavailable';action='확인 가능한 이미지만 살펴봐요. 이 결과로 관리 단계를 바꾸지 않아요.';}
    else if(unknown||type==='skin_type'&&profile.feel==='unsure'){mode='question';action=copy.action;}
    else if(focus.has(type)){
      mode='focus';
      action=tip.action;
    }
    return {type,label:PHOTO_LABELS[type],meaning:copy.meaning,mode,action,tip,band:rating?.band??null,change:rating?.change??null,failed,score:failed||type==='skin_type'?null:item.rawScore,
      limitation:failed?'결과 해석 확인 필요 · 점수 기반 제안·저장 보류':type==='skin_type'?(item.skinTypes?'사진 기반 분류 참고값 · 숫자 비교 제외':'이전 관찰에는 영역별 분류가 저장되지 않았어요.'):null};
  });
  const focused=(recommendation?.focused??[]).map(type=>entries.find(entry=>entry.type===type&&entry.mode==='focus')).filter(Boolean);
  const failed=entries.filter(entry=>entry.failed);
  const question=entries.find(entry=>entry.type==='skin_type'&&entry.mode==='question'&&profile)??entries.find(entry=>entry.type==='moisture'&&entry.mode==='question')??entries.find(entry=>entry.mode==='question');
  const skinTypeQuestion=profile?.feel==='unsure'&&recommendation?.skinTypes?.t_zone ? `사진에선 T존 ${SKIN_TYPE_LABELS[recommendation.skinTypes.t_zone]} 경향이에요. 직접 느끼기에도 그런가요?` : null;
  let title='새 단계보다 기존 관리와 사용감을 기록해요.';
  let action='오늘 실천한 관리와 사용감을 남겨 주세요.';
  let product=null;
  if(paused){title='새 관리보다 불편함 확인이 먼저예요.';action=entries.some(entry=>['redness','acne'].includes(entry.type)&&entry.band==='신경 쓸 만함')?'붉은기·트러블 결과와 불편함이 함께 있네요. 피부과 상담도 고려해요.':'불편했던 제품·사용감을 기록하고, 불편함이 지속되면 전문가와 상담해요.';}
  else if(question&&unknown){title='맞춤 제안 전에 한 가지만 알려주세요.';action=question.type==='skin_type'?PHOTO_COPY.skin_type.question:question.type==='moisture'?PHOTO_COPY.moisture.question:question.type==='redness'?PHOTO_COPY.redness.question:question.type==='pore'?PHOTO_COPY.pore.question:question.type==='acne'?PHOTO_COPY.acne.question:PHOTO_COPY.skin_type.question;}
  else if(entries.length&&failed.length===entries.length){title='이미지를 확인하고 피부 느낌을 직접 남겨요.';action='결과 해석이 확인되지 않아 사진 점수로 관리 계획을 바꾸지 않아요.';}
  else if(focused.length){const first=focused[0];title=first.type==='moisture'?'이번에는 보습 루틴부터 점검해요.':`이번에는 ${first.label}부터 챙겨봐요.`;action=first.action;product=first.tip.product;}
  else if(skinTypeQuestion){title='피부 타입은 직접 느끼는 쪽을 알려주세요.';action=skinTypeQuestion;}
  const evidence=[];
  if(profile){evidence.push(`${profile.updatedAt} 직접 입력: ${FEELS[profile.feel]}`);if(profile.concerns.length)evidence.push(`직접 선택한 고민: ${profile.concerns.map(concern=>CONCERNS[concern]).join(' · ')}`);}
  else evidence.push('저장된 피부 상태 답변 없음');
  if(feedback)evidence.push(`${feedback.date} 사용감: ${FEEDBACK[feedback.feeling]}`);
  if(paused)evidence.push('직접 입력한 불편함을 사진 점수보다 우선했어요.');
  else if(cautious)evidence.push('새 제품·단계는 늘리지 않고 기존 루틴의 사용감부터 확인해요.');
  const graduated=recommendation?.graduated[0];
  const returned=recommendation?.returned[0];
  const praise=recommendation?.praise?`${withParticle(PHOTO_SIMPLE_LABELS[recommendation.praise],'은/는')} 좋게 나왔어요.`:null;
  const nextFocus=recommendation?.focused.find(type=>type!==graduated?.type);
  const graduationLine=graduated?`${PHOTO_SIMPLE_LABELS[graduated.type]} 점수가 ${graduated.difference!==null&&graduated.difference>0?`지난번보다 ${graduated.difference.toFixed(1)}점 높아요.`:'좋음 구간에 들어왔어요.'} ${nextFocus?`이번엔 ${PHOTO_SIMPLE_LABELS[nextFocus]}도 챙겨볼까요?`:'기본 루틴은 그대로 이어가요.'}`:null;
  const returnLine=returned?`${withParticle(PHOTO_SIMPLE_LABELS[returned],'을/를')} 다시 신경 써볼까요?`:null;
  const summary=recommendation?.summary;
  const summaryLine=summary?`${Number.isFinite(summary.overallScore)?`종합 ${summary.overallScore.toFixed(1)}점`:''}${Number.isFinite(summary.overallScore)&&Number.isFinite(summary.skinAge)?' · ':''}${Number.isFinite(summary.skinAge)?`추정 피부 나이 ${summary.skinAge}세`:''} · 사진 참고값이에요.`:null;
  const nextDate=recommendation?.date ? new Date(`${recommendation.date}T12:00:00Z`) : null;
  if(nextDate)nextDate.setUTCDate(nextDate.getUTCDate()+RECOMMENDATION_SETTINGS.nextAnalysisDays[0]);
  return {asOf,title,action,product,actionType:product?focused[0]?.type:null,entries,focused:focused.map(entry=>entry.type),paused,cautious,question:Boolean(question&&unknown||skinTypeQuestion),evidence,recommendation,praise,graduationLine,returnLine,summaryLine,skinTypeQuestion,
    nextAnalysis:nextDate?`${nextDate.toISOString().slice(0,10)}부터 2~4주 안에 같은 조명에서 다시 살펴볼까요?`:null,
    alert:[failed.length?`${failed.map(entry=>entry.label).join(' · ')}: 결과 해석 확인 필요. 정상 이미지는 볼 수 있지만 이번 관찰 저장은 보류해요.`:null,paused?'현재 불편함이 있어 새 관리 단계는 제안하지 않아요.':null,recommendation?.comparisonWarning].filter(Boolean).join(' ')||null,
    followup:uncertainDiscomfort&&!paused?'제품 사용 후 불편함이 있나요?':null,
    target:!profile||question||uncertainDiscomfort&&!paused?'care':'records'};
}

export function guidanceFromReference(reference){
  return {items:Object.entries(reference.scores).map(([type,rawScore])=>({type,rawScore,...(type==='skin_type'&&reference.skinTypes?{skinTypes:reference.skinTypes}:{})}))};
}

export function renderPhotoGuidance(guidance,{title='지금 할 일',links=true}={}){
return `<section class="photo-guidance"><h3>${esc(guidance.followup??guidance.action)}</h3>${guidance.product&&!guidance.followup?`<p>${esc(guidance.product)}</p>`:''}${!guidance.product&&(guidance.graduationLine||guidance.returnLine||guidance.praise)?`<p>${esc(guidance.graduationLine??guidance.returnLine??guidance.praise)}</p>`:''}${guidance.entries.filter(entry=>entry.failed).map(entry=>`<p class="guidance-alert" role="status">${esc(PHOTO_SIMPLE_LABELS[entry.type])} · 결과 해석 확인 필요</p>`).join('')}${guidance.paused?'<p class="guidance-alert" role="status">불편함 기록 · 새 관리를 제안하지 않아요.</p>':''}${guidance.recommendation?.comparisonWarning?`<p class="guidance-alert" role="status">${esc(guidance.recommendation.comparisonWarning)}</p>`:''}<details><summary>왜 이렇게 제안했나요?</summary><p>${esc(guidance.title)}</p>${guidance.product&&(guidance.graduationLine||guidance.returnLine||guidance.praise)?`<p>${esc(guidance.graduationLine??guidance.returnLine??guidance.praise)}</p>`:''}${guidance.summaryLine?`<p>${esc(guidance.summaryLine)}</p>`:''}${guidance.skinTypeQuestion?`<p>${esc(guidance.skinTypeQuestion)}</p>`:''}${guidance.nextAnalysis?`<p>${esc(guidance.nextAnalysis)}</p>`:''}${guidance.recommendation?.maintained.length?`<p>유지하기 · ${guidance.recommendation.maintained.map(type=>esc(PHOTO_SIMPLE_LABELS[type])).join(' · ')}. 기존 기본 루틴을 이어가요.</p>`:''}<p class="guidance-source">직접 알려주신 것 · ${esc(guidance.evidence[0])}</p><ul>${guidance.evidence.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p>사진 점수는 임시 기준으로 고른 관심 항목이에요. 직접 남긴 불편함·느낌을 우선하고, 점수만으로 피부 상태나 제품 효과를 판단하지 않아요.</p><p>촬영 조건·분석 버전이 같은 기록만 수치 차이를 참고해요. 숫자 차이는 의료 진단이나 실제 개선 판정이 아니에요.</p><a href="https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget" target="_blank" rel="noopener noreferrer">기본 관리 참고 · AAD</a></details>${links?`<button type="button" class="text-link" data-guidance-target="${guidance.target}" data-guidance-field="${guidance.followup?'discomfort':'feel'}">${guidance.target==='care'?(guidance.followup?'불편함 여부 답하기':'피부 느낌 답하기'):'오늘 사용감 기록하기'}</button>`:''}</section>`;
}

export function renderPhotoItemGuidance(entry){
  const badges={focus:'집중 항목',record:'기록 이어가기',question:'느낌 확인',pause:'불편함 우선',unavailable:'확인 필요'};
  return `<details class="photo-item-guidance card-details"><summary>자세히 보기 · 관리 방법</summary><div><p class="guidance-source">사진으로 본 것 · ${esc(entry.meaning)}</p>${entry.limitation?`<p class="guidance-alert">${esc(entry.limitation)}</p>`:''}${entry.band?`<p>임시 기준 · ${esc(entry.band)}${entry.change?` · ${esc(entry.change)}`:''}</p>`:''}<p><span class="small-badge">${badges[entry.mode]}</span> 기록 안내 · ${esc(PHOTO_COPY[entry.type].action)}</p>${entry.tip?`<p>일반 관리 팁 · ${esc(entry.tip.action)}</p>${entry.tip.product?`<p>${esc(entry.tip.product)}</p>`:''}<a href="${esc(entry.tip.source)}" target="_blank" rel="noopener noreferrer">관리 팁 참고 자료 ↗</a>`:''}</div></details>`;
}
