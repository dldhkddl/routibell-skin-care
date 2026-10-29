const validScore=value=>Number.isFinite(value)&&value>=1&&value<=100;
const validAge=value=>Number.isFinite(value)&&value>=0&&value<=150;

export function normalizePhotoSummary(output) {
  const summary={};
  for(const [type,key,validate] of [['all','overallScore',validScore],['skin_age','skinAge',validAge]]) {
    const matches=output.filter(item=>item?.type===type);
    if(matches.length===1&&validate(matches[0].score))summary[key]=matches[0].score;
  }
  return Object.keys(summary).length?summary:null;
}

export function validatePhotoSummary(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(key=>!['overallScore','skinAge'].includes(key)))throw Error('사진 종합 참고값의 형식을 확인해 주세요.');
  if(Object.hasOwn(value,'overallScore')&&!validScore(value.overallScore)||Object.hasOwn(value,'skinAge')&&!validAge(value.skinAge))throw Error('사진 종합 점수·추정 피부 나이를 확인해 주세요.');
  return {...(Object.hasOwn(value,'overallScore')?{overallScore:value.overallScore}:{}),...(Object.hasOwn(value,'skinAge')?{skinAge:value.skinAge}:{})};
}

export function renderPhotoSummary(value) {
  if(!value)return '';
  let summary;
  try{summary=validatePhotoSummary(value);}catch{return '';}
  const number=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(value);
  return `<section class="photo-summary" aria-label="유캠 종합 참고값"><div class="photo-summary-values">${Object.hasOwn(summary,'overallScore')?`<div><span>유캠 종합 점수</span><strong>${number(summary.overallScore)}<small>점</small></strong></div>`:''}${Object.hasOwn(summary,'skinAge')?`<div><span>추정 피부 나이</span><strong>${number(summary.skinAge)}<small>세</small></strong></div>`:''}</div><p>유캠이 제공한 사진 기반 참고값이에요. 실제 나이·건강 상태를 판정하지 않아요.</p></section>`;
}
