import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, validateData } from '../화면/계산.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { PHOTO_COPY, buildPhotoGuidance, guidanceFromReference, renderPhotoGuidance, renderPhotoItemGuidance } from '../화면/사진설명.js';
import { savePhotoObservation } from '../화면/사진이력.js';
import { renderRealReport } from '../화면/실제리포트.js';
import { createPhotoUI } from '../화면/사진분석.js';

const asOf='2025-03-15';
const profile=(extra={})=>({feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:0,updatedAt:asOf,...extra});
const fixture=(extra={})=>{const data=EMPTY();data.skinCare.profile=profile(extra);return data;};
const result=(actions=PHOTO_ACTIONS)=>({provider:'youcam',version:'v2.1',completedAt:`${asOf}T00:00:00.000Z`,actions,items:actions.map(type=>({type,rawScore:type==='skin_type'?null:68,...(type==='skin_type'?{skinTypes:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}}:{}),verified:true,images:[]}))});

test('16개 문구와 기록 없음·있음·불편함·실패 분기를 모두 제공한다',()=>{
  assert.deepEqual(Object.keys(PHOTO_COPY),PHOTO_ACTIONS);
  for(const type of PHOTO_ACTIONS){
    const input=result([type]);
    assert.equal(buildPhotoGuidance(input,EMPTY(),asOf).entries[0].mode,'question');
    assert.equal(buildPhotoGuidance(input,fixture(),asOf).entries[0].mode,'record');
    assert.equal(buildPhotoGuidance(input,fixture({discomfort:'yes'}),asOf).entries[0].mode,'pause');
    input.items[0].verified=false;
    const failure=buildPhotoGuidance(input,fixture(),asOf);
    assert.equal(failure.entries[0].mode,'unavailable');assert.ok(failure.alert);
    assert.ok(PHOTO_COPY[type].meaning&&PHOTO_COPY[type].question&&PHOTO_COPY[type].action);
  }
});

test('직접 남긴 당김을 먼저 챙기고 임시 기준 아래의 다른 항목만 추가한다',()=>{
  const data=fixture({feel:'dry'}),first=result(['pore','moisture']);first.items[0].rawScore=1;first.items[1].rawScore=100;
  const second=structuredClone(first);second.items.reverse();second.items.forEach(item=>{item.rawScore=item.rawScore===1?100:1;});
  const before=JSON.stringify(data),guide=buildPhotoGuidance(first,data,asOf),other=buildPhotoGuidance(second,data,asOf);
  assert.deepEqual(guide.focused,['moisture','pore']);assert.deepEqual(other.focused,['moisture']);
  assert.equal(guide.entries.find(entry=>entry.type==='pore').mode,'focus');
  assert.match(guide.action,/보습|수분/);assert.match(guide.product,/보습제/);assert.equal(JSON.stringify(data),before);
  assert.equal(data.skinCare.profile.budget,0);
});

test('편안하고 선택된 보유품만 사용 제안에 쓰며 민감·불편함·현재 답변이 우선한다',()=>{
  const data=fixture({feel:'dry'});
  data.inventory=[{id:'cream-one',title:'기존 보습제',category:'cosmetic',kind:'cream',status:'available',remaining:50,comfort:'comfortable',opened:'2025-03-01',expires:'2026-01-01',memo:''}];
  data.skinCare.selection.cream='cream-one';
  assert.match(buildPhotoGuidance(result(['moisture']),data,asOf).product,/내 화장대의 보습제/);
  data.inventory[0].comfort='uncomfortable';
  assert.doesNotMatch(buildPhotoGuidance(result(['moisture']),data,asOf).product,/내 화장대의 보습제/);
  data.skinCare.profile.sensitivity='often';
  assert.match(buildPhotoGuidance(result(['moisture']),data,asOf).evidence.join(' '),/새 제품·단계는 늘리지/);
  data.skinCare.checkins=[{date:asOf,feeling:'uncomfortable',adherence:'yes'}];
  assert.equal(buildPhotoGuidance(result(),data,asOf).paused,true);
  data.skinCare.checkins[0].date='2025-03-14';
  assert.equal(buildPhotoGuidance(result(),data,asOf).paused,false);
});

test('기록이 없으면 질문 하나, 미래 기록 제외, 피부 타입은 숫자 비교 없이 표시한다',()=>{
  const guide=buildPhotoGuidance(result(),EMPTY(),asOf);
  assert.equal(guide.action,PHOTO_COPY.moisture.question);
  const html=renderPhotoGuidance(guide);
  assert.match(html,/세안 후 당기는 느낌/);assert.equal(guide.entries.filter(entry=>entry.action.endsWith('?')).length,0);
  const future=fixture({updatedAt:'2025-03-16',feel:'dry'});
  assert.deepEqual(buildPhotoGuidance(result(),future,asOf).focused,[]);
  const type=guide.entries.find(entry=>entry.type==='skin_type');
  assert.equal(type.score,null);assert.match(renderPhotoItemGuidance(type),/사진 기반 분류 참고값/);
});

test('번들거림 기록이 있으면 불편함 미확인 때문에 당김을 다시 묻지 않는다',()=>{
  const guide=buildPhotoGuidance(result(),fixture({feel:'oily',discomfort:'unsure'}),asOf);
  assert.deepEqual(guide.focused,['oiliness']);
  assert.doesNotMatch(guide.action,/당기는 느낌이 있나요/);
  assert.equal(guide.followup,'제품 사용 후 불편함이 있나요?');
  assert.match(renderPhotoGuidance(guide),/불편함 여부 답하기/);
});

test('해석 실패와 불편함은 접지 않고 표시하며 원점수를 상태 판정·개선·순위로 바꾸지 않는다',()=>{
  const input=result();input.items[0].verified=false;input.items[0].rawScore=null;
  const guide=buildPhotoGuidance(input,fixture({discomfort:'yes'}),asOf);
  const html=renderPhotoGuidance(guide);
  assert.match(html.split('<details>')[0],/결과 해석 확인 필요/);assert.match(html.split('<details>')[0],/불편함/);
  assert.doesNotMatch(html,/<details open|상위 \d|하위 \d|정상 판정|피부 나이/);
  assert.match(html,/왜 이렇게 제안했나요/);
  const escaped=renderPhotoGuidance({...guide,title:'<img onerror=alert(1)>',evidence:['<script>']});
  assert.doesNotMatch(escaped,/<img|<script>/);assert.match(escaped,/&lt;img/);
});

test('계정 저장 자료 왕복 후 같은 문구를 만들고 월간 리포트에도 선택 항목만 설명한다',()=>{
  const data=savePhotoObservation(fixture({feel:'dry'}),result(['pore','moisture']),'moisture');
  const restored=validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(buildPhotoGuidance(guidanceFromReference(restored.skinCare.observation),restored,asOf),buildPhotoGuidance(guidanceFromReference(data.skinCare.observation),data,asOf));
  const html=renderRealReport(restored,'2025-03',asOf);
  assert.match(html,/보습 루틴부터/);assert.equal((html.match(/data-trend="/g)??[]).length,2);assert.match(html,/같은 조명에서 다시 살펴볼까요/);
});

test('실제 결과 화면에 설명을 연결하며 조회만으로 분석·저장 요청을 보내지 않는다',async()=>{
  const original={document:globalThis.document,location:globalThis.location};const listeners={},calls=[];
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  const data=fixture({feel:'dry'}),input=result(['pore','moisture']);
  try{
    const ui=createPhotoUI({state:()=>({data,effective:data}),toast(){},photoFetch:async(path,options)=>{
      calls.push({path,method:options.method??'GET'});
      return Response.json(path.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:true}: {used:true,job:{state:'success',result:input}});
    }});
    await listeners.click({target:{closest:selector=>selector==='[data-photo]'?{dataset:{photo:'connect'}}:null}});
    const html=ui.render();assert.match(html,/보습 루틴부터/);assert.match(html,/사진으로 본 것/);assert.match(html,/직접 알려주신 것/);
    assert.ok(calls.every(call=>call.method==='GET'));assert.equal(calls.length,2);ui.reset();
  }finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
