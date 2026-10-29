import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePhotoRecommendation, recommendationEntries } from '../화면/사진추천.js';
import { RECOMMENDATION_SETTINGS, STRATEGY } from '../화면/추천전략설정.js';
import { EMPTY } from '../화면/계산.js';
import { renderRealReport } from '../화면/실제리포트.js';
import { renderPhotoComparison } from '../화면/사진그래프.js';

const entry = (id, date, scores, previous = null) => ({
  id, completedAt: `${date}T10:00:00.000Z`, reference: {date, provider: 'youcam', version: 'v2.1', scores},
  condition: previous ? 'matched' : 'unknown', baselineId: previous,
});

test('기본 전략은 A이고 항목마다 임시 기준을 한 곳에서 관리한다', () => {
  assert.equal(STRATEGY, 'A');
  assert.equal(Object.keys(RECOMMENDATION_SETTINGS.bands).length, 15);
  assert.ok(RECOMMENDATION_SETTINGS.bands.pore.attention < RECOMMENDATION_SETTINGS.bands.pore.good);
});

test('같은 결과라도 고정 구간과 내 피부 기준의 집중 항목은 달라진다', () => {
  const entries = [entry('one', '2026-09-20', {pore: 55, moisture: 69, redness: 91})];
  assert.deepEqual(evaluatePhotoRecommendation(entries, {strategy: 'A'}).focused, []);
  assert.deepEqual(evaluatePhotoRecommendation(entries, {strategy: 'B'}).focused, ['moisture', 'pore']);
  assert.throws(() => evaluatePhotoRecommendation(entries, {strategy: 'C'}));
});

test('같은 조건의 3점 이하는 비슷하다고 하고 불일치면 차이로 졸업시키지 않는다', () => {
  const first = entry('one', '2026-09-20', {pore: 35});
  const matched = entry('two', '2026-09-27', {pore: 37}, 'one');
  assert.equal(evaluatePhotoRecommendation([first, matched]).items[0].change, '비슷해요');
  const unmatched = {...matched, reference: {...matched.reference, scores: {pore: 70}}, condition: 'unknown'};
  const result = evaluatePhotoRecommendation([first, unmatched]);
  assert.equal(result.items[0].difference, null);
  assert.equal(result.graduated.length, 0);
  assert.match(result.comparisonWarning, /비교가 정확하지/);
  const high = {...matched, reference: {...matched.reference, scores: {pore: 88}}, condition: 'unknown'};
  assert.equal(evaluatePhotoRecommendation([first, high]).graduated.length, 0);
  assert.deepEqual(evaluatePhotoRecommendation([first, high]).focused, ['pore']);
  assert.match(renderPhotoComparison([first, matched]), /비슷해요/);
});

test('상승 졸업, 유지, 다시 하락하면 복귀하며 전환 이력을 재계산한다', () => {
  const observations = [
    entry('one', '2026-09-01', {pore: 30, moisture: 43}),
    entry('two', '2026-09-08', {pore: 42, moisture: 42}, 'one'),
    entry('three', '2026-09-15', {pore: 33, moisture: 41}, 'two'),
  ];
  const graduate = evaluatePhotoRecommendation(observations.slice(0, 2));
  assert.ok(graduate.graduated.some(item => item.type === 'pore'));
  assert.ok(graduate.maintained.includes('pore'));
  assert.ok(graduate.events.some(item => item.action === 'transition'));
  const returned = evaluatePhotoRecommendation(observations);
  assert.ok(returned.returned.includes('pore'));
  assert.ok(returned.focused.includes('pore'));
  assert.ok(returned.events.some(item => item.action === 'returned'));
});

test('연속 N회와 직접 남긴 고민은 점수 한 번만으로 졸업시키지 않는다', () => {
  const settings = {...RECOMMENDATION_SETTINGS, graduationStreak: 2};
  const observations = [entry('one', '2026-09-01', {pore: 30}), entry('two', '2026-09-08', {pore: 85}, 'one'), entry('three', '2026-09-15', {pore: 88}, 'two')];
  assert.deepEqual(evaluatePhotoRecommendation(observations.slice(0, 2), {settings}).graduated, []);
  assert.ok(evaluatePhotoRecommendation(observations, {settings}).graduated.some(item => item.type === 'pore'));
  assert.deepEqual(evaluatePhotoRecommendation(observations, {profile: {concerns: ['pore']}}).graduated, []);
});

test('분석 결과의 유효한 숫자만 임시 평가하고 원본 기록은 바꾸지 않는다', () => {
  const care = {observations: [], profile: null};
  const result = {completedAt: '2026-09-23T10:00:00.000Z', provider: 'youcam', version: 'v2.1', items: [
    {type: 'pore', rawScore: 37.8, verified: true}, {type: 'moisture', rawScore: null, verified: false}, {type: 'skin_type', rawScore: null, verified: true},
  ]};
  const before = JSON.stringify(care);
  assert.deepEqual(Object.keys(recommendationEntries(care, result)[0].reference.scores), ['pore']);
  assert.equal(JSON.stringify(care), before);
});

test('저장된 관찰로 졸업과 유지 팁을 월간 리포트에서 다시 계산한다', () => {
  const data = EMPTY();
  data.skinCare.profile = {feel: 'balanced', concerns: [], sensitivity: 'rare', discomfort: 'no', priority: 'comfort', budget: null, updatedAt: '2026-09-01'};
  data.skinCare.observations = [entry('one', '2026-09-01', {pore: 35}), entry('two', '2026-09-15', {pore: 85}, 'one')];
  const html = renderRealReport(data, '2026-09', '2026-09-29');
  assert.match(html, /지금까지 좋아진 항목/);
  assert.match(html, /기본 루틴 유지/);
  assert.match(html, /피부 개선이나 제품 효과를 확정하지 않아요/);
});
