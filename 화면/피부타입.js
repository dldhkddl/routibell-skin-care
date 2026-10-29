export const SKIN_TYPE_REGIONS = [
  {key:'whole',label:'전체 얼굴'},
  {key:'t_zone',label:'T존'},
  {key:'u_zone',label:'U존'},
];

export const SKIN_TYPE_LABELS = {
  Normal:'보통',
  Oily:'유분형',
  Dry:'건조형',
  Combination:'복합형',
  Redness:'붉게 보임',
  'Dry & Redness':'건조형 · 붉게 보임',
  'Oily & Redness':'유분형 · 붉게 보임',
  'Combination & Redness':'복합형 · 붉게 보임',
};

export function validateSkinTypes(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==SKIN_TYPE_REGIONS.length||SKIN_TYPE_REGIONS.some(({key})=>!Object.hasOwn(value,key)||!Object.hasOwn(SKIN_TYPE_LABELS,value[key])))throw Error('피부 타입의 전체·T존·U존 분류를 확인해 주세요.');
  return Object.fromEntries(SKIN_TYPE_REGIONS.map(({key})=>[key,value[key]]));
}
