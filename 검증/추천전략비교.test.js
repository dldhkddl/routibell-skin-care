import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { RECOMMENDATION_SETTINGS, STRATEGY } from '../화면/추천전략설정.js';
import { recommendPhoto } from '../화면/사진추천.js';
import { compareRecommendationScenarios, evaluateRecommendationScenario, makeRecommendationScenarios, recommendationMetrics } from './추천전략시나리오.js';

const response=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
const actual=normalizeAnalysis(response,()=>Date.parse('2026-09-23T06:00:00Z'),PHOTO_ACTIONS);
const scores=Object.fromEntries(actual.items.map(item=>[item.type,item.rawScore]));
const skinTypes=actual.items.find(item=>item.type==='skin_type').skinTypes;
const scenarios=makeRecommendationScenarios(scores,actual.summary,skinTypes);
const comparison=compareRecommendationScenarios(scenarios);
const caseById=id=>comparison.find(row=>row.scenario.id===id);

test('실제 16항목 응답과 가상 사용자 29명의 동일한 기록에 A·B를 각각 적용한다',()=>{
  assert.equal(STRATEGY,'A');
  assert.equal(scenarios.length,30);
  assert.equal(new Set(scenarios.map(scenario=>scenario.id)).size,30);
  assert.equal(Object.keys(scenarios[0].data.skinCare.observation.scores).length,16);
  assert.deepEqual(scenarios[0].data.skinCare.observation.skinTypes,skinTypes);
  assert.deepEqual(scenarios[0].data.skinCare.observation.summary,actual.summary);
  for(const row of comparison){
    assert.ok(row.A.guidance);
    assert.ok(row.B.guidance);
    assert.ok(row.A.focus.length<=2);
    assert.ok(row.B.focus.length<=2);
    assert.equal(row.A.recommendation.strategy,'A');
    assert.equal(row.B.recommendation.strategy,'B');
  }
});

test('고정 기준과 개인 기준은 중간 점수·재분석 하락에서 다른 집중 항목을 보여준다',()=>{
  assert.deepEqual(caseById('04').A.focus,[]);
  assert.deepEqual(caseById('04').B.focus,['pore']);
  assert.deepEqual(caseById('23').A.focus,['pore']);
  assert.equal(caseById('23').B.focus[0],'pore');
  assert.ok(caseById('23').B.events.some(event=>event.action==='transition'));
  assert.match(caseById('21').A.recommendation.items.find(item=>item.type==='pore').change,/비슷해요/);
  assert.equal(caseById('24').A.recommendation.items.find(item=>item.type==='pore').difference,null);
  assert.equal(caseById('25').B.recommendation.items.find(item=>item.type==='pore').difference,null);
});

test('A는 확인된 재분석 하락을 집중 후보에 올리고 조건·버전 불일치는 제외한다',()=>{
  const scenario=scenarios.find(item=>item.id==='23');
  const data=structuredClone(scenario.data);
  data.skinCare.observations[0].reference.scores.pore=90;
  data.skinCare.observations[1].reference.scores.pore=80;
  data.skinCare.observation=data.skinCare.observations[1].reference;
  const focus=()=>recommendPhoto(data.skinCare,null,{strategy:'A'}).focused;
  assert.deepEqual(focus(),['pore']);
  data.skinCare.observations[1].condition='unknown';
  data.skinCare.observations[1].baselineId=null;
  assert.deepEqual(focus(),[]);
  data.skinCare.observations[1].condition='matched';
  data.skinCare.observations[1].baselineId=data.skinCare.observations[0].id;
  data.skinCare.observations[1].reference.version='v2.0';
  assert.deepEqual(focus(),[]);
  data.skinCare.observations[1].reference.version='v2.1';
  data.skinCare.observations[1].reference.scores.pore=88;
  assert.deepEqual(focus(),[]);
});

test('좋음 구간에서 다시 내려간 항목도 졸업 처리로 사라지지 않는다',()=>{
  const data=structuredClone(scenarios.find(item=>item.id==='23').data);
  const [first,second]=data.skinCare.observations;
  first.reference.scores.pore=90;
  second.reference.scores.pore=85;
  const third={...structuredClone(second),id:'third',completedAt:'2026-09-23T06:00:00.000Z',reference:{...structuredClone(second.reference),date:'2026-09-23',scores:{...second.reference.scores,pore:80}},baselineId:second.id};
  data.skinCare.observations.push(third);
  data.skinCare.observation=third.reference;
  const continued=recommendPhoto(data.skinCare,null,{strategy:'A'});
  assert.deepEqual(continued.focused,['pore']);
  assert.equal(continued.graduated.length,0);
  first.reference.scores.pore=34;
  second.reference.scores.pore=90;
  const returned=recommendPhoto(data.skinCare,null,{strategy:'A'});
  assert.ok(returned.returned.includes('pore'));
  assert.ok(returned.focused.includes('pore'));
});

test('졸업·복귀·다음 항목 전환을 두 전략에서 모두 기록한다',()=>{
  for(const strategy of ['A','B']){
    assert.ok(caseById('26')[strategy].events.some(event=>event.action==='graduated'));
    assert.match(caseById('26')[strategy].guidance.graduationLine,/지난번보다.*점 높아요/);
    assert.ok(caseById('26')[strategy].recommendation.maintained.includes('pore'));
    assert.ok(caseById('27')[strategy].events.some(event=>event.action==='returned'));
    assert.match(caseById('27')[strategy].guidance.returnLine,/다시 신경 써볼까요/);
    assert.equal(recommendationMetrics(comparison,strategy).recognizedEvents,recommendationMetrics(comparison,strategy).expectedEvents);
  }
});

test('불편함은 점수보다 먼저 보고 직접 답한 피부 느낌을 덮어쓰지 않는다',()=>{
  const originals=scenarios.map(scenario=>JSON.stringify(scenario.data));
  for(const scenario of scenarios)for(const strategy of ['A','B'])evaluateRecommendationScenario(scenario,strategy);
  for(const strategy of ['A','B']){
    for(const id of ['15','16','17']){
      const result=caseById(id)[strategy];
      assert.equal(result.plan.paused,true);
      assert.deepEqual(result.plan.morning,[]);
      assert.deepEqual(result.plan.evening,[]);
    }
    assert.match(caseById('15')[strategy].guidance.action,/피부과 상담도 고려해요/);
    assert.match(caseById('16')[strategy].guidance.action,/피부과 상담도 고려해요/);
    assert.ok(caseById('18')[strategy].focus.includes('moisture'));
    assert.equal(caseById('20').scenario.data.skinCare.profile.feel,'unsure');
    assert.match(caseById('20')[strategy].guidance.skinTypeQuestion,/맞나요|그런가요/);
    assert.equal(recommendationMetrics(comparison,strategy).safetyViolations,0);
    assert.equal(recommendationMetrics(comparison,strategy).contradictions,0);
  }
  assert.deepEqual(scenarios.map(scenario=>JSON.stringify(scenario.data)),originals);
});

test('비교 문서는 30명과 두 전략, 390픽셀 대표 화면 8장을 빠짐없이 포함한다',()=>{
  const report=readFileSync(new URL('./추천전략비교.md',import.meta.url),'utf8');
  for(const scenario of scenarios)assert.match(report,new RegExp(`^\\| ${scenario.id} ${scenario.title} \\|`,'m'));
  for(const id of ['02','05','23','26'])for(const strategy of ['A','B']){
    const filename=`./캡처/추천-${id}-${strategy}.jpg`;
    assert.ok(existsSync(new URL(filename,import.meta.url)));
    assert.match(report,new RegExp(`추천-${id}-${strategy}\\.jpg`));
  }
  assert.equal(recommendationMetrics(comparison,'A').allGood,1);
  assert.equal(recommendationMetrics(comparison,'B').allGood,1);
  assert.equal(recommendationMetrics(comparison,'A').allClearCopy,0);
  assert.equal(recommendationMetrics(comparison,'B').allClearCopy,0);
});

test('설정한 3점 이내는 비슷하고 실제 16항목 기준값을 모두 가진다',()=>{
  assert.equal(RECOMMENDATION_SETTINGS.changeMargin,3);
  for(const type of PHOTO_ACTIONS.filter(type=>type!=='skin_type'))assert.ok(RECOMMENDATION_SETTINGS.bands[type]);
  for(const strategy of ['A','B']){
    assert.equal(caseById('21')[strategy].recommendation.items.find(item=>item.type==='pore').change,'비슷해요');
    assert.equal(caseById('29')[strategy].focus.length,0);
  }
});

test('두 줄 제안의 중복은 30% 이하이고 집중 항목과 제안 주제는 일치한다',()=>{
  for(const strategy of ['A','B']){
    const metrics=recommendationMetrics(comparison,strategy);
    assert.ok(metrics.duplicatedCopy<=9,`${strategy}: ${metrics.duplicatedCopy}/30`);
    assert.equal(metrics.topicMismatches,0);
    for(const id of ['03','07']){
      const guidance=caseById(id)[strategy].guidance;
      assert.equal(guidance.actionType,'redness');
      assert.doesNotMatch(guidance.product,/보습제/);
      assert.match(`${guidance.action} ${guidance.product}`,/붉|뜨거|미지근|따가|무향|클렌저/);
    }
    for(const [id,topic,pattern] of [['05','pore',/모공|세안|클렌저/],['08','acne',/트러블|클렌저|논코메/],['09','age_spot',/색소|자외선|선크림/]]){
      const guidance=caseById(id)[strategy].guidance;
      assert.equal(guidance.actionType,topic);
      assert.match(`${guidance.action} ${guidance.product}`,pattern);
    }
  }
});

test('비교표와 전후 표는 같은 30명에게 다시 계산한 두 줄 제안을 담는다',()=>{
  const report=readFileSync(new URL('./추천전략비교.md',import.meta.url),'utf8');
  const table=report.split('## 같은 사용자 30명 비교')[1].split('## 주요 문구 전후 비교')[0];
  const beforeAfter=report.split('## 주요 문구 전후 비교')[1].split('## 요약 지표')[0];
  for(const row of comparison){
    const line=table.split('\n').find(item=>item.startsWith(`| ${row.scenario.id} `));
    assert.ok(line,row.scenario.id);
    for(const strategy of ['A','B']){
      const {action,product}=row[strategy].guidance;
      assert.ok(line.includes(`제안 ${action}${product?` / ${product}`:''}`),`${row.scenario.id}-${strategy}`);
    }
  }
  for(const id of ['03','05','07','08','09']){
    const {action,product}=caseById(id).A.guidance;
    const line=beforeAfter.split('\n').find(item=>item.startsWith(`| ${id} `));
    assert.ok(line?.includes(`${action} → ${product}`),id);
  }
  for(const strategy of ['A','B']){
    const metric=recommendationMetrics(comparison,strategy);
    assert.match(report,new RegExp(`${metric.duplicatedCopy}/30 \\(${(metric.duplicatedCopy/30*100).toFixed(1)}%\\)`));
  }
});
