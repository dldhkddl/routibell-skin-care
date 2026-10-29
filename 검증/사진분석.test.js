import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest, createServer } from 'node:http';
import { inspectPhoto, storageUrl, selectTrialCost, normalizeAnalysis, runSkinAnalysis, PHOTO_CONSENT, createAnalysisSession } from '../서버/유캠분석.js';
import { createPreparationServer } from '../서버/유캠준비.js';
import { PreparationError } from '../서버/유캠조회.js';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { buildSkinPlan, capturePlan, emptyCare, saveDaily } from '../화면/피부계산.js';
import { photoReference, validatePhotoReference, photoResultUrl } from '../화면/사진계산.js';
import { readData, writeData } from '../화면/저장.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { createAppService } from '../서버/앱서버.js';
import { createAccountClient } from '../화면/계정연결.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { createFakePaymentProvider } from '../서버/결제창구.js';

const fakeKey = 'local-test-only-not-a-real-key';
const storage = 'https://yce-us.s3-accelerate.amazonaws.com';
const actions = ['redness','pore','texture'];
const sku = extra => ({ description:'AI Skin Analysis V2.1 SD (1-4 concerns)', amount:9, unit:'result_image', proc_unit:1, run_task_url:'https://yce-api-01.makeupar.com/s2s/v2.1/task/skin-analysis', ...extra });
const pricePage = extra => Response.json({status:200,result:{skus:[sku(extra)],next_token:null}});
const resultPayload = () => ({status:200,data:{task_status:'success',error:null,results:{output:[...actions.map((type,index)=>({type,raw_score:[82,39,76][index],ui_score:90,mask_urls:[`${storage}/fixture/${type}.jpg`]})),{type:'skin_age',score:28},{type:'all',score:80}]}}});
const headerFixture = (width=640,height=800) => {
  const bytes=Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.write('IHDR',12); bytes.writeUInt32BE(width,16); bytes.writeUInt32BE(height,20); return bytes;
};
const code = expected => issue => issue.code === expected;
function provider(extra={}) {
  const calls=[];
  const fetchImpl=async (address,options={})=>{
    const url=new URL(address); calls.push({url:url.href,method:options.method,headers:options.headers,body:typeof options.body==='string'?options.body:undefined});
    if(extra.intercept){const intercepted=await extra.intercept(url,options,calls);if(intercepted)return intercepted;}
    if(url.pathname.endsWith('feature-cost'))return pricePage();
    if(url.pathname==='/s2s/v2.0/file') {
      const file=JSON.parse(options.body).files[0];
      return Response.json({status:200,data:{files:[{file_id:'fixture-file-id',requests:[{method:'PUT',url:`${storage}/fixture/upload`,headers:{'Content-Type':file.content_type,'Content-Length':String(file.file_size)}}]}]}});
    }
    if(options.method==='PUT')return new Response(null,{status:200});
    if(url.pathname==='/s2s/v2.1/task/skin-analysis')return Response.json({status:200,data:{task_id:'fixture-task-id'}});
    if(url.pathname==='/s2s/v2.1/task/skin-analysis/fixture-task-id')return Response.json(resultPayload());
    if(url.pathname==='/s2s/v2.0/task/delete')return Response.json({status:200});
    if(url.hostname==='yce-us.s3-accelerate.amazonaws.com')return new Response(Buffer.from([0xff,0xd8,0xff,0xd9]),{status:200,headers:{'Content-Type':'image/jpeg'}});
    assert.fail('명세에 없는 요청');
  };
  return {calls,fetchImpl};
}
const options=mock=>({bytes:headerFixture(),type:'image/png',apiKey:fakeKey,quotedCredits:9,fetchImpl:mock.fetchImpl,signal:new AbortController().signal,sleep:async()=>{}});

test('전송 전 파일 형식·크기·픽셀 경계 검사 (실제 사진 대신 합성 헤더)',()=>{
  assert.deepEqual(inspectPhoto(headerFixture(),'image/png'),{width:640,height:800});
  for(const [bytes,type] of [[headerFixture(479,800),'image/png'],[headerFixture(600,2561),'image/png'],[Buffer.from('<svg/>'),'image/png'],[headerFixture(),'image/jpeg'],[Buffer.alloc(10000000),'image/png']])assert.throws(()=>inspectPhoto(bytes,type),code('INVALID_PHOTO'));
});

test('업로드·결과 주소는 문서의 HTTPS 스토리지 호스트만 허용',()=>{
  assert.equal(storageUrl(`${storage}/photo?signature=example`),`${storage}/photo?signature=example`);
  for(const address of ['http://127.0.0.1/a','https://127.0.0.1/a','https://evil.example/a',`${storage}.evil.example/a`,'https://user:contact@example.com/a',`${storage}:444/a`,'data:image/png,abc']){
    assert.throws(()=>storageUrl(address));assert.throws(()=>photoResultUrl(address));
  }
});

test('가격은 정확한 버전·해상도·구간·단위·9크레딧 이하를 확인',()=>{
  const item={description:sku().description,version:'v2.1',credits:9,unit:'result_image',quantity:1};
  assert.equal(selectTrialCost({items:[item]}),9);
  for(const change of [{version:'v2.0'},{description:'AI Skin Analysis V2.1 HD (1-4 concerns)'},{description:'AI Skin Analysis V2.1 SD (5-8 concerns)'},{credits:12},{credits:-1},{credits:NaN},{unit:'second'},{quantity:2}])assert.throws(()=>selectTrialCost({items:[{...item,...change}]}),code('PRICE_UNCONFIRMED'));
  assert.throws(()=>selectTrialCost({items:[item,item]}));
});

test('분석은 결과 이미지를 확보한 뒤 작업·파일 삭제를 요청하며 키를 저장소에 보내지 않는다',async()=>{
  const mock=provider(),input=options(mock),result=await runSkinAnalysis(input);
  assert.deepEqual(mock.calls.map(call=>call.method),['GET','POST','PUT','POST','GET','GET','GET','GET','POST']);
  const task=JSON.parse(mock.calls[3].body);
  assert.deepEqual(task.dst_actions,actions);assert.equal(task.format,'json');assert.equal(task.pf_camera_kit,false);assert.equal(task.miniserver_args.enable_mask_overlay,true);
  assert.equal(mock.calls[2].headers.Authorization,undefined);
  assert.equal(mock.calls[0].headers.Authorization,`Bearer ${fakeKey}`);
  assert.equal(mock.calls[5].headers,undefined);
  assert.equal(mock.calls.at(-1).url,'https://yce-api-01.makeupar.com/s2s/v2.0/task/delete');
  assert.equal(JSON.parse(mock.calls.at(-1).body).task_id,'fixture-task-id');
  assert.equal(input.bytes.every(byte=>byte===0),true);
  assert.equal(result.items.length,3);assert.equal(result.items[1].rawScore,39);
  assert.ok(result.items[0].image.startsWith('data:image/jpeg;base64,'));
  assert.equal(photoResultUrl(result.items[0].image),result.items[0].image);
  assert.doesNotMatch(JSON.stringify(result),/skin_age|ui_score|fixture-task-id|fixture-file-id|local-test-only/);
  assert.deepEqual(result.summary,{overallScore:80,skinAge:28});
});

test('피부 타입 세 영역 JSON 응답은 추가 분석 없이 각각 분류·이미지로 정규화한다',async()=>{
  const output=['whole','t_zone','u_zone'].map((region,index)=>({type:'skin_type',region,skin_type:['Combination','Oily','Dry & Redness'][index],mask_urls:[`${storage}/fixture/skin_type_${region}.jpg`]}));
  const mock=provider({intercept:url=>url.pathname.endsWith('fixture-task-id')?Response.json({status:200,data:{task_status:'success',results:{output}}}):null});
  const result=await runSkinAnalysis({...options(mock),actions:['skin_type']});
  assert.equal(mock.calls.filter(call=>call.url.endsWith('/task/skin-analysis')).length,1);
  assert.deepEqual(result.items[0].skinTypes,{whole:'Combination',t_zone:'Oily',u_zone:'Dry & Redness'});
  assert.equal(result.items[0].verified,true);
  assert.equal(result.items[0].images.length,3);
  assert.deepEqual(photoReference(result,'skin_type').skinTypes,result.items[0].skinTypes);
});

test('원격 삭제 실패에도 확보한 결과는 유지하고 민감 정보는 로그에 남기지 않는다',async()=>{
  const mock=provider({intercept:url=>url.pathname==='/s2s/v2.0/task/delete'?new Response(null,{status:500}):null});
  const previous=console.warn,logs=[];console.warn=(...values)=>logs.push(values.join(' '));
  try{
    const result=await runSkinAnalysis(options(mock));
    assert.equal(result.items.length,3);
    assert.equal(mock.calls.filter(call=>call.url.endsWith('/task/delete')).length,1);
    assert.match(logs.join(' '),/삭제 요청 실패/);
    assert.doesNotMatch(logs.join(' '),/fixture-task-id|fixture-file-id|local-test-only|https?:\/\//);
  }finally{console.warn=previous;}
});

test('가격 변경·초과 때는 사진 업로드와 작업 생성 없음',async()=>{
  for(const amount of [8,10]){
    const mock=provider({intercept:url=>url.pathname.endsWith('feature-cost')?pricePage({amount}):null});
    await assert.rejects(runSkinAnalysis(options(mock)));assert.equal(mock.calls.length,1);
  }
});

test('변조 업로드 주소·헤더·실패는 분석 전 차단, 공급자 오류·키를 노출하지 않음',async()=>{
  for(const upload of [{method:'PUT',url:'http://127.0.0.1/private',headers:{}},{method:'PUT',url:`${storage}/a`,headers:{Authorization:fakeKey}},{method:'POST',url:`${storage}/a`,headers:{}}]){
    const mock=provider({intercept:url=>url.pathname.endsWith('/file')?Response.json({status:200,data:{files:[{file_id:'id',requests:[upload]}]}}):null});
    await assert.rejects(runSkinAnalysis(options(mock)),issue=>!issue.message.includes(fakeKey));
    assert.equal(mock.calls.length,2);
  }
  for(const failMethod of ['PUT','POST']){
    const mock=provider({intercept:(url,opts)=>opts.method===failMethod&&(failMethod==='PUT'||url.pathname.endsWith('skin-analysis'))?new Response(fakeKey,{status:500}):null});
    await assert.rejects(runSkinAnalysis(options(mock)),issue=>!issue.message.includes(fakeKey));
    assert.equal(mock.calls.filter(call=>call.url.endsWith('skin-analysis')).length,failMethod==='PUT'?0:1);
  }
});

test('타임아웃·응답 유실·결과 누락에서도 유료 작업 POST는 재시도하지 않음',async()=>{
  const mock=provider({intercept:url=>{if(url.pathname.endsWith('skin-analysis'))throw Error(fakeKey);}});
  await assert.rejects(runSkinAnalysis(options(mock)));
  assert.equal(mock.calls.filter(call=>call.url.endsWith('skin-analysis')).length,1);
  const running=provider({intercept:url=>url.pathname.endsWith('fixture-task-id')?Response.json({status:200,data:{task_status:'running'}}):null});
  await assert.rejects(runSkinAnalysis(options(running)),code('ANALYSIS_TIMEOUT'));
  assert.equal(running.calls.filter(call=>call.method==='GET'&&call.url.endsWith('fixture-task-id')).length,18);
  const result=resultPayload();result.data.results.output.splice(1,1);const partial=normalizeAnalysis(result);assert.equal(partial.items[1].verified,false);assert.throws(()=>photoReference(partial,'pore'));
  const echoed=provider({intercept:url=>{
    if(!url.pathname.endsWith('fixture-task-id'))return null;
    const result=resultPayload();result.data.results.output[0].mask_urls=[`${storage}/unexpected/${fakeKey}`];return Response.json(result);
  }});
  await assert.rejects(runSkinAnalysis(options(echoed)),issue=>issue.code==='INVALID_RESULT'&&!issue.message.includes(fakeKey));
});

test('피부 분석·공통 사진 오류는 원인별 재업로드 문구로 안내하고 서비스 오류와 구분',async()=>{
  const previous=console.warn,logs=[];console.warn=(...values)=>logs.push(values.join(' '));
  try{
    const photoCases=[
      ['error_below_min_image_size','480px 이상'],
      ['error_exceed_max_image_size','크기를 줄인 사진'],
      ['error_src_face_too_small','얼굴이 사진 가로폭의 60%보다 크게'],
      ['error_src_face_out_of_bound','얼굴 전체가 사진 안에'],
      ['error_lighting_dark','밝은 곳'],
      ['exceed_max_filesize','10MB 미만'],
      ['error_decode_image','JPG 또는 PNG'],
      ['error_no_face','얼굴을 찾지 못했어요'],
      ['error_pose','고개를 바로'],
      ['error_face_parsing','앞머리나 손'],
      ['error_multiple_people','본인 한 명만'],
      ['error_large_face_angle','카메라를 똑바로'],
      ['error_unsupport_ratio','세로 사진'],
      ['error_nsfw_content_detected','다른 정면 사진'],
    ];
    const serviceCases=[
      ['exceed_nsfw_retry_limits','같은 사진을 반복해서'],
      ['error_download_image','사용 내역을 확인'],
      ['error_download_mask','사용 내역을 확인'],
      ['error_decode_mask','사용 내역을 확인'],
      ['error_upload','사용 내역을 확인'],
      ['error_inference','사용 내역을 확인'],
      ['invalid_parameter','연결 상태를 확인'],
      ['unknown_internal_error','사용 내역을 확인'],
      [fakeKey,'새 분석 전에 사용 내역을 확인'],
    ];
    for(const [reason,expected] of [...photoCases,...serviceCases]){
      const mock=provider({intercept:url=>url.pathname.endsWith('fixture-task-id')?Response.json({status:200,data:{task_status:'error',error:reason,error_message:fakeKey}}):null});
      const expectedCode=photoCases.some(([photoCode])=>photoCode===reason)?'PHOTO_RETRY':'TASK_FAILED';
      await assert.rejects(runSkinAnalysis(options(mock)),issue=>issue.code===expectedCode&&issue.message.includes(expected)&&!issue.message.includes(fakeKey)&&!issue.message.includes(reason));
      assert.equal(mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,1);
      assert.equal(mock.calls.filter(call=>call.url.endsWith('/task/delete')).length,1);
    }
    const unknown=provider({intercept:url=>url.pathname.endsWith('fixture-task-id')?Response.json({status:200,data:{task_status:'unrecognized'}}):null});
    await assert.rejects(runSkinAnalysis(options(unknown)),code('TASK_STATUS_UNCONFIRMED'));
    assert.equal(unknown.calls.filter(call=>call.url.endsWith('/task/delete')).length,1);
    assert.doesNotMatch(logs.join(' '),/local-test-only|https?:\/\/|fixture-task-id/);
  }finally{console.warn=previous;}
});

test('세션 허용·동의·견적 유효성·중복 요청·결과 삭제 후에도 단일 실행 잠금',async context=>{
  const mock=provider();let timestamp=Date.now();
  const session=createAnalysisSession({apiKey:fakeKey,enabled:true,fetchImpl:mock.fetchImpl,now:()=>timestamp,sleep:async()=>{}});
  context.after(()=>session.close());
  const quote=await session.quote();
  await assert.rejects(session.reserve(quote.id,'wrong',PHOTO_CONSENT),code('PHOTO_CONSENT_REQUIRED'));
  await assert.rejects(session.reserve(quote.id,PHOTO_CONSENT,undefined),code('OVERSEAS_CONSENT_REQUIRED'));
  await assert.rejects(session.reserve('wrong',PHOTO_CONSENT,PHOTO_CONSENT),code('QUOTE_EXPIRED'));
  timestamp+=600001;await assert.rejects(session.reserve(quote.id,PHOTO_CONSENT,PHOTO_CONSENT),code('QUOTE_EXPIRED'));
  const current=await session.quote();await session.reserve(current.id,PHOTO_CONSENT,PHOTO_CONSENT);
  await assert.rejects(session.reserve(current.id,PHOTO_CONSENT,PHOTO_CONSENT),code('ANALYSIS_USED'));
  await session.start(headerFixture(),'image/png');
  for(let poll=0;poll<20&&(await session.status()).job.state==='running';poll+=1)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await session.status()).job.state,'success');await session.clear();
  assert.equal((await session.status()).job,null);assert.equal((await session.status()).used,true);
  await assert.rejects(session.reserve(current.id,PHOTO_CONSENT,PHOTO_CONSENT),code('ANALYSIS_USED'));
});

async function localServer(context, enabled=true) {
  const mock=provider();
  const server=createPreparationServer({env:{YOUCAM_API_KEY:fakeKey,YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:enabled?'1':'0'},fetchImpl:mock.fetchImpl,sleep:async()=>{},verifyAccount:async ticket=>{if(ticket==='test-account-one')return 'account-one';if(ticket==='test-account-two')return 'account-two';throw new PreparationError('ACCOUNT_REQUIRED','계정 로그인 필요',401);}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  context.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const status=await(await fetch(`${base}/api/status`)).json();
  const send=(path,method='GET',body,headers={})=>new Promise((resolve,reject)=>{
    const outgoing=httpRequest(`${base}${path}`,{method,headers:{Origin:'http://127.0.0.1:4173','X-Local-Token':status.localToken,'X-Photo-Account':'test-account-one',...headers}},incoming=>{
      const chunks=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>resolve({status:incoming.statusCode,headers:incoming.headers,text:Buffer.concat(chunks).toString()}));incoming.on('error',reject);
    });outgoing.on('error',reject);outgoing.end(body);
  });
  return {mock,send};
}

test('앱 통신은 명시적 로컬 Origin·토큰·동의만 허용하고 GET은 외부 호출하지 않음',async context=>{
  const local=await localServer(context);
  const result=await local.send('/api/analysis/result');assert.equal(result.status,200);assert.equal(local.mock.calls.length,0);
  assert.equal(result.headers['access-control-allow-origin'],'http://127.0.0.1:4173');
  for(const headers of [{Origin:'https://evil.example'},{Origin:'null'},{'X-Local-Token':'wrong'},{Origin:'http://127.0.0.1:4175'}])assert.equal((await local.send('/api/analysis/quote','POST','{"consent":true}',{'Content-Type':'application/json',...headers})).status,403);
  assert.equal((await local.send('/api/analysis/start','POST',headerFixture(),{'Content-Type':'image/png'})).status,400);
  assert.equal(local.mock.calls.length,0);
  const preflight=await local.send('/api/analysis/start','OPTIONS',undefined,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-local-token,x-photo-consent,x-quote-id'});
  assert.equal(preflight.status,204);
});

test('기본 비활성 서버는 사진 분석 차단',async context=>{
  const local=await localServer(context,false);
  assert.equal((await local.send('/api/analysis/quote','POST','{"consent":true}',{'Content-Type':'application/json'})).status,403);
  assert.equal(local.mock.calls.length,0);
});

test('사진 결과·견적·삭제는 계정별로 분리되고 미로그인은 차단한다',async context=>{
  const local=await localServer(context);
  assert.equal((await local.send('/api/analysis/result','GET',undefined,{'X-Photo-Account':''})).status,401);
  const first=await local.send('/api/analysis/quote','POST','{"consent":true}',{'Content-Type':'application/json'});assert.equal(first.status,200);
  const otherHeaders={'Content-Type':'application/json','X-Photo-Account':'test-account-two'};
  assert.equal(JSON.parse((await local.send('/api/status','GET',undefined,otherHeaders)).text).analysisUsed,false);
  assert.equal(JSON.parse((await local.send('/api/analysis/result','GET',undefined,otherHeaders)).text).job,null);
  assert.equal((await local.send('/api/analysis/quote','POST','{"consent":true}',otherHeaders)).status,200);
  assert.equal((await local.send('/api/analysis/clear','POST','{"consent":true}',otherHeaders)).status,200);
  assert.equal((await local.send('/api/analysis/result')).status,200);
});

test('HTTP 승인 후 비동기 결과 복구·연속 클릭 차단·기존 결과 조회는 새 작업 아님',async context=>{
  const local=await localServer(context);
  const quoted=await local.send('/api/analysis/quote','POST','{"consent":true}',{'Content-Type':'application/json'});
  assert.equal(quoted.status,200);const quote=JSON.parse(quoted.text);
  const headers={'Content-Type':'image/png','X-Quote-Id':quote.id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT};
  const before=local.mock.calls.length;
  const without=await local.send('/api/analysis/start','POST',headerFixture(),{...headers,'X-Overseas-Consent':''});
  assert.equal(without.status,400);assert.equal(JSON.parse(without.text).error.code,'OVERSEAS_CONSENT_REQUIRED');
  const outdated=await local.send('/api/analysis/start','POST',headerFixture(),{...headers,'X-Overseas-Consent':'youcam-sd-selection-30days-v2'});
  assert.equal(outdated.status,400);assert.equal(local.mock.calls.length,before);
  const first=await local.send('/api/analysis/start','POST',headerFixture(),headers);assert.equal(first.status,202);
  assert.equal((await local.send('/api/analysis/start','POST',headerFixture(),headers)).status,409);
  let final;
  for(let poll=0;poll<20;poll+=1){final=await local.send('/api/analysis/result');if(JSON.parse(final.text).job.state==='success')break;await new Promise(resolve=>setImmediate(resolve));}
  assert.equal(JSON.parse(final.text).job.state,'success');
  const calls=local.mock.calls.length;await local.send('/api/analysis/result');assert.equal(local.mock.calls.length,calls);
  assert.doesNotMatch(final.text,/local-test-only|ui_score|skin_age/);
});

const fixture=()=>({...EMPTY(),skinCare:{...emptyCare(),profile:{feel:'dry',sensitivity:'rare',discomfort:'no',concerns:[],priority:'save',budget:0,updatedAt:today()}}});

async function unlockTrial(...clients){
  const dates=[2,1,0].map(offset=>{const date=new Date(`${today()}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10);});
  for(const date of dates){
    clients[0].setServerDate(date);
    await Promise.all(clients.map(async client=>{
      const data=await client.account.read();
      await client.account.write({...data,skinCare:{...data.skinCare,profile:data.skinCare.profile??fixture().skinCare.profile,checkins:[...data.skinCare.checkins,{date,feeling:'comfortable',adherence:'yes',memo:''}]}});
    }));
  }
}

async function integratedApp(context,env={YOUCAM_API_KEY:fakeKey,YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:'1'},dbPath=':memory:',extras={}){
  const mock=provider({intercept:extras.intercept});let service,clock=Date.parse(`${today()}T12:00:00Z`);
  const server=createServer((request,response)=>service.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  service=createAppService({dbPath,origins:[origin],env,fetchImpl:mock.fetchImpl,sleep:async()=>{},now:extras.now??(()=>clock),paymentProvider:extras.paymentProvider});
  let stopped=false;
  async function stop(){
    if(stopped)return;
    stopped=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();
  }
  context.after(stop);
  function client(){
    let cookie='';const requests=[];
    const account=createAccountClient({fetchImpl:async(path,options={})=>{
      const headers={...(path.startsWith('/api/account/')||options.method==='POST'?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...options.headers};
      requests.push({path,headers});
      const response=await fetch(`${origin}${path}`,{...options,headers});
      if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      return response;
    }});
    return {account,requests,setServerDate:date=>{clock=Date.parse(`${date}T12:00:00Z`);}};
  }
  return {origin,mock,client,stop};
}

test('무료 체험은 서버가 받은 서로 다른 날만 세고 과거 날짜를 채워도 열리지 않는다',async context=>{
  const app=await integratedApp(context,{YOUCAM_API_KEY:'',YOUCAM_ALLOW_ANALYSIS:'0',YOUCAM_ALLOW_LOOKUP:'0'});
  const client=app.client();
  const dates=[2,1,0].map(offset=>{const value=new Date(`${today()}T12:00:00Z`);value.setUTCDate(value.getUTCDate()-offset);return value.toISOString().slice(0,10);});
  client.setServerDate(dates[0]);
  await client.account.authenticate('register',{username:'trial-server-days',password:'test-pass',consent:true,ageConfirmed:true});
  let data=await client.account.read();
  data.skinCare.profile=fixture().skinCare.profile;
  data.skinCare.checkins=[3,4,5].map(offset=>{const value=new Date(`${dates[0]}T12:00:00Z`);value.setUTCDate(value.getUTCDate()-offset);return {date:value.toISOString().slice(0,10),feeling:'comfortable',adherence:'yes',memo:''};});
  await client.account.write(data);
  assert.equal((await client.account.subscription()).access.completedCheckinDays,0);
  for(const [index,date] of dates.entries()){
    client.setServerDate(date);
    if(index)await client.account.authenticate('login',{username:'trial-server-days',password:'test-pass'});
    data=await client.account.read();
    await client.account.write(saveDaily(data,'morning',true,date));
    const access=(await client.account.subscription()).access;
    assert.equal(access.completedCheckinDays,index+1);
    assert.equal(access.trialLocked,index<2);
  }
  assert.equal(app.mock.calls.length,0);
});

test('유캠 작업 실패는 분석 횟수를 돌려주고, 상태 미확인은 재요청을 막는다',async context=>{
  for(const [taskStatus,expectedState,expectedRemaining] of [['error','failed',1],['unrecognized','uncertain',0]]){
    const app=await integratedApp(context,undefined,':memory:',{
      intercept:url=>url.pathname.endsWith('fixture-task-id')?Response.json({status:200,data:{task_status:taskStatus,error:'error_lighting_dark'}}):null,
    });
    const client=app.client();
    await client.account.authenticate('register',{username:`task-${taskStatus}`,password:'test-pass',consent:true,ageConfirmed:true});
    await unlockTrial(client);
    const status=await(await client.account.photoFetch('/api/youcam/status')).json();
    const headers={'X-Local-Token':status.localToken};
    const quote=await(await client.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"consent":true}'})).json();
    const started=await client.account.photoFetch('/api/youcam/analysis/start',{method:'POST',headers:{...headers,'Content-Type':'image/png','X-Quote-Id':quote.id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT},body:headerFixture()});
    assert.equal(started.status,202);
    let result;
    for(let poll=0;poll<30;poll++){
      result=await(await client.account.photoFetch('/api/youcam/analysis/result',{headers})).json();
      if(result.job?.state===expectedState)break;
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(result.job?.state,expectedState);
    if(taskStatus==='error')assert.equal(result.job?.code,'PHOTO_RETRY');
    assert.equal(result.access.remaining,expectedRemaining);
    assert.equal(app.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,1);
  }
});

test('전송 전 잘못된 사진은 유캠 작업 없이 분석 횟수를 돌려주고 재업로드를 허용한다',async context=>{
  const app=await integratedApp(context);
  const client=app.client();
  await client.account.authenticate('register',{username:'invalid-photo-retry',password:'test-pass',consent:true,ageConfirmed:true});
  await unlockTrial(client);
  const status=await(await client.account.photoFetch('/api/youcam/status')).json();
  const headers={'X-Local-Token':status.localToken};
  const quote=await(await client.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"consent":true}'})).json();
  const response=await client.account.photoFetch('/api/youcam/analysis/start',{method:'POST',headers:{...headers,'Content-Type':'image/png','X-Quote-Id':quote.id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT},body:headerFixture(479,800)});
  assert.equal(response.status,400);
  const result=await(await client.account.photoFetch('/api/youcam/analysis/result',{headers})).json();
  assert.equal(result.used,false);
  assert.equal(result.access.remaining,1);
  assert.equal(result.job?.state,'failed');
  assert.equal(result.job?.code,'PHOTO_RETRY');
  assert.equal(app.mock.calls.filter(call=>call.url.endsWith('/skin-analysis')).length,0);
});

test('공개 상태 점검은 DB 연결까지 확인하고 사진 분석을 실행하지 않는다',async context=>{
  const app=await integratedApp(context,{});
  const response=await fetch(`${app.origin}/api/health`);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(app.mock.calls.length,0);
});

test('두 계정이 동시에 모의 분석하고 서버 재시작 뒤에도 각자 사용 상태와 결과를 읽는다',async context=>{
  const directory=mkdtempSync(join(tmpdir(),'routibell-photo-'));
  const dbPath=join(directory,'accounts.sqlite');
  const firstServer=await integratedApp(context,undefined,dbPath);
  try{
    const first=firstServer.client(),second=firstServer.client();
    await Promise.all([
      first.account.authenticate('register',{username:'parallel-first',password:'test-pass',consent:true,ageConfirmed:true}),
      second.account.authenticate('register',{username:'parallel-second',password:'test-pass',consent:true,ageConfirmed:true}),
    ]);
    await unlockTrial(first,second);
    const accounts=[first,second];
    const status=await Promise.all(accounts.map(async client=>(await client.account.photoFetch('/api/youcam/status')).json()));
    const quotes=await Promise.all(accounts.map(async(client,index)=>(await client.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{'X-Local-Token':status[index].localToken,'Content-Type':'application/json'},body:'{"consent":true}'})).json()));
    const starts=await Promise.all(accounts.map((client,index)=>client.account.photoFetch('/api/youcam/analysis/start',{method:'POST',headers:{'X-Local-Token':status[index].localToken,'Content-Type':'image/png','X-Quote-Id':quotes[index].id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT},body:headerFixture()})));
    assert.deepEqual(starts.map(response=>response.status),[202,202]);
    for(const [index,client] of accounts.entries()){
      let state;
      for(let poll=0;poll<30;poll++){
        state=await(await client.account.photoFetch('/api/youcam/analysis/result',{headers:{'X-Local-Token':status[index].localToken}})).json();
        if(state.job?.state==='success')break;
        await new Promise(resolve=>setImmediate(resolve));
      }
      assert.equal(state.job?.state,'success');
    }
    assert.equal(firstServer.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,2);
    await firstServer.stop();
    const database=new DatabaseSync(dbPath,{readOnly:true});
    try{
      const encrypted=database.prepare('SELECT job FROM photo_usage').all();
      assert.equal(encrypted.length,2);
      for(const row of encrypted){assert.equal(row.job.includes('data:image'),false);assert.equal(row.job.includes('"state"'),false);}
    }finally{database.close();}
    const restarted=await integratedApp(context,undefined,dbPath);
    try{
      for(const username of ['parallel-first','parallel-second']){
        const client=restarted.client();
        await client.account.authenticate('login',{username,password:'test-pass'});
        const resumed=await(await client.account.photoFetch('/api/youcam/status')).json();
        assert.equal(resumed.analysisUsed,true);
        const result=await(await client.account.photoFetch('/api/youcam/analysis/result',{headers:{'X-Local-Token':resumed.localToken}})).json();
        assert.equal(result.job?.state,'success');
      }
      assert.equal(restarted.mock.calls.length,0);
    }finally{await restarted.stop();}
  }finally{
    await firstServer.stop();
    const target=resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir())+sep));
    rmSync(target,{recursive:true,force:true});
  }
});

test('통합 서버는 앱과 사진 API를 같은 주소로 제공하고 시작·GET에서 외부 호출하지 않는다',async context=>{
  const local=await integratedApp(context),first=local.client();
  assert.equal(local.mock.calls.length,0);
  const anonymous=await fetch(`${local.origin}/api/youcam/status`);
  assert.equal(anonymous.status,401);assert.doesNotMatch(await anonymous.text(),/localToken|local-test-only/);
  await first.account.authenticate('register',{username:'integrated-one',password:'test-pass',consent:true,ageConfirmed:true});
  assert.deepEqual(await first.account.photoConnection(),{path:'/api/youcam'});
  const statusResponse=await first.account.photoFetch('/api/youcam/status'),status=await statusResponse.json();
  assert.equal(status.analysisEnabled,true);assert.equal(status.accountScoped,true);
  assert.equal(statusResponse.headers.get('access-control-allow-origin'),null);
  assert.equal(first.requests.at(-1).headers.Origin,undefined);
  assert.doesNotMatch(JSON.stringify(status),/local-test-only/);
  const headers={'X-Local-Token':status.localToken};
  assert.equal((await first.account.photoFetch('/api/youcam/analysis/result',{headers})).status,200);
  assert.equal(local.mock.calls.length,0);
  for(const address of ['https://evil.example/api/status','//evil.example/api/youcam/status','http://127.0.0.1:4174/api/status','/api/youcam/status?key=anything'])await assert.rejects(first.account.photoFetch(address),code('INVALID_PHOTO_SERVER'));
  const ticket=first.requests.find(request=>request.path==='/api/youcam/status').headers['X-Photo-Account'];
  for(const extra of [{Origin:'https://evil.example'},{Origin:'null'},{Host:'evil.example'},{'Sec-Fetch-Site':'cross-site'}]){
    const status=await new Promise((resolve,reject)=>{
      const outgoing=httpRequest(`${local.origin}/api/youcam/status`,{headers:{'X-Photo-Account':ticket,...extra}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));response.on('error',reject);});
      outgoing.on('error',reject);outgoing.end();
    });
    assert.equal(status,403,JSON.stringify(extra));
  }
  const denied=await first.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"consent":false}'});
  assert.equal(denied.status,400);assert.equal(local.mock.calls.length,0);
  await first.account.logout();
  assert.equal((await fetch(`${local.origin}/api/youcam/status`,{headers:{'X-Photo-Account':ticket}})).status,401);
});

test('통합 서버는 키 또는 허용 설정이 없으면 기록 저장만 제공하고 유캠 호출은 차단한다',async context=>{
  for(const env of [{},{YOUCAM_API_KEY:fakeKey},{YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:'1'}]){
    const local=await integratedApp(context,env),first=local.client();
    await first.account.authenticate('register',{username:'integrated-off',password:'test-pass',consent:true,ageConfirmed:true});
    await first.account.read();await first.account.write(fixture());
    const status=await(await first.account.photoFetch('/api/youcam/status')).json();assert.equal(status.analysisEnabled,false);
    const response=await first.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{'X-Local-Token':status.localToken,'Content-Type':'application/json'},body:'{"consent":true}'});
    assert.equal(response.status,403);assert.equal(local.mock.calls.length,0);
    assert.deepEqual(await first.account.read(),validateData(fixture()));
  }
});

test('통합 서버의 모의 분석은 단일 작업·계정 소유권·관찰 저장·재로그인 복원을 유지한다',async context=>{
  const local=await integratedApp(context),first=local.client(),second=local.client();
  await first.account.authenticate('register',{username:'integrated-owner',password:'test-pass',consent:true,ageConfirmed:true});
  await second.account.authenticate('register',{username:'integrated-other',password:'test-pass',consent:true,ageConfirmed:true});
  await unlockTrial(first);
  const status=await(await first.account.photoFetch('/api/youcam/status')).json();
  const headers={'X-Local-Token':status.localToken};
  const quote=await(await first.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"consent":true}'})).json();
  assert.equal(quote.credits,9);
  assert.equal((await second.account.photoFetch('/api/youcam/status')).status,200);
  const input={method:'POST',headers:{...headers,'Content-Type':'image/png','X-Quote-Id':quote.id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT},body:headerFixture()};
  assert.equal((await first.account.photoFetch('/api/youcam/analysis/start',input)).status,202);
  assert.equal((await first.account.photoFetch('/api/youcam/analysis/start',input)).status,402);
  let state;
  for(let poll=0;poll<20;poll++){
    state=await(await first.account.photoFetch('/api/youcam/analysis/result',{headers})).json();
    if(state.job?.state==='success')break;
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(state.job.state,'success');
  assert.equal(local.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,1);
  const exhausted=await first.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"consent":true}'});
  assert.equal(exhausted.status,402);
  assert.equal(local.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,1);
  await first.account.read();
  const reference=photoReference(state.job.result,'redness');
  const next=capturePlan({...fixture(),skinCare:{...fixture().skinCare,observation:reference}},'observation');
  await first.account.write(next);await first.account.logout();
  await first.account.authenticate('login',{username:'integrated-owner',password:'test-pass'});
  assert.deepEqual((await first.account.read()).skinCare.observation,reference);
  assert.equal((await second.account.read()).skinCare.observation,undefined);
  const resumed=await(await first.account.photoFetch('/api/youcam/status')).json();assert.equal(resumed.analysisUsed,true);
  assert.equal(local.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,1);
});

test('검증된 구독 계정만 16개 항목을 두 번 요청하고 세 번째는 유캠 호출 전에 차단한다',async context=>{
  let clock=Date.parse('2026-09-29T10:00:00Z');
  const now=()=>clock,paymentProvider=createFakePaymentProvider({now});
  const local=await integratedApp(context,{YOUCAM_API_KEY:fakeKey,YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:'1',PAYMENTS_ENABLED:'true'},':memory:',{
    now,paymentProvider,
    intercept:url=>url.pathname.endsWith('feature-cost')?pricePage({description:'AI Skin Analysis V2.1 SD (13-16 concerns)',amount:16}):null,
  });
  const client=local.client();
  await client.account.authenticate('register',{username:'paid-analysis',password:'test-pass',consent:true,ageConfirmed:true});
  const receipt=paymentProvider.issue(client.account.state().user.id);
  const purchased=await client.account.subscriptionAction('purchase',{receipt});
  assert.equal(purchased.access.tier,'subscription');
  let status=await(await client.account.photoFetch('/api/youcam/status')).json();
  assert.equal(status.access.maxActions,16);
  for(let attempt=0;attempt<2;attempt++){
    const quoteResponse=await client.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{'X-Local-Token':status.localToken,'Content-Type':'application/json'},body:JSON.stringify({consent:true,actions:PHOTO_ACTIONS})});
    assert.equal(quoteResponse.status,200);
    const quote=await quoteResponse.json();
    assert.equal(quote.credits,16);
    const started=await client.account.photoFetch('/api/youcam/analysis/start',{method:'POST',headers:{'X-Local-Token':status.localToken,'Content-Type':'image/png','X-Quote-Id':quote.id,'X-Photo-Consent':PHOTO_CONSENT,'X-Overseas-Consent':PHOTO_CONSENT},body:headerFixture()});
    assert.equal(started.status,202,(await started.json()).error?.code);
    let result;
    for(let poll=0;poll<20;poll++){
      result=await(await client.account.photoFetch('/api/youcam/analysis/result',{headers:{'X-Local-Token':status.localToken}})).json();
      if(result.job?.state==='success')break;
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(result.job?.state,'success');
    status=await(await client.account.photoFetch('/api/youcam/status')).json();
    assert.equal(status.access.remaining,1-attempt);
    clock+=31_000;
  }
  const denied=await client.account.photoFetch('/api/youcam/analysis/quote',{method:'POST',headers:{'X-Local-Token':status.localToken,'Content-Type':'application/json'},body:JSON.stringify({consent:true,actions:PHOTO_ACTIONS})});
  assert.equal(denied.status,429);
  assert.equal((await denied.json()).error.code,'MONTHLY_LIMIT');
  assert.equal(local.mock.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/skin-analysis')).length,2);
});
test('계정 구분 없는 이전 사진 서버는 결과 조회 전에 차단한다',async()=>{
  const previous={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  const listeners={},calls=[];
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:id=>id==='photo-port'?{value:'4174'}:null};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  globalThis.fetch=async address=>{calls.push(address);return Response.json({analysisEnabled:true,analysisUsed:true,localToken:'old-token'});};
  try{
    const data=fixture(),ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),toast(){},persist:async()=>{throw Error('저장하면 안 됨');}});
    await listeners.click({target:{closest:()=>({dataset:{photo:'connect'}})}});
    assert.equal(calls.length,1);assert.equal(calls[0],'/api/youcam/status');assert.match(ui.render(),/계정|다시 실행/);
  }finally{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});

test('사진 시작은 포트 입력 없이 자동 연결하며 비용 조회나 사진 전송을 실행하지 않는다',async()=>{
  const previous={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  const listeners={},calls=[];let lookups=0;
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  globalThis.fetch=async(address,options)=>{calls.push({address,method:options.method??'GET'});return Response.json(address.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:false,localToken:'test-token'}:{used:false,job:null});};
  try{
    const data=fixture(),ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),toast(){},photoConnection:async()=>{lookups++;return {path:'/api/youcam'};}});
    assert.doesNotMatch(ui.render(),/photo-port|서버 포트|유캠연결\.cmd|로컬 시험/);
    assert.match(ui.render(),/사진 분석 준비하기/);
    await listeners.click({target:{closest:()=>({dataset:{photo:'connect'}})}});
    assert.equal(lookups,1);assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.address.startsWith('/api/youcam/')&&call.method==='GET'));
    assert.doesNotMatch(ui.render(),/사진 분석을 위해 해외로 전송돼요/);
    assert.doesNotMatch(ui.render(),/id="photo-consent"|id="photo-overseas-consent"|photo-port|로컬 시험|API 키/);
    await listeners.click({target:{closest:()=>({dataset:{photo:'start'}})}});
    assert.equal(calls.length,2);assert.match(ui.render(),/사진과 분석 항목을 먼저/);
  }finally{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});

test('배포 웹·Android 주소에서도 사진 분석 준비를 표시하고 자동 전송하지 않는다',()=>{
  const previous={document:globalThis.document,location:globalThis.location};
  globalThis.document={addEventListener(){},getElementById:()=>null};
  try{
    for(const location of [{hostname:'app.example.com',port:''},{hostname:'localhost',port:'',protocol:'https:'}]){
      globalThis.location=location;
      const data=fixture(),ui=createPhotoUI({state:()=>({data,effective:data}),photoFetch:()=>{throw Error('자동 전송 금지');}});
      assert.match(ui.render(),/사진 분석 준비하기/);assert.doesNotMatch(ui.render(),/이 환경에서는 사진 분석/);ui.reset();
    }
  }finally{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});

test('무료 체험 소진 후에는 사진 전송 없이 이용권 화면으로 안내한다',async()=>{
  const previous=globalThis.document,listeners={},data=fixture(),calls=[];
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null};
  try{
    const access={tier:'free',maxActions:4,fullAnalysis:false,remaining:0,freeTrialRemaining:0};
    const ui=createPhotoUI({
      state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),
      photoConnection:async()=>({path:'/api/youcam'}),
      photoFetch:async address=>{calls.push(address);return Response.json(address.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:true,localToken:'test-token',access}:{used:true,job:null,access});},
      navigate:(...args)=>calls.push(args),
      toast(){},
    });
    await listeners.click({target:{closest:()=>({dataset:{photo:'connect'}})}});
    assert.match(ui.render(),/무료 분석 체험을 사용했어요/);
    assert.match(ui.render(),/data-photo="upgrade"/);
    assert.doesNotMatch(ui.render(),/분석 결과 다시 보기/);
    await listeners.click({target:{closest:()=>({dataset:{photo:'upgrade'}})}});
    assert.deepEqual(calls.at(-1),['settings','subscription']);
    assert.deepEqual(calls.filter(item=>typeof item==='string'),['/api/youcam/status','/api/youcam/analysis/result']);
    ui.reset();
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('사진 저장은 숫자·선택 항목·날짜만 허용, 사진·URL·누락 점수·임의 항목 거절',()=>{
  const result=normalizeAnalysis(resultPayload()),reference=photoReference(result,'pore');
  assert.deepEqual(Object.keys(reference).sort(),['actions','date','focus','provider','scores','summary','version']);
  assert.deepEqual(reference.summary,{overallScore:80,skinAge:28});
  for(const change of [{photo:'base64'},{url:storage},{focus:'skin_age'},{date:'2026-02-30'},{date:'2099-01-01'},{scores:{redness:3,pore:5}},{scores:{redness:0,pore:5,texture:6}},{scores:{redness:NaN,pore:5,texture:6}}])assert.throws(()=>validatePhotoReference({...reference,...change}));
  assert.throws(()=>photoReference({...result,items:result.items.slice(0,2)},'pore'));
});

test('기존 백업 호환·저장 왕복·실패 원본 보존·사진이 불편함이나 예산을 덮어쓰지 않음',async()=>{
  const original=fixture(), reference=photoReference(normalizeAnalysis(resultPayload()),'redness');
  assert.deepEqual(validateData(original),original);
  const next=capturePlan({...original,skinCare:{...original.skinCare,observation:reference}},'observation');
  assert.equal(original.skinCare.observation,undefined);assert.equal(buildSkinPlan(next).allowance.cap,0);
  assert.deepEqual(next.skinCare.profile,original.skinCare.profile);assert.deepEqual(next.skinCare.selection,original.skinCare.selection);
  assert.ok(buildSkinPlan(next).reasons.some(reason=>reason.includes('사진 관찰')));
  const paused={...next,skinCare:{...next.skinCare,profile:{...next.skinCare.profile,discomfort:'yes'}}};
  assert.equal(buildSkinPlan(paused).paused,true);assert.deepEqual(buildSkinPlan(paused).morning,[]);
  let stored=JSON.stringify(original),fail=false;const previous=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>{if(fail)throw Error('저장 실패');stored=value;}};
  try {
    await writeData(next);assert.deepEqual((await readData()).skinCare.observation,reference);
    assert.doesNotMatch(stored,/mask_urls|https:\/\/yce|base64|ui_score/);
    const before=stored;fail=true;await assert.rejects(writeData(original));assert.equal(stored,before);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('화면은 결과만으로 저장하지 않으며 제안→별도 저장 동의→성공 후에만 반영',async()=>{
  const previous={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  const listeners={};let data=fixture(),writes=0,canSave=false;
  const fields={'photo-port':{value:'4174'},'photo-save-consent':{checked:false}};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:id=>fields[id]??null};
  globalThis.location={hostname:'127.0.0.1',port:'4173'};
  globalThis.fetch=async url=>Response.json(url.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:true,localToken:'local-token'}:{used:true,job:{state:'success',result:normalizeAnalysis(resultPayload())}});
  try {
    const ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),toast(){},persist:async next=>{writes+=1;if(!canSave)return false;data=validateData(next);return true;}});
    const click=action=>listeners.click({target:{closest:()=>({dataset:{photo:action}})}});
    await click('connect');assert.equal(writes,0);assert.equal(data.skinCare.observation,undefined);
    await click('proposal');assert.equal(writes,0);assert.match(ui.render(),/적용 전 관리 계획/);
    await click('apply');assert.equal(writes,0);
    fields['photo-save-consent'].checked=true;
    await click('apply');assert.equal(writes,1);assert.equal(data.skinCare.observation,undefined);assert.match(ui.render(),/저장에 실패/);
    data={...data,budgets:{[today().slice(0,7)]:0}};
    await click('apply');assert.equal(writes,1);assert.match(ui.render(),/바뀌었어요/);
    await click('proposal');canSave=true;await click('apply');assert.equal(writes,2);assert.equal(data.skinCare.observation.focus,'pore');
    assert.equal(data.skinCare.profile.budget,0);assert.equal(data.skinCare.history.at(-1).reason,'observation');
  } finally {
    for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}
  }
});
