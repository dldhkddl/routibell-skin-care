import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData } from '../화면/계산.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { buildPhotoTrend, photoTimeline, renderTrendSvg, renderPhotoTrends, revealTrendImages, photoComparison, renderPhotoComparison } from '../화면/사진그래프.js';
import { buildPhotoGuidance, guidanceFromReference } from '../화면/사진설명.js';
import { savePhotoObservation, removePhotoObservation } from '../화면/사진이력.js';
import { renderRealReport } from '../화면/실제리포트.js';

const entry=(id,date,scores={moisture:78.5},baselineId=null,version='v2.1')=>({id,completedAt:`${date}T01:00:00.000Z`,condition:baselineId?'matched':'unknown',baselineId,reference:{provider:'youcam',version,date,scores,focus:Object.keys(scores)[0],actions:Object.keys(scores)}});
const sequence=()=>[entry('first','2025-03-01'),entry('second','2025-03-15',{moisture:79.3},'first')];
const fixture=()=>{const data=EMPTY();data.skinCare.profile={feel:'dry',concerns:['dryness'],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:0,updatedAt:'2025-03-01'};return data;};
const result=(date,types=['pore','moisture'])=>({provider:'youcam',version:'v2.1',completedAt:`${date}T01:00:00.000Z`,actions:types,items:types.map(type=>({type,rawScore:type==='skin_type'?null:72,verified:true}))});

test('첫 관찰은 점 하나이며 모든 크기의 그래프 축은 0~100 고정이다',()=>{
  const trend=buildPhotoTrend([sequence()[0]],'moisture');
  assert.equal(trend.segments.length,0);assert.equal(trend.points.length,1);assert.match(trend.note,/첫 기준점이에요/);
  const chart=renderTrendSvg(trend),mini=renderTrendSvg(trend,true);
  assert.equal((chart.match(/<circle /g)??[]).length,1);assert.match(chart,/세로축 0부터 100/);
  const lower=buildPhotoTrend([entry('low','2025-03-01',{moisture:1})],'moisture');
  const upper=buildPhotoTrend([entry('high','2025-03-01',{moisture:100})],'moisture');
  assert.match(renderTrendSvg(lower),/cy="143\.7"/);assert.match(renderTrendSvg(upper),/cy="15"/);
  assert.match(renderTrendSvg(lower,true),/cy="46\.58"/);assert.match(renderTrendSvg(upper,true),/cy="5"/);
  assert.match(mini,/aria-hidden="true"/);
});

test('같은 항목·버전·직전 기준 확인일 때만 연결하며 작은 차이도 중립 숫자로 표시한다',()=>{
  const trend=buildPhotoTrend(sequence(),'moisture');
  assert.deepEqual(trend.segments,[[0,1]]);assert.ok(trend.points.every(point=>!point.hollow));
  assert.equal(trend.note,'지난 기록 78.5 → 이번 79.3');
  assert.doesNotMatch(renderTrendSvg(trend),/개선|악화|green|red|↑|↓/);
});

test('두 번째 분석부터 같은 항목의 수치가 오른 순서로 비교하고 판단 표현은 쓰지 않는다',()=>{
  const entries=[entry('first','2025-03-01',{moisture:60,pore:70,acne:80}),entry('second','2025-03-15',{moisture:62,pore:75,acne:78},'first')];
  const compared=photoComparison(entries);
  assert.deepEqual(compared.items.map(item=>item.type),['pore','moisture','acne']);
  assert.deepEqual(compared.items.map(item=>item.difference),[5,2,-2]);
  const html=renderPhotoComparison(entries);
  assert.match(html,/지난번보다 이렇게 달라졌어요/);
  assert.match(html,/차이 \+5\.0/);
  assert.equal((html.match(/참고값/g)??[]).length,1);
  assert.doesNotMatch(html,/개선|악화|치료/);
  assert.equal(renderPhotoComparison(entries.slice(0,1)),'');
});

test('결과 앞에 비교를 보일 때 상세 그래프 안에는 같은 비교 카드를 반복하지 않는다',()=>{
  const data=fixture();data.skinCare.observations=sequence();
  const guidance=buildPhotoGuidance(guidanceFromReference(data.skinCare.observations[1].reference),data);
  const detail=renderPhotoTrends({care:data.skinCare,guidance,hideComparison:true,asOf:'2025-03-31'});
  assert.doesNotMatch(detail,/지난번보다 이렇게 달라졌어요/);
  assert.match(renderPhotoComparison(data.skinCare.observations),/지난번보다 이렇게 달라졌어요/);
});

test('조건이나 버전이 다르면 차이를 숨기고 피부 타입·미분석을 0점으로 찍지 않는다',()=>{
  const entries=[entry('first','2025-03-01',{moisture:60,pore:70,skin_type:null}),entry('second','2025-03-15',{moisture:62,pore:null,skin_type:null})];
  const html=renderPhotoComparison(entries);
  assert.match(html,/비교 조건 미확인/);
  assert.doesNotMatch(html,/차이 \+|피부 타입|모공/);
  entries[1].condition='matched';entries[1].baselineId='first';entries[1].reference.version='v2.0';
  assert.equal(photoComparison(entries).matched,false);
});

test('조건·버전·제공자·날짜·기준 누락 시 속 빈 점과 안내를 사용하고 연결하지 않는다',()=>{
  for(const edit of [nodes=>{nodes[1].condition='unknown';nodes[1].baselineId=null;},nodes=>{nodes[1].reference.version='v2.0';},nodes=>{nodes[1].reference.provider='another';},nodes=>{nodes[1].reference.date=nodes[0].reference.date;},nodes=>{nodes[1].baselineId='missing';}]){
    const nodes=sequence();edit(nodes);const trend=buildPhotoTrend(nodes,'moisture');
    assert.equal(trend.segments.length,0);assert.ok(trend.points.every(point=>point.hollow));assert.match(trend.note,/비교 조건 미확인/);
  }
});

test('중간 미분석·실패 값을 0점으로 만들거나 건너뛰어 연결하지 않는다',()=>{
  for(const value of [null,NaN,undefined,0,'75',101]){
    const nodes=[entry('first','2025-03-01'),entry('gap','2025-03-10',{moisture:value},'first'),entry('last','2025-03-15',{moisture:80},'gap')];
    const trend=buildPhotoTrend(nodes,'moisture');
    assert.equal(trend.points[1].value,null);assert.equal(trend.segments.length,0);assert.equal((renderTrendSvg(trend).match(/<circle /g)??[]).length,2);
  }
  const nodes=sequence();nodes[1].reference.scores={pore:30};
  assert.match(buildPhotoTrend(nodes,'moisture').note,/미분석/);
  assert.equal(buildPhotoTrend(nodes,'moisture').latest.value,null);
  assert.match(buildPhotoTrend(nodes,'pore').note,/첫 기준점/);
});

test('피부 타입은 원점수가 들어와도 선·점·축을 만들지 않는다',()=>{
  const trend=buildPhotoTrend([entry('type','2025-03-01',{skin_type:88})],'skin_type');
  assert.equal(trend.latest.value,null);assert.equal(renderTrendSvg(trend),'');assert.match(trend.note,/분류형/);
});

test('저장된 현재 결과는 중복하지 않고 미저장·다른 응답은 조건을 자동 확인하지 않는다',()=>{
  const data=fixture(),input=result('2025-03-15');
  const saved=savePhotoObservation(data,input,'moisture');
  assert.equal(photoTimeline(saved.skinCare,input,'2025-03-31').length,1);
  const more=result('2025-03-16');const timeline=photoTimeline(saved.skinCare,more,'2025-03-31');
  assert.equal(timeline.length,2);assert.equal(timeline[1].condition,'unknown');
  assert.equal(buildPhotoTrend(timeline,'moisture').segments.length,0);
  assert.equal(photoTimeline(saved.skinCare,more,'2025-03-14').length,0);
  const before=JSON.stringify(saved);input.items[0].rawScore=null;input.items[0].verified=false;
  assert.equal(photoTimeline(saved.skinCare,input,'2025-03-31')[0].reference.scores.pore,null);
  assert.equal(JSON.stringify(saved),before);
});

test('집중 항목만 먼저 펼치고 나머지는 점수순이 아닌 고정 그룹 순서다',()=>{
  const input=result('2025-03-15',PHOTO_ACTIONS),data=fixture();input.items.reverse();
  const guide=buildPhotoGuidance(input,data,'2025-03-31');
  const html=renderPhotoTrends({care:data.skinCare,result:input,guidance:guide,asOf:'2025-03-31'});
  assert.equal((html.match(/data-trend="[^"]+" open/g)??[]).length,1);assert.match(html,/data-trend="moisture" open/);
  assert.ok(html.indexOf('data-trend="moisture"')<html.indexOf('data-trend="redness"'));
  assert.ok(html.indexOf('data-trend="redness"')<html.indexOf('data-trend="oiliness"'));
  assert.ok(html.indexOf('data-trend="oiliness"')<html.indexOf('data-trend="age_spot"'));
  const none={...guide,focused:[]};assert.doesNotMatch(renderPhotoTrends({care:data.skinCare,result:input,guidance:none,asOf:'2025-03-31'}),/data-trend="[^"]+" open/);
});

test('안전한 이미지도 처음에는 비활성 template에만 두고 펼칠 때 한 번만 삽입한다',()=>{
  const input=result('2025-03-15'),data=fixture();
  input.items[0].images=['https://yce-us.s3-accelerate.amazonaws.com/test/image.png','https://untrusted.example/photo'];
  const html=renderPhotoTrends({care:data.skinCare,result:input,guidance:buildPhotoGuidance(input,data,'2025-03-31'),asOf:'2025-03-31'});
  assert.match(html,/이미지로 확인하기 · 1장/);assert.doesNotMatch(html,/untrusted/);
  assert.doesNotMatch(html.replace(/<template>[\s\S]*?<\/template>/g,''),/<img /);
  let count=0,removed=false;
  const template={content:{cloneNode:()=>({})},remove:()=>{removed=true;}};
  const target={open:false,matches:()=>true,querySelector:selector=>selector==='template'?(removed?null:template):{append:()=>count++}};
  revealTrendImages({target});assert.equal(count,0);target.open=true;revealTrendImages({target});revealTrendImages({target});assert.equal(count,1);
});

test('저장 왕복·삭제 후 그래프가 원본 자료에 맞춰 갱신되고 차이를 조작하지 않는다',()=>{
  let data=savePhotoObservation(fixture(),result('2025-03-01'),'moisture');
  data=savePhotoObservation(data,result('2025-03-15'),'moisture',data.skinCare.observations[0].id);
  const restored=validateData(JSON.parse(JSON.stringify(data)));
  const chart=buildPhotoTrend(photoTimeline(restored.skinCare,null,'2025-03-31'),'moisture');
  assert.equal(chart.segments.length,1);assert.match(chart.note,/72.0 → 이번 72.0/);
  const next=removePhotoObservation(restored,restored.skinCare.observations[0].id);
  assert.equal(buildPhotoTrend(photoTimeline(next.skinCare,null,'2025-03-31'),'moisture').points.length,1);
  const html=renderPhotoTrends({care:restored.skinCare,guidance:buildPhotoGuidance(guidanceFromReference(restored.skinCare.observation),restored,'2025-03-31'),asOf:'2025-03-31'});
  assert.doesNotMatch(html,/NaN|undefined|Infinity/);
});

test('피부 타입 전체·T존·U존은 계정 기록과 월간 리포트에 남고 이미지는 눌렀을 때만 표시한다',()=>{
  const data=fixture(),input=result('2025-03-15',['moisture','skin_type']);
  const skinItem=input.items.find(item=>item.type==='skin_type');
  skinItem.skinTypes={whole:'Combination',t_zone:'Oily',u_zone:'Dry & Redness'};
  skinItem.regions=['whole','t_zone','u_zone'].map(region=>({region,skinType:skinItem.skinTypes[region],images:[`https://yce-us.s3-accelerate.amazonaws.com/test/${region}.jpg`]}));
  const saved=savePhotoObservation(data,input,'skin_type');
  const restored=validateData(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.skinCare.observation.skinTypes,skinItem.skinTypes);
  assert.equal(restored.skinCare.observations[0].reference.scores.skin_type,null);
  const guidance=buildPhotoGuidance(guidanceFromReference(restored.skinCare.observation),restored,'2025-03-31');
  const stored=renderPhotoTrends({care:restored.skinCare,guidance,asOf:'2025-03-31'});
  assert.match(stored,/전체 얼굴<\/dt><dd>복합형/);
  assert.match(stored,/T존<\/dt><dd>유분형/);
  assert.match(stored,/U존<\/dt><dd>건조형 · 붉게 보임/);
  assert.match(renderRealReport(restored,'2025-03','2025-03-31'),/전체 얼굴<\/dt><dd>복합형/);
  const live=renderPhotoTrends({care:data.skinCare,result:input,guidance:buildPhotoGuidance(input,data,'2025-03-31'),asOf:'2025-03-31'});
  assert.match(live,/이미지로 확인하기 · 3장/);
  assert.match(live,/<figcaption>T존 · 누르면 크게 보기/);
  assert.doesNotMatch(live.replace(/<template>[\s\S]*?<\/template>/g,''),/<img /);
  assert.ok(!JSON.stringify(restored).includes('/test/t_zone.jpg'));
  const changed=structuredClone(input);changed.items[1].skinTypes.whole='Dry';
  assert.throws(()=>savePhotoObservation(saved,changed,'skin_type'));
  const old={...restored.skinCare.observation};delete old.skinTypes;
  const oldData={...restored,skinCare:{...restored.skinCare,observation:old,observations:[{...restored.skinCare.observations[0],reference:old}]}};
  assert.match(renderPhotoTrends({care:oldData.skinCare,guidance:buildPhotoGuidance(guidanceFromReference(old),oldData,'2025-03-31'),asOf:'2025-03-31'}),/영역별 분류가 저장되지 않았어요/);
});
