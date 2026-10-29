export const PHOTO_LABELS={
  redness:'붉게 보이는 부분',pore:'모공',texture:'피부결',acne:'여드름 관찰',
  moisture:'수분 관찰',oiliness:'유분 관찰',skin_type:'피부 타입',
  age_spot:'색소 반점',radiance:'광채',wrinkle:'주름',firmness:'탄력',
  dark_circle_v2:'다크서클',eye_bag:'눈밑 주머니',tear_trough:'눈물고랑',
  droopy_upper_eyelid:'위눈꺼풀 처짐',droopy_lower_eyelid:'아래눈꺼풀 처짐',
};
export const PHOTO_SIMPLE_LABELS=Object.freeze({
  ...PHOTO_LABELS,
  redness:'붉은기',acne:'트러블',moisture:'수분',oiliness:'유분',age_spot:'잡티',
});
export const PHOTO_GROUPS=[
  {label:'기본 피부 관찰',actions:['redness','pore','texture','acne']},
  {label:'유수분·피부 특성',actions:['moisture','oiliness','skin_type']},
  {label:'색·주름·탄력',actions:['age_spot','radiance','wrinkle','firmness']},
  {label:'눈 주변',actions:['dark_circle_v2','eye_bag','tear_trough','droopy_upper_eyelid','droopy_lower_eyelid']},
];
export const PHOTO_ACTIONS=Object.keys(PHOTO_LABELS);
export const DEFAULT_PHOTO_ACTIONS=['redness','pore','texture'];
export const PHOTO_CONSENT_VERSION='youcam-cross-border-consent-v3';

export function validatePhotoActions(value,maximum=16){
  if(!Array.isArray(value)||value.length<1||value.length>16||value.some(action=>typeof action!=='string'||!Object.hasOwn(PHOTO_LABELS,action))||new Set(value).size!==value.length)throw Error('분석 항목을 중복 없이 1개 이상 선택해 주세요.');
  if(value.length>maximum)throw Error(`현재는 최대 ${maximum}개까지 선택할 수 있어요.`);
  return PHOTO_ACTIONS.filter(action=>value.includes(action));
}

export function photoPriceBand(count){
  if(!Number.isInteger(count)||count<1||count>16)throw Error('분석 항목 수를 확인해 주세요.');
  return count<=4?{min:1,max:4,cap:9}:count<=8?{min:5,max:8,cap:12}:count<=12?{min:9,max:12,cap:14}:{min:13,max:16,cap:16};
}
