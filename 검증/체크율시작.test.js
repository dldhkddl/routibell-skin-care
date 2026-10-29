import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData } from '../화면/계산.js';
import { saveDaily, saveSkinCheckin, weekReport, routineSummary } from '../화면/피부계산.js';
import { monthlyReport } from '../화면/월간계산.js';
import { renderHomeMetrics } from '../화면/핵심숫자.js';
import { renderRealReport } from '../화면/실제리포트.js';

const asOf='2026-09-28';
const fixture=()=>{const data=EMPTY();data.skinCare.profile={feel:'balanced',concerns:[],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:null,updatedAt:'2026-09-01'};return data;};
const both=(data,date)=>saveDaily(saveDaily(data,'morning',true,date),'evening',true,date);
const record=rating=>({id:'example',title:'시험 소비',category:'cosmetic',amount:0,date:asOf,rating,repurchase:null,memo:''});

test('관리 기록 전에는 월초나 상태 설정일부터 분모를 만들지 않는다',()=>{
  const data=fixture(),week=weekReport(data,asOf).current,month=monthlyReport(data,'2026-09',asOf);
  assert.equal(week.rate,null);assert.equal(week.opportunities,0);
  assert.equal(month.routine.rate,null);assert.equal(month.routine.unchecked,0);
  assert.ok(month.calendar.every(day=>!day.active));
  assert.doesNotMatch(renderHomeMetrics(data,asOf),/0%|미설정|<strong>—/);
});

test('첫날 실천율은 정확히 계산하되 홈은 3일 전까지 숫자 대신 시작 안내를 보여준다',()=>{
  const once=saveDaily(fixture(),'morning',true,asOf),twice=saveDaily(once,'evening',true,asOf);
  assert.equal(weekReport(once,asOf).current.rate,50);
  const week=weekReport(twice,asOf).current,month=monthlyReport(twice,'2026-09',asOf);
  assert.equal(week.rate,100);assert.equal(week.opportunities,2);assert.equal(week.activeDays,1);
  assert.equal(month.routine.rate,100);assert.equal(month.routine.opportunities,2);
  assert.equal(month.calendar.filter(day=>day.active).length,1);
  assert.match(renderHomeMetrics(twice,asOf),/기록을 시작했어요/);
  assert.doesNotMatch(renderHomeMetrics(twice,asOf),/2 \/ 2회|100<small>%/);
  assert.equal(validateData(JSON.parse(JSON.stringify(twice))).skinCare.trackingStartedAt,asOf);
});

test('예전 기록이 많아도 최근 7일 기록이 3일 미만이면 큰 체크율을 보이지 않는다',()=>{
  let data=fixture();
  for(const day of ['2026-09-15','2026-09-16','2026-09-17'])data=both(data,day);
  data=both(data,asOf);
  const home=renderHomeMetrics(data,asOf);
  assert.match(home,/기록을 시작했어요/);
  assert.doesNotMatch(home,/최근 7일 체크율|100<small>%/);
});

test('최근 기록이 쌓여도 퍼센트 대신 챙긴 일수만 말한다',()=>{
  let data=fixture();
  for(const day of ['2026-09-25','2026-09-26','2026-09-28'])data=both(data,day);
  const home=renderHomeMetrics(data,asOf);
  assert.match(home,/이번 주 3일 챙기셨어요/);
  assert.doesNotMatch(home,/체크율|%/);
});

test('시작 후 빈 날짜는 건너뛰지 않고 최근 7일 범위만 계산한다',()=>{
  const data=both(fixture(),'2026-09-20');
  const after=weekReport(data,'2026-09-21').current;
  assert.equal(after.opportunities,4);assert.equal(after.rate,50);
  const later=both(data,asOf),week=weekReport(later,asOf).current;
  assert.equal(week.trackingStart,'2026-09-22');assert.equal(week.opportunities,14);assert.equal(week.done,2);
  assert.equal(monthlyReport(later,'2026-09',asOf).routine.opportunities,18);
  assert.equal(monthlyReport(later,'2026-08',asOf).routine.rate,null);
});

test('예전 백업은 실제 기록에서 시작일을 찾고 상태 수정·체크 취소로 시작일이 바뀌지 않는다',()=>{
  const data=both(fixture(),'2026-09-20');delete data.skinCare.trackingStartedAt;
  const restored=validateData(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.skinCare.trackingStartedAt,'2026-09-20');
  const changed=saveSkinCheckin(restored,{date:asOf,feeling:'same',adherence:'some',memo:'',feel:'dry',product:null},asOf);
  assert.equal(changed.skinCare.profile.updatedAt,asOf);
  assert.equal(changed.skinCare.trackingStartedAt,'2026-09-20');
  const undone=saveDaily(changed,'morning',false,'2026-09-20');
  assert.equal(undone.skinCare.trackingStartedAt,'2026-09-20');
  const trimmed=validateData({...changed,skinCare:{...changed.skinCare,days:[],checkins:[]}});
  assert.equal(trimmed.skinCare.trackingStartedAt,'2026-09-20');
});

test('과거 기록 추가·월 경계·윤년은 실제 시작일에 맞춘다',()=>{
  const data=both(fixture(),asOf),earlier=saveDaily(data,'morning',true,'2026-08-31');
  assert.equal(earlier.skinCare.trackingStartedAt,'2026-08-31');
  assert.equal(monthlyReport(earlier,'2026-09',asOf).routine.opportunities,56);
  const leap=routineSummary({trackingStartedAt:'2024-02-28',days:[]},'2024-02-01','2024-03-01');
  assert.equal(leap.activeDays,3);assert.equal(leap.opportunities,6);
  assert.equal(weekReport(fixture(),asOf).current.rate,null);
});

test('잘못된 시작일은 복원을 거절하며 원본 자료를 바꾸지 않는다',()=>{
  const data=both(fixture(),asOf),before=JSON.stringify(data);
  for(const trackingStartedAt of ['2099-01-01','2026-02-30','2026-09-28T00:00:00Z',42])assert.throws(()=>validateData({...data,skinCare:{...data.skinCare,trackingStartedAt}}),/시작 날짜/);
  assert.equal(JSON.stringify(data),before);
  const empty=EMPTY();empty.skinCare.trackingStartedAt=asOf;
  assert.throws(()=>validateData(empty),/시작일만/);
});

test('미설정·미평가 숫자 칸은 숨기되 실제 예산 0원과 평균 점수는 유지한다',()=>{
  const data=both(fixture(),asOf);data.records=[record(null)];
  const home=renderHomeMetrics(data,asOf),report=renderRealReport(data,'2026-09',asOf);
  assert.match(home,/예산 정하기/);assert.doesNotMatch(home,/미설정|미평가/);
  assert.doesNotMatch(report,/<strong>미설정<\/strong>|<strong>미평가<\/strong>|<strong>—<\/strong>/);
  assert.match(report,/소비 기록 열기/);assert.match(report,/예산 정하기/);
  data.budgets['2026-09']=0;data.records=[record(5)];
  assert.match(renderHomeMetrics(data,asOf),/<strong>0<small>원/);
  assert.doesNotMatch(renderHomeMetrics(data,asOf),/예산 정하기/);
  const rated=renderRealReport(data,'2026-09',asOf);
  assert.match(rated,/<strong>5.0<small> \/ 5/);assert.match(rated,/<strong>0원<\/strong>/);
});
