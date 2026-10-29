import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { EMPTY, validateData } from '../화면/계산.js';
import { photoReference, validatePhotoReference } from '../화면/사진계산.js';
import { savePhotoObservation, photoHistory } from '../화면/사진이력.js';
import { normalizePhotoSummary, validatePhotoSummary, renderPhotoSummary } from '../화면/사진요약.js';
import { buildPhotoGuidance, guidanceFromReference } from '../화면/사진설명.js';
import { renderPhotoTrends } from '../화면/사진그래프.js';
import { renderRealReport } from '../화면/실제리포트.js';

const response=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
const completedAt='2026-09-23T06:00:00.000Z';
const actual=()=>normalizeAnalysis(response,()=>Date.parse(completedAt),PHOTO_ACTIONS);
const fixture=()=>{const data=EMPTY();data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:'2026-09-23'};return data;};

test('실제응답구조 파일의 16항목·피부 타입 3영역·종합 참고값을 그대로 해석한다',()=>{
  const result=actual();
  assert.equal(result.items.length,16);
  assert.ok(result.items.every(item=>item.verified));
  for(const item of result.items.filter(item=>item.type!=='skin_type'))assert.equal(item.rawScore,response.data.results.output.find(source=>source.type===item.type).raw_score);
  const types=Object.fromEntries(response.data.results.output.filter(item=>item.type==='skin_type').map(item=>[item.region,item.skin_type]));
  assert.deepEqual(result.items.find(item=>item.type==='skin_type').skinTypes,types);
  assert.equal(Object.keys(types).length,3);
  assert.deepEqual(result.summary,{overallScore:80.6,skinAge:28});
  assert.doesNotMatch(JSON.stringify(result),/ui_score|resize_image/);
});

test('실제 결과는 계정 자료 검증·백업 왕복 후에도 저장 관찰·월간 리포트에 표시된다',()=>{
  const result=actual(),original=fixture();
  const saved=savePhotoObservation(original,result,'moisture');
  const restored=validateData(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.skinCare.observation.summary,result.summary);
  assert.deepEqual(photoHistory(restored.skinCare)[0].reference.summary,result.summary);
  assert.equal(original.skinCare.observations.length,0);
  const guidance=buildPhotoGuidance(guidanceFromReference(restored.skinCare.observation),restored,'2026-09-23');
  for(const html of [renderPhotoTrends({care:original.skinCare,result,guidance,asOf:'2026-09-23'}),renderPhotoTrends({care:restored.skinCare,guidance,asOf:'2026-09-23'}),renderRealReport(restored,'2026-09','2026-09-23')]) {
    assert.match(html,/유캠 종합 점수/);assert.match(html,/80\.6/);assert.match(html,/추정 피부 나이/);assert.match(html,/28<small>세/);
  }
  assert.equal(savePhotoObservation(restored,result,'pore').skinCare.observations.length,1);
});

test('종합 값은 score만 사용하고 누락·중복·문자열·범위 오류를 다른 점수로 채우지 않는다',()=>{
  assert.equal(normalizePhotoSummary([{type:'all',raw_score:80},{type:'skin_age',score:'28'}]),null);
  assert.equal(normalizePhotoSummary([{type:'all',score:80},{type:'all',score:81},{type:'skin_age',score:-1}]),null);
  for(const score of [0,101,NaN,Infinity,null,'80'])assert.equal(normalizePhotoSummary([{type:'all',score}]),null);
  assert.deepEqual(normalizePhotoSummary([{type:'all',score:80.6}]),{overallScore:80.6});
  for(const invalid of [{},null,{skinAge:-1},{skinAge:151},{overallScore:101},{overallScore:80,extra:true},{skinAge:'<img>'}])assert.throws(()=>validatePhotoSummary(invalid));
  assert.equal(renderPhotoSummary({skinAge:'<img>'}),'');
});

test('이전 저장값에는 나이·종합을 만들지 않고 같은 분석의 보존값을 덮어쓰지 않는다',()=>{
  const result=actual(),reference=photoReference(result,'pore');
  delete reference.summary;
  assert.deepEqual(validatePhotoReference(reference),reference);
  assert.equal(renderPhotoSummary(reference.summary),'');
  assert.throws(()=>validatePhotoReference({...reference,summary:{overallScore:'80'}}));
  const saved=savePhotoObservation(fixture(),result,'pore');
  assert.throws(()=>savePhotoObservation(saved,{...result,summary:{overallScore:81,skinAge:28}},'pore'));
  const without={...result};delete without.summary;
  assert.deepEqual(savePhotoObservation(saved,without,'pore').skinCare.observation.summary,result.summary);
  const latest={...without,completedAt:'2026-09-24T06:00:00.000Z'};
  const guidance=buildPhotoGuidance(result,fixture(),'2026-09-24');
  assert.doesNotMatch(renderPhotoTrends({care:saved.skinCare,result:latest,guidance,asOf:'2026-09-24'}),/유캠 종합 점수|추정 피부 나이/);
});
