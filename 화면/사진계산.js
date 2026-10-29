import { PHOTO_LABELS, PHOTO_ACTIONS, DEFAULT_PHOTO_ACTIONS, validatePhotoActions } from './사진항목.js';
import { validateSkinTypes } from './피부타입.js';
import { validatePhotoSummary } from './사진요약.js';
export { PHOTO_LABELS } from './사진항목.js';
export const PHOTO_NOTES = {
  ...Object.fromEntries(PHOTO_ACTIONS.map(action=>[action,'사진의 관찰값은 직접 측정하거나 진단한 결과가 아니에요. 직접 입력한 느낌·불편함과 보유 제품의 사용 경험을 함께 살펴봐요.'])),
  redness: '사진의 색상 표시만으로 자극·염증·민감성을 판단하지 않아요. 실제 따가움·불편함 답변을 우선해요.',
  pore: '사진의 모공 표시만 보고 세안 횟수·각질 제거·구매를 늘리지 않아요. 가진 제품의 사용감부터 확인해요.',
  texture: '사진의 피부결과 직접 느끼는 거친 느낌은 다를 수 있어요. 당김 여부와 보유 보습제 사용감을 함께 기록해요.',
  skin_type:'피부 타입은 결과 이미지를 참고하며 숫자로 저장·비교하지 않아요. 직접 입력한 피부 느낌을 대신하지 않아요.',
};

export function validatePhotoReference(value) {
  const fail = () => { throw Error('사진 관찰 참고값의 형식·날짜·항목을 확인해 주세요.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['date,focus,provider,scores,version','actions,date,focus,provider,scores,version','date,focus,provider,scores,skinTypes,version','actions,date,focus,provider,scores,skinTypes,version'].includes(Object.keys(value).filter(key=>key!=='summary').sort().join(','))) fail();
  if (value.provider !== 'youcam' || value.version !== 'v2.1' || !Object.hasOwn(PHOTO_LABELS, value.focus)) fail();
  if (typeof value.date !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value.date)) fail();
  const date = new Date(`${value.date}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getMonth() + 1 !== Number(value.date.slice(5, 7)) || date > new Date()) fail();
  const actions=Object.hasOwn(value,'actions')?validatePhotoActions(value.actions):DEFAULT_PHOTO_ACTIONS;
  if(!actions.includes(value.focus)||!value.scores||Array.isArray(value.scores)||Object.keys(value.scores).sort().join(',')!==[...actions].sort().join(','))fail();
  if(actions.some(action=>action==='skin_type'?value.scores[action]!==null:!Number.isFinite(value.scores[action])||value.scores[action]<1||value.scores[action]>100))fail();
  if(Object.hasOwn(value,'skinTypes')&&!actions.includes('skin_type'))fail();
  const skinTypes=Object.hasOwn(value,'skinTypes')?validateSkinTypes(value.skinTypes):null;
  const summary=Object.hasOwn(value,'summary')?validatePhotoSummary(value.summary):null;
  return { provider: 'youcam', version: 'v2.1', date: value.date, focus: value.focus, scores: { ...value.scores },...(Object.hasOwn(value,'actions')?{actions:[...actions]}:{}),...(skinTypes?{skinTypes}:{}),...(summary?{summary}:{}) };
}

export function photoReference(result, focus) {
  if(result?.items?.some(item=>item.verified===false))throw Error('확인되지 않은 항목이 있어 기록 저장은 보류해요. 표시된 이미지는 확인할 수 있어요.');
  if (result?.provider !== 'youcam' || result.version !== 'v2.1' || !Array.isArray(result.items)) throw Error('완료된 분석 결과가 필요해요.');
  const actions=Object.hasOwn(result,'actions')?validatePhotoActions(result.actions):DEFAULT_PHOTO_ACTIONS;
  if(result.items.length!==actions.length||new Set(result.items.map(item=>item.type)).size!==actions.length||result.items.some(item=>!actions.includes(item.type)))throw Error('선택한 항목의 완료 결과가 모두 필요해요.');
  const skinTypes=actions.includes('skin_type')?validateSkinTypes(result.items.find(item=>item.type==='skin_type')?.skinTypes):null;
  const completed = new Date(result.completedAt);
  if (Number.isNaN(completed.getTime())) throw Error('분석 완료 날짜를 확인해 주세요.');
  const date = `${completed.getFullYear()}-${String(completed.getMonth()+1).padStart(2,'0')}-${String(completed.getDate()).padStart(2,'0')}`;
  return validatePhotoReference({ provider: result.provider, version: result.version, date, focus, scores: Object.fromEntries(result.items.map(item => [item.type, item.rawScore])),...(Object.hasOwn(result,'actions')?{actions}: {}),...(skinTypes?{skinTypes}:{}),...(Object.hasOwn(result,'summary')?{summary:result.summary}:{}) });
}

export function photoResultUrl(value) {
  if(typeof value==='string'&&value.length<=2_700_000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'yce-us.s3-accelerate.amazonaws.com' || url.port || url.username || url.password || url.hash || url.href.length > 8192) throw Error('결과 이미지 주소를 확인하지 못했어요. 분석을 다시 실행하지 마세요.');
  return url.href;
}
