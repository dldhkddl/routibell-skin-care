import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderResultCard } from '../화면/결과카드.js';
import { createResultPhoto } from '../화면/임시결과사진.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS, DEFAULT_PHOTO_ACTIONS, PHOTO_CONSENT_VERSION } from '../화면/사진항목.js';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { savePhotoObservation } from '../화면/사진이력.js';

const source=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
const result=()=>normalizeAnalysis(source,Date.now,PHOTO_ACTIONS);

test('결과 카드는 실제 점수·나이·3영역을 표시하고 항목 순위나 가짜 인물을 만들지 않는다',()=>{
  const input=result(),html=renderResultCard({result:input});
  assert.match(html,/80\.6<\/strong>/);assert.match(html,/28<small>세/);
  assert.equal((html.match(/class="result-metric tone-/g)??[]).length,15);
  assert.match(html,/나머지 7개 항목 보기/);assert.match(html,/T존/);assert.match(html,/U존/);
  assert.doesNotMatch(html,/class="result-portrait"|상위|좋아요|보통이에요|개선|악화|polygon/);
  input.items.reverse();assert.equal(renderResultCard({result:input}),html);
});

test('카드의 원본 이미지는 직접 올린 임시 주소만 허용한다',()=>{
  const input=result();
  const html=renderResultCard({result:input,photoUrl:'blob:http://127.0.0.1:4173/own-photo'});
  assert.match(html,/<img src="blob:http:\/\/127.0.0.1:4173\/own-photo" alt="이번 분석에 사용한 내 사진">/);
  for(const photoUrl of ['https://example.com/model.jpg','javascript:alert(1)','data:image/jpeg;base64,xxx','blob:http://localhost/" onerror="alert(1)'])assert.doesNotMatch(renderResultCard({result:input,photoUrl}),/class="result-portrait"/);
});

test('썸네일은 응답의 안전한 분석 이미지만 최대 세 장 표시한다',()=>{
  const input=result(),html=renderResultCard({result:input});
  assert.equal((html.match(/class="result-thumbnail"/g)??[]).length,3);
  assert.match(html,/aria-label="분석 결과 썸네일"/);
  assert.match(html,/loading="lazy" referrerpolicy="no-referrer"/);
  input.items.forEach(item=>{item.images=['https://untrusted.example/face.png','javascript:alert(1)'];delete item.image;});
  const unsafe=renderResultCard({result:input});
  assert.doesNotMatch(unsafe,/result-thumbnails|untrusted|javascript:/);
  assert.doesNotMatch(renderResultCard({reference:{date:today(),scores:{moisture:56.2}}}),/result-thumbnails/);
});

test('해석 실패와 비교 조건 미확인은 상세 화면을 열기 전에도 표시한다',()=>{
  const first=result();first.completedAt='2026-09-01T01:00:00Z';
  const data=EMPTY();data.skinCare.profile={feel:'balanced',concerns:[],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:null,updatedAt:'2026-09-01'};
  const saved=savePhotoObservation(data,first,'moisture');
  assert.doesNotMatch(renderResultCard({reference:saved.skinCare.observation,care:saved.skinCare,asOf:'2026-09-28'}),/비교 조건 미확인/);
  const next=result();next.completedAt='2026-09-15T01:00:00Z';next.items.find(item=>item.type==='acne').verified=false;
  const html=renderResultCard({result:next,care:saved.skinCare,asOf:'2026-09-28'});
  const warnings=html.slice(html.indexOf('<div class="result-warning-list">'));
  assert.match(warnings,/결과 해석 확인 필요/);assert.match(warnings,/비교 조건 미확인/);
  assert.doesNotMatch(warnings,/<details/);
  assert.ok(html.indexOf('result-warning-list')>html.lastIndexOf('</details>'));
});

test('없는 점수·나이를 채우지 않고 해석 실패와 0점도 확인 필요로 표시한다',()=>{
  const input={completedAt:new Date().toISOString(),items:[{type:'moisture',rawScore:0,verified:true},{type:'pore',rawScore:80,verified:false}]};
  const html=renderResultCard({result:input});
  assert.doesNotMatch(html,/종합 피부 점수|제공된 점수 없음|추정 피부 나이|<strong[^>]*>0<|>80</);
  assert.equal((html.match(/class="result-metric-missing"/g)??[]).length,2);
  assert.match(renderResultCard({reference:{date:'2026-09-23',scores:{moisture:56.2}}}),/56\.2/);
  assert.equal(renderResultCard({}),'');
});

test('결과 사진은 전송한 사진을 해당 결과에만 연결하고 만료·제거 때 해제한다',()=>{
  let clock=0,expire;const revoked=[];
  const photo=createResultPhoto({now:()=>clock,createUrl:()=> 'blob:http://localhost/own',revokeUrl:value=>revoked.push(value),schedule:callback=>{expire=callback;return 1;},cancel:()=>{}});
  photo.remember(new Blob(['photo']));assert.equal(photo.read('analysis-one'),'');
  photo.bind('analysis-one');assert.equal(photo.read('analysis-one'),'blob:http://localhost/own');assert.equal(photo.read('analysis-two'),'');
  photo.bind('analysis-two');assert.equal(photo.read('analysis-two'),'');assert.equal(revoked.length,1);
  photo.remember(new Blob(['new']));photo.bind('analysis-two');clock=1800000;assert.equal(photo.read('analysis-two'),'');assert.equal(revoked.length,2);
  photo.remember(new Blob(['next']));photo.bind('analysis-three');expire();assert.equal(photo.read('analysis-three'),'');assert.equal(revoked.length,3);
  photo.clear();assert.equal(revoked.length,3);
});

test('실제 화면 흐름은 분석 완료 후 내 사진을 유지하고 저장 자료에는 넣지 않는다',async()=>{
  const previous={document:globalThis.document,location:globalThis.location,createImageBitmap:globalThis.createImageBitmap};
  const urlMethods={createObjectURL:URL.createObjectURL,revokeObjectURL:URL.revokeObjectURL};
  const listeners={},fields={'photo-consent':{checked:true},'photo-overseas-consent':{checked:true},'photo-quality':{checked:true},'photo-save-consent':{checked:true}},revoked=[];
  let counter=0,started=false,data=EMPTY(),stored=null,sheetOpen=false,sheetContent='';
  data.skinCare.profile={feel:'balanced',concerns:[],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:null,updatedAt:today()};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  fields['photo-consent-error']={textContent:''};fields.editor={close(){sheetOpen=false;}};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:id=>fields[id]??null,querySelector:()=>sheetOpen?{querySelector:selector=>fields[selector.slice(1)]}:null,createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['prepared'],{type:'image/jpeg'}))})};
  globalThis.createImageBitmap=async()=>({width:800,height:1000,close(){}});
  URL.createObjectURL=()=>`blob:http://127.0.0.1:4173/photo-${++counter}`;URL.revokeObjectURL=value=>revoked.push(value);
  const input=normalizeAnalysis(source,Date.now,DEFAULT_PHOTO_ACTIONS);
  const ui=createPhotoUI({state:()=>({data,effective:data}),toast(){},dialog(_title,content){sheetOpen=true;sheetContent=content;},persist:async value=>{data=validateData(value);stored=JSON.stringify(data);return true;},photoFetch:async address=>{
    if(address.endsWith('/status'))return Response.json({accountScoped:true,analysisEnabled:true,analysisUsed:false});
    if(address.endsWith('/quote'))return Response.json({id:'test-quote',actions:DEFAULT_PHOTO_ACTIONS,credits:9,expiresAt:Date.now()+600000,consentVersion:PHOTO_CONSENT_VERSION});
    if(address.endsWith('/start')){started=true;return Response.json({});}
    return Response.json({used:started,job:started?{state:'success',result:input}:null});
  }});
  const click=action=>listeners.click({target:{closest:selector=>selector==='[data-photo]'?{dataset:{photo:action}}:null}});
  try{
    await click('connect');
    assert.match(ui.render(),/정면에서 얼굴을 크게\(가로 60% 초과\)/);
    assert.match(ui.render(),/촬영 방법 자세히 보기/);
    await listeners.change({target:{id:'photo-file',files:[new Blob(['input'],{type:'image/jpeg'})]}});
    await click('start');assert.equal(started,false);assert.match(sheetContent,/사진 분석을 위해 해외로 전송돼요/);
    fields['photo-overseas-consent'].checked=false;await click('confirm');assert.equal(started,false);
    fields['photo-overseas-consent'].checked=true;await click('confirm');assert.equal(started,true);
    assert.match(ui.render(),/<img src="blob:http:\/\/127.0.0.1:4173\/photo-2"/);assert.ok(revoked.includes('blob:http://127.0.0.1:4173/photo-1'));
    assert.match(ui.render(),/id="photo-result-details" >/);assert.match(ui.render(),/상세 리포트 보기/);
    await click('proposal');await click('apply');assert.doesNotMatch(stored,/blob:|photo-2|base64/);
    assert.match(ui.render(),/photo-2/);
    await click('clear');assert.ok(revoked.includes('blob:http://127.0.0.1:4173/photo-2'));assert.doesNotMatch(ui.render(),/<img src="blob:/);
  }finally{ui.reset();Object.assign(URL,urlMethods);for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('사진 조건 실패는 이유와 재업로드를 먼저 보여주고, 상태 미확인은 재업로드를 권하지 않는다',async()=>{
  const previousDocument=globalThis.document,previousBitmap=globalThis.createImageBitmap;
  const listeners={},requests=[],data=EMPTY();
  let reported={used:false,job:{state:'failed',code:'PHOTO_RETRY',message:'사진이 어두워요. 밝은 곳에서 다시 찍어 주세요.'}};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null,createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['prepared'],{type:'image/jpeg'}))})};
  globalThis.createImageBitmap=async()=>({width:800,height:1000,close(){}});
  const ui=createPhotoUI({state:()=>({data,effective:data}),toast(){},photoFetch:async address=>{
    requests.push(address);
    if(address.endsWith('/status'))return Response.json({accountScoped:true,analysisEnabled:true,analysisUsed:reported.used,access:{tier:'free',remaining:1,maxActions:4}});
    if(address.endsWith('/result'))return Response.json(reported);
    assert.fail('사진 분석이나 가격 조회를 요청하지 않아야 합니다.');
  }});
  const connect=()=>listeners.click({target:{closest:selector=>selector==='[data-photo]'?{dataset:{photo:'connect'}}:null}});
  try{
    await connect();
    const retry=ui.render();
    assert.match(retry,/role="alert">사진이 어두워요/);
    assert.ok(retry.indexOf('다른 사진 올리기')<retry.indexOf('분석 항목 고르기'));
    assert.equal((retry.match(/id="photo-file"/g)??[]).length,1);
    globalThis.createImageBitmap=async()=>{throw Error('browser-decode-detail');};
    await listeners.change({target:{id:'photo-file',files:[new Blob(['invalid'],{type:'image/jpeg'})]}});
    assert.match(ui.render(),/사진을 열지 못했어요. JPG 또는 PNG/);
    assert.doesNotMatch(ui.render(),/browser-decode-detail/);
    globalThis.createImageBitmap=async()=>({width:800,height:1000,close(){}});
    await listeners.change({target:{id:'photo-file',files:[new Blob(['input'],{type:'image/jpeg'})]}});
    assert.match(ui.render(),/사진을 준비했어요/);
    assert.doesNotMatch(ui.render(),/class="photo-retry"/);
    reported={used:true,job:{state:'uncertain',code:'TASK_STATUS_UNCONFIRMED',message:'결과 상태를 확인하지 못했어요. 다시 분석하지 말고 확인해 주세요.'}};
    await connect();
    assert.doesNotMatch(ui.render(),/다른 사진 올리기|id="photo-file"/);
    assert.match(ui.render(),/다시 분석하지 말고 확인해 주세요/);
    assert.equal(requests.filter(address=>address.endsWith('/start')).length,0);
  }finally{ui.reset();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previousBitmap;}
});

test('사진 전송 전 거절되면 상태를 다시 읽고 같은 화면에서 새 사진을 고를 수 있다',async()=>{
  const previousDocument=globalThis.document,previousBitmap=globalThis.createImageBitmap;
  const listeners={},fields={'photo-consent':{checked:true},'photo-overseas-consent':{checked:true},'photo-quality':{checked:true}},data=EMPTY();
  data.skinCare.profile={feel:'balanced',concerns:[],discomfort:'no',sensitivity:'rare',priority:'comfort',budget:null,updatedAt:today()};
  let sheetOpen=false,reported={used:false,job:null},starts=0;
  fields['photo-consent-error']={textContent:''};fields.editor={close(){sheetOpen=false;}};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:id=>fields[id]??null,querySelector:()=>sheetOpen?{querySelector:selector=>fields[selector.slice(1)]}:null,createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['prepared'],{type:'image/jpeg'}))})};
  globalThis.createImageBitmap=async()=>({width:800,height:1000,close(){}});
  const ui=createPhotoUI({state:()=>({data,effective:data}),toast(){},dialog(){sheetOpen=true;},photoFetch:async address=>{
    if(address.endsWith('/status'))return Response.json({accountScoped:true,analysisEnabled:true,analysisUsed:false,access:{tier:'free',remaining:1,maxActions:4}});
    if(address.endsWith('/result'))return Response.json(reported);
    if(address.endsWith('/quote'))return Response.json({id:'test-quote',actions:DEFAULT_PHOTO_ACTIONS,credits:9,expiresAt:Date.now()+600000,consentVersion:PHOTO_CONSENT_VERSION});
    if(address.endsWith('/start')){
      starts+=1;reported={used:false,job:{state:'failed',code:'PHOTO_RETRY',message:'사진을 읽지 못했어요. 다른 사진을 올려 주세요.'}};
      return Response.json({error:{code:'INVALID_PHOTO',message:'사진을 다시 골라 주세요.'}},{status:400});
    }
    assert.fail('예상하지 못한 분석 요청');
  }});
  const click=action=>listeners.click({target:{closest:selector=>selector==='[data-photo]'?{dataset:{photo:action}}:null}});
  try{
    await click('connect');
    await listeners.change({target:{id:'photo-file',files:[new Blob(['input'],{type:'image/jpeg'})]}});
    await click('start');await click('confirm');
    assert.equal(starts,1);
    assert.match(ui.render(),/사진을 읽지 못했어요/);
    assert.match(ui.render(),/다른 사진 올리기/);
    assert.equal((ui.render().match(/id="photo-file"/g)??[]).length,1);
  }finally{ui.reset();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previousBitmap;}
});
