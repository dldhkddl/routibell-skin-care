import { PHOTO_ACTIONS, PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { photoHistory } from './사진이력.js';
import { RECOMMENDATION_SETTINGS, STRATEGY } from './추천전략설정.js';

const numeric = value => Number.isFinite(value) && value >= 1 && value <= 100;
const directConcerns = {
  dryness: ['moisture'], oil: ['oiliness'], texture: ['texture'], dullness: ['radiance'],
  pore: ['pore'], redness: ['redness'], acne: ['acne'], pigment: ['age_spot'],
  wrinkle: ['wrinkle'], firmness: ['firmness'], aging: ['wrinkle', 'firmness'], eye: ['dark_circle_v2', 'eye_bag', 'tear_trough', 'droopy_upper_eyelid', 'droopy_lower_eyelid'],
};
const priority = type => ['redness', 'acne'].includes(type) ? 0 : type === 'moisture' ? 1 : 2;
const order = type => PHOTO_ACTIONS.indexOf(type);

export function recommendationEntries(care, result = null) {
  const entries = photoHistory(care);
  if (!result?.items || entries.some(entry => entry.completedAt === result.completedAt)) return entries;
  const date = new Date(result.completedAt);
  if (!Number.isFinite(date.getTime())) return entries;
  const reference = {
    provider: result.provider, version: result.version,
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    scores: Object.fromEntries(result.items.filter(item => item.verified !== false && item.type !== 'skin_type' && numeric(item.rawScore)).map(item => [item.type, item.rawScore])),
    ...(result.summary ? {summary: result.summary} : {}),
    ...(result.items.find(item => item.type === 'skin_type' && item.verified !== false)?.skinTypes ? {skinTypes: result.items.find(item => item.type === 'skin_type').skinTypes} : {}),
  };
  return [...entries, {id: 'current-result', completedAt: result.completedAt, reference, condition: 'unknown', baselineId: null}]
    .sort((first, second) => first.reference.date.localeCompare(second.reference.date) || (first.completedAt ?? '').localeCompare(second.completedAt ?? ''));
}

export function evaluatePhotoRecommendation(entries, {profile = null, strategy = STRATEGY, settings = RECOMMENDATION_SETTINGS} = {}) {
  if (!['A', 'B'].includes(strategy)) throw Error('추천 전략을 확인해 주세요.');
  let previous = null;
  let focused = [];
  const graduated = new Set();
  const streak = new Map();
  const events = [];
  let latest = null;
  for (const entry of entries) {
    const scores = entry.reference.scores;
    const direct = new Set((profile?.concerns ?? []).flatMap(concern => directConcerns[concern] ?? []));
    if (profile?.feel === 'dry') direct.add('moisture');
    if (['oily', 'combination'].includes(profile?.feel)) direct.add('oiliness');
    const comparable = Boolean(previous && entry.condition === 'matched' && entry.baselineId === previous.id && entry.reference.date !== previous.reference.date && entry.reference.provider === previous.reference.provider && entry.reference.version === previous.reference.version);
    const items = PHOTO_ACTIONS.filter(type => type !== 'skin_type' && numeric(scores[type]) && settings.bands[type]).map(type => {
      const score = scores[type];
      const bands = settings.bands[type];
      const band = score < bands.attention ? '신경 쓸 만함' : score >= bands.good ? '좋음' : '보통';
      const before = previous?.reference.scores[type];
      const difference = comparable && numeric(before) ? Math.round((score - before) * 10) / 10 : null;
      const change = difference === null ? null : Math.abs(difference) <= settings.changeMargin ? '비슷해요' : difference > 0 ? '점수가 올랐어요' : '점수가 내려갔어요';
      return {type, label: PHOTO_SIMPLE_LABELS[type], score, band, difference, change, direct: direct.has(type)};
    });
    const byType = new Map(items.map(item => [item.type, item]));
    const graduatedNow = [];
    const returnedNow = [];
    for (const type of focused) {
      const item = byType.get(type);
      if (!item || item.direct) continue;
      const qualifies = comparable && item.change !== '점수가 내려갔어요' && (item.band === '좋음' || item.difference !== null && item.difference >= settings.graduationRise);
      const count = qualifies ? (streak.get(type) ?? 0) + 1 : 0;
      streak.set(type, count);
      if (count >= settings.graduationStreak) {
        graduated.add(type);
        graduatedNow.push({type, difference: item.difference});
        events.push({date: entry.reference.date, type, action: 'graduated', difference: item.difference});
        streak.delete(type);
      }
    }
    for (const type of [...graduated]) {
      if (graduatedNow.some(item => item.type === type)) continue;
      const item = byType.get(type);
      if (comparable && item && (item.band === '신경 쓸 만함' || item.change === '점수가 내려갔어요')) {
        graduated.delete(type);
        returnedNow.push(type);
        events.push({date: entry.reference.date, type, action: 'returned', difference: item.difference});
      }
    }
    const candidates = items.filter(item => !graduated.has(item.type) && (item.direct || streak.get(item.type) > 0 || previous && !comparable && focused.includes(item.type) || (strategy === 'A' ? item.band === '신경 쓸 만함' : item.band !== '좋음') || item.change === '점수가 내려갔어요'));
    const rank = item => priority(item.type) === 0 && item.band === '신경 쓸 만함' ? 0 : priority(item.type) === 1 && item.band === '신경 쓸 만함' ? 1 : item.change === '점수가 내려갔어요' ? 2 : priority(item.type) === 0 ? 3 : priority(item.type) === 1 ? 4 : 5;
    candidates.sort((first, second) => Number(second.direct) - Number(first.direct) || rank(first) - rank(second) || (comparable ? (first.difference ?? 0) - (second.difference ?? 0) : 0) || first.score - second.score || order(first.type) - order(second.type));
    const next = candidates.slice(0, 2).map(item => item.type);
    if (previous && next.join(',') !== focused.join(',')) events.push({date: entry.reference.date, type: next[0] ?? null, action: 'transition', from: [...focused], to: [...next]});
    focused = next;
    latest = {strategy, items, focused: [...focused], graduated: graduatedNow, returned: returnedNow,
      maintained: [...graduated], comparable, previousDate: previous?.reference.date ?? null,
      comparisonWarning: previous && !comparable ? '촬영 조건·분석 버전이 달라 비교가 정확하지 않을 수 있어요.' : null,
      praise: items.find(item => item.band === '좋음' && !focused.includes(item.type))?.type ?? null,
      summary: entry.reference.summary ?? null, skinTypes: entry.reference.skinTypes ?? null,
      date: entry.reference.date, events: [...events]};
    previous = entry;
  }
  return latest;
}

export function recommendPhoto(care, result = null, options = {}) {
  const {asOf, ...settings} = options;
  const entries = recommendationEntries(care, result).filter(entry => !asOf || entry.reference.date <= asOf);
  return evaluatePhotoRecommendation(entries, {profile: !asOf || care?.profile?.updatedAt <= asOf ? care?.profile : null, ...settings});
}
