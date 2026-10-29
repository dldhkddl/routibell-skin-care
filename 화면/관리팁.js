import { PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { availableInventory } from './계획계산.js';
import { recommendationEntries } from './사진추천.js';

export const PHOTO_CARE_TIPS = Object.freeze({
  redness: {tips: ['뜨거운 물과 문지르기를 피해요.', '미온수로 붉은 부분을 순하게 씻어요.', '붉게 보인 날은 순하게 씻어요.'], kind: 'cleanser', source: 'https://www.aad.org/public/diseases/rosacea/triggers/tips'},
  pore: {tips: ['모공이 신경 쓰이면 순하게 씻어요.', '모공은 손으로 짜지 않아요.', '모공은 세게 문지르지 않아요.'], kind: 'cleanser', source: 'https://www.aad.org/public/everyday-care/skin-care-secrets/face/treat-large-pores'},
  texture: {tips: ['피부결은 보습 후 느낌을 봐요.', '거친 느낌엔 보습을 챙겨요.', '피부결은 세게 문지르지 않아요.'], kind: 'cream', source: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget'},
  acne: {tips: ['트러블 부위는 만지지 않아요.', '트러블은 세게 씻지 않아요.', '트러블이 보이면 순하게 씻어요.'], kind: 'cleanser', source: 'https://www.aad.org/public/diseases/acne/skin-care/tips'},
  moisture: {tips: ['세안 후 바로 보습해요.', '당김이 있으면 보습을 챙겨요.', '수분은 보습 후 느낌을 적어봐요.'], kind: 'cream', source: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget'},
  oiliness: {tips: ['번들거려도 보습은 챙겨요.', '유분은 세게 씻어내지 않아요.', '번들거린 시간대를 적어봐요.'], kind: 'cream', source: 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/oily-skin'},
  age_spot: {tips: ['잡티가 신경 쓰이면 선크림을 매일, 야외에서는 2시간마다 덧발라요.', '외출 전 선크림을 바르고 야외에서는 2시간마다 덧발라요.', '잡티가 신경 쓰이면 야외 활동 전 선크림부터 챙겨요.'], kind: 'sunscreen', source: 'https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen'},
  radiance: {tips: ['광채는 같은 조명에서 살펴봐요.', '광채는 보습 후 느낌을 적어봐요.', '광채 비교는 조명을 맞춰요.'], kind: 'cream', source: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget'},
  wrinkle: {tips: ['주름이 신경 쓰이면 선크림을 챙겨요.', '주름은 자외선 차단부터 챙겨요.', '주름은 같은 표정으로 다시 봐요.'], kind: 'sunscreen', source: 'https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/wrinkle-remedies'},
  firmness: {tips: ['탄력은 보습 루틴을 이어가요.', '탄력은 자외선 차단도 챙겨요.', '탄력은 같은 조건에서 살펴봐요.'], kind: 'cream', source: 'https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/wrinkle-remedies'},
  dark_circle_v2: {tips: ['눈 아래가 어두우면 수면도 적어봐요.', '건조한 눈가는 부드럽게 보습해요.', '다크서클은 같은 조명에서 봐요.'], kind: 'eyecream', source: 'https://my.clevelandclinic.org/health/symptoms/23128-dark-circles-under-eyes'},
  eye_bag: {tips: ['눈밑은 수면과 조명을 함께 봐요.', '눈밑을 세게 문지르지 않아요.', '눈밑은 같은 표정에서 비교해요.'], kind: 'eyecream', source: 'https://my.clevelandclinic.org/health/symptoms/23128-dark-circles-under-eyes'},
  tear_trough: {tips: ['눈물고랑은 같은 조명에서 봐요.', '눈가 그림자는 각도를 맞춰봐요.', '눈물고랑은 다음 사진과 비교해요.'], kind: null, source: 'https://www.aad.org/public/fad/digital-health/taking-pictures-skin'},
  droopy_upper_eyelid: {tips: ['위눈꺼풀은 같은 각도에서 봐요.', '위눈꺼풀은 표정을 맞춰봐요.', '위눈꺼풀은 다음 사진과 비교해요.'], kind: null, source: 'https://www.aad.org/public/fad/digital-health/taking-pictures-skin'},
  droopy_lower_eyelid: {tips: ['아래눈꺼풀은 같은 조명에서 봐요.', '아래눈꺼풀은 표정을 맞춰봐요.', '아래눈꺼풀은 각도를 기록해요.'], kind: null, source: 'https://www.aad.org/public/fad/digital-health/taking-pictures-skin'},
  skin_type: {tips: ['피부 타입은 직접 느낀 쪽을 알려주세요.', '피부 타입은 느낌부터 확인해요.', '세안 뒤 당김·유분을 적어봐요.'], kind: null, source: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget'},
});

const VANITY_LINES = {
  redness: ['내 화장대의 클렌저가 편안했는지 먼저 살펴봐요.', '내 화장대의 클렌저에 무향 표시가 있는지 확인해볼까요?', '내 화장대의 클렌저를 쓴 뒤 따가움이 없었는지 적어봐요.'],
  pore: ['내 화장대의 클렌저로 손끝 세안을 이어가 볼까요?', '내 화장대의 클렌저를 쓴 뒤 모공이 신경 쓰인 날을 적어봐요.', '내 화장대의 클렌저로 문지르지 않는 저녁 세안을 해봐요.'],
  texture: ['내 화장대의 보습제를 바른 뒤 피부결 느낌을 적어봐요.', '내 화장대의 보습제가 편안했는지 확인해볼까요?', '내 화장대의 보습제로 피부결 사용감을 먼저 살펴봐요.'],
  acne: ['내 화장대의 클렌저가 트러블 부위에 편안했는지 살펴봐요.', '내 화장대의 클렌저에 논코메도제닉 표시가 있는지 확인해볼까요?', '내 화장대의 클렌저를 쓴 날의 트러블 사용감을 적어봐요.'],
  moisture: ['내 화장대의 보습제를 바른 뒤 당김이 어땠는지 적어봐요.', '내 화장대의 보습제로 세안 후 보습을 이어가 볼까요?', '내 화장대의 보습제가 수분 관리에 편안했는지 살펴봐요.'],
  oiliness: ['내 화장대의 보습제를 쓴 뒤 번들거림이 어땠는지 적어봐요.', '내 화장대의 보습제의 유분 사용감을 살펴볼까요?', '내 화장대의 보습제가 번들거림 없이 편안했는지 확인해요.'],
  age_spot: ['내 화장대의 선크림을 아침에 챙기고 사용감을 적어봐요.', '내 화장대의 선크림에 자외선 차단 표시가 있는지 확인해요.', '내 화장대의 선크림을 야외 활동 전에 챙겨볼까요?'],
  radiance: ['내 화장대의 보습제를 쓴 날의 광채 인상을 적어봐요.', '내 화장대의 보습제를 바른 뒤 광채가 어떻게 보였는지 살펴봐요.', '내 화장대의 보습제를 쓴 날도 같은 빛에서 광채를 비교해요.'],
  wrinkle: ['내 화장대의 선크림을 아침에 챙겨볼까요?', '내 화장대의 선크림을 쓴 날의 기본 관리를 기록해요.', '내 화장대의 선크림을 아침 루틴에 이어가요.'],
  firmness: ['내 화장대의 보습제로 기본 루틴을 이어가 볼까요?', '내 화장대의 보습제를 쓴 날의 느낌을 적어봐요.', '내 화장대의 보습제를 새 제품보다 먼저 챙겨봐요.'],
  dark_circle_v2: ['내 화장대의 아이크림이 눈가에 편안했는지 확인해요.', '눈가가 건조할 때 내 화장대의 아이크림 사용감을 살펴봐요.', '내 화장대의 아이크림을 쓴 날의 눈가 느낌을 적어봐요.'],
  eye_bag: ['내 화장대의 아이크림을 쓴 날 눈밑 느낌을 적어봐요.', '내 화장대의 아이크림이 눈밑에 편안했는지 살펴봐요.', '눈밑을 문지르지 않고 내 화장대의 아이크림 사용감을 확인해요.'],
};

const NO_PRODUCT_LINES = {
  redness: '화장대에서 따갑지 않았던 클렌저가 있는지 확인해요.', pore: '화장대에서 순하게 쓰던 클렌저가 있는지 확인해요.',
  texture: '화장대에서 편안하게 쓰던 보습제가 있는지 확인해요.', acne: '화장대에서 편안하게 쓰던 클렌저가 있는지 확인해요.',
  moisture: '화장대에서 당김 없이 쓰던 보습제가 있는지 확인해요.', oiliness: '화장대에서 가볍게 쓰던 보습제가 있는지 확인해요.',
  age_spot: '화장대에 쓰던 선크림이 있는지 먼저 확인해요.', radiance: '화장대 제품을 늘리기 전에 보습 후 인상을 기록해요.',
  wrinkle: '화장대에 쓰던 선크림이 있는지 먼저 확인해요.', firmness: '화장대 제품을 늘리기 전에 보습 기록을 살펴봐요.',
  dark_circle_v2: '화장대 제품을 늘리기 전에 눈가 건조함을 기록해요.', eye_bag: '화장대 제품을 늘리기 전에 눈밑 느낌을 기록해요.',
  tear_trough: '화장대 제품을 더하기보다 눈가 촬영 조건을 맞춰봐요.', droopy_upper_eyelid: '화장대 제품을 더하기보다 위눈꺼풀 표정을 기록해요.',
  droopy_lower_eyelid: '화장대 제품을 더하기보다 아래눈꺼풀 촬영 각도를 기록해요.', skin_type: '화장대 제품을 바꾸기 전에 직접 느낀 상태를 남겨요.',
};

const hash = value => Array.from(value).reduce((number, character) => (number * 31 + character.codePointAt(0)) >>> 0, 0);

function tipChoice(type, data, asOf, result) {
  const history = recommendationEntries(data.skinCare, result?.completedAt ? result : null).filter(entry => entry.reference.date <= asOf);
  const scores = Object.fromEntries((result?.items ?? []).filter(item => Number.isFinite(item.rawScore)).map(item => [item.type, item.rawScore]));
  const currentIndex = result?.completedAt ? history.findIndex(entry => entry.completedAt === result.completedAt) :
    history.findLastIndex(entry => Object.entries(scores).every(([name, score]) => entry.reference.scores[name] === score));
  const index = currentIndex < 0 ? history.length - 1 : currentIndex;
  const firstScores = history[0]?.reference.scores ?? scores;
  const seed = hash(`${type}:${JSON.stringify(firstScores)}`);
  const count = history.slice(0, index + 1).filter(entry => entry.reference.actions?.includes(type) || type === 'skin_type' && entry.reference.skinTypes || Number.isFinite(entry.reference.scores[type])).length;
  return {seed, turn: Math.max(count - 1, 0)};
}

export function careTip(type, data, asOf, result = null) {
  const setting = PHOTO_CARE_TIPS[type];
  if (!setting) return null;
  const owned = setting.kind ? availableInventory(data, asOf).find(item => item.category === 'cosmetic' && item.kind === setting.kind && item.comfort === 'comfortable' && (!['cleanser','cream','sunscreen'].includes(item.kind) || data.skinCare?.selection?.[item.kind] === item.id)) : null;
  const {seed, turn} = tipChoice(type, data, asOf, result);
  const options = VANITY_LINES[type];
  const product = owned && options ? options[(Math.floor(seed / setting.tips.length) + turn) % options.length] : NO_PRODUCT_LINES[type];
  return {type, label: PHOTO_SIMPLE_LABELS[type], action: setting.tips[(seed + turn) % setting.tips.length], product, source: setting.source};
}

export function focusReminder(type, period) {
  if (['age_spot','radiance','wrinkle'].includes(type)) return period === 'morning' ? '오늘 아침 선크림 챙기셨나요?' : '오늘 저녁엔 선크림을 지우고 순하게 세안해요.';
  if (['moisture','texture','firmness'].includes(type)) return period === 'morning' ? '아침 보습부터 가볍게 챙겨볼까요?' : '오늘 저녁 보습제를 챙기고 사용감을 남겨요.';
  if (['redness','acne'].includes(type)) return period === 'morning' ? '오늘은 순하게 씻고 피부 느낌을 살펴봐요.' : '저녁엔 새 제품보다 순한 세안부터 챙겨요.';
  if (['dark_circle_v2','eye_bag','tear_trough','droopy_upper_eyelid','droopy_lower_eyelid'].includes(type)) return period === 'morning' ? '오늘 눈가가 어떤지 잠깐 살펴볼까요?' : '오늘은 눈가를 문지르지 말고 푹 쉬어요.';
  return period === 'morning' ? '오늘 아침 루틴 한 가지 챙겨볼까요?' : '오늘 저녁 루틴은 어떠셨나요?';
}
