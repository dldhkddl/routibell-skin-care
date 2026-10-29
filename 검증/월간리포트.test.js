import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMonthlySample, summarizeMonthlyReport } from '../화면/월간리포트.js';
import { monthlySample, reviewedObservation } from './월간샘플.js';

test('월간 샘플의 소비·만족도·아침저녁 체크를 각각 집계한다', () => {
  const report = summarizeMonthlyReport(monthlySample);
  assert.equal(report.days.length, 22);
  assert.equal(report.total, 72000);
  assert.equal(report.remaining, 28000);
  assert.equal(report.average, 4.5);
  assert.equal(report.ratedCount, 2);
  assert.equal(report.unratedCount, 1);
  assert.equal(report.morningDone, 15);
  assert.equal(report.eveningDone, 18);
  assert.equal(report.done, 33);
  assert.equal(report.skipped, 4);
  assert.equal(report.unknown, 7);
  assert.equal(report.opportunities, 44);
  assert.equal(report.checkRate, 75);
  assert.equal(report.feedbackCount, 9);
  assert.equal(report.comfortable, 6);
  assert.equal(report.dry, 3);
});

test('리포트 기간 이전·이후 소비와 피드백은 섞이지 않는다', () => {
  const sample = structuredClone(monthlySample);
  sample.records.push(
    { date: '2026-08-31', title: '다른 달', amount: 90000, rating: 1 },
    { date: '2026-09-23', title: '집계 이후', amount: 80000, rating: 1 }
  );
  sample.feedback.push({ date: '2026-09-23', feeling: 'dry' });
  sample.routine.push({ date: '2026-09-23', morning: true, evening: true });
  assert.deepEqual(summarizeMonthlyReport(sample), summarizeMonthlyReport(monthlySample));
});

test('미평가와 빈 기록은 0점 또는 0% 수행으로 단정하지 않는다', () => {
  const sample = { ...monthlySample, records: [], routine: [], feedback: [] };
  const report = summarizeMonthlyReport(sample);
  assert.equal(report.average, null);
  assert.equal(report.total, 0);
  assert.equal(report.done, 0);
  assert.equal(report.skipped, 0);
  assert.equal(report.unknown, 44);
  assert.match(renderMonthlySample(sample, reviewedObservation), /미기록 44회/);
  assert.match(renderMonthlySample(sample, reviewedObservation), /직접 남긴 만족도<\/span><strong>미평가<\/strong>/);
  const unrated = structuredClone(monthlySample);
  unrated.records.forEach(record => { record.rating = null; });
  assert.equal(summarizeMonthlyReport(unrated).average, null);
});

test('예산 미설정·0원·초과와 다음 달 검토 한도를 구분한다', () => {
  const unset = { ...monthlySample, budget: null, nextBudget: null };
  const zero = { ...monthlySample, budget: 0, nextBudget: 0 };
  assert.equal(summarizeMonthlyReport(unset).remaining, null);
  assert.equal(summarizeMonthlyReport(zero).remaining, -72000);
  const unsetHtml = renderMonthlySample(unset, reviewedObservation);
  const zeroHtml = renderMonthlySample(zero, reviewedObservation);
  assert.match(unsetHtml, /예산 미설정/);
  assert.match(unsetHtml, /검토 상한<\/dt><dd>미정/);
  assert.match(zeroHtml, /예산 0원/);
  assert.match(zeroHtml, /예산 초과 72,000원/);
  assert.match(zeroHtml, /검토 상한<\/dt><dd>0원/);
  assert.doesNotMatch(unsetHtml + zeroHtml, /NaN|Infinity/);
});

test('실제 관찰 원점수는 출처와 한계를 표시하고 가상 기록과 분리한다', () => {
  const html = renderMonthlySample(monthlySample, reviewedObservation);
  for (const concern of reviewedObservation.concerns) assert.ok(html.includes(String(concern.raw)));
  assert.match(html, /실제 결과 · 1회/);
  assert.match(html, /6항목 중/);
  assert.match(html, /원본 응답 파일을 새로 검증한 결과는 아닙니다/);
  assert.match(html, /가상 소비·관리 기록과도 연결해 해석하지 않아요/);
  assert.match(html, /중간 집계이며 한 달 전체 성과가 아니에요/);
  assert.match(html, /AI 자동 생성·예산 변경·제품 주문은 실행하지 않아요/);
  assert.doesNotMatch(html, /<img|피부 점수 78|상위 23%/);
});

test('화면에 넣는 기록·제품·관찰 문자열은 이스케이프한다', () => {
  const sample = structuredClone(monthlySample);
  const observation = structuredClone(reviewedObservation);
  const injected = '<img src=x onerror="alert(1)">&';
  sample.records[0].title = injected;
  sample.inventory[0].title = injected;
  observation.source = injected;
  observation.concerns[0].name = injected;
  observation.concerns[0].code = injected;
  const html = renderMonthlySample(sample, observation);
  assert.doesNotMatch(html, /<img/);
  assert.equal(html.split('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;').length - 1, 5);
});

test('샘플 집계·렌더링은 입력 원본을 바꾸지 않는다', () => {
  const before = structuredClone({ monthlySample, reviewedObservation });
  renderMonthlySample(monthlySample, reviewedObservation);
  assert.deepEqual({ monthlySample, reviewedObservation }, before);
  assert.throws(() => summarizeMonthlyReport({ ...monthlySample, end: '2026-08-31' }), /기간/);
  assert.throws(() => summarizeMonthlyReport({ ...monthlySample, end: '2026-10-22' }), /기간/);
});

test('샘플 진입점은 저장소·분석 통신을 쓰지 않고 앱 진입점에도 연결하지 않는다', () => {
  const files = ['../화면/월간리포트.js', './월간리포트.js', './월간샘플.js'];
  const code = files.map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(code, /\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|Preferences)\b/);
  assert.doesNotMatch(code, /YOUCAM_API_KEY|Bearer |s3-accelerate|https:\/\//);
  const main = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /월간샘플|월간리포트/);
});
