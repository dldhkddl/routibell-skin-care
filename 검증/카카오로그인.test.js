import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAccountService } from '../서버/계정서버.js';

async function fixture(context,{enabled=true,native=false}={}){
  let service,time=Date.now(),member=10001,valid=true,calls=[];
  const server=createServer((request,response)=>service.handle(request,response));server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`,clientOrigin=native?'https://localhost':origin;
  service=createAccountService({dbPath:':memory:',origins:[origin,'https://localhost'],env:enabled?{KAKAO_REST_API_KEY:randomBytes(16).toString('hex'),KAKAO_APP_ID:'1234',KAKAO_REDIRECT_URI:origin+'/api/account/kakao-callback'}:{},now:()=>time,fetchImpl:async(address,options)=>{
    calls.push(address);
    if(address==='https://kauth.kakao.com/oauth/token')return Response.json({access_token:randomBytes(24).toString('hex')});
    if(address==='https://kapi.kakao.com/v1/user/access_token_info')return Response.json({id:member,app_id:valid?1234:9999,expires_in:100});
    throw Error('허용하지 않은 외부 요청');
  }});
  context.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();});
  function agent(){
    let cookie='',auth=null,token='';
    async function request(path,{method='GET',body,headers={}}={}){
      const response=await fetch(origin+'/api/account/'+path,{method,redirect:'manual',headers:{Origin:clientOrigin,'X-Beauty-Client':'account-v1',...(native?{'X-Session-Mode':'token',...(token?{Authorization:`Bearer ${token}`}:{})}:{Cookie:cookie}),...(auth?{'X-Account-ID':auth.user.id,'X-Session-ID':auth.sessionId,'X-CSRF-Token':auth.csrfToken}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json();
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      if(value.user){auth=value;token=value.accessToken??token;}
      return {status:response.status,value};
    }
    async function start(purpose='login',extra={}){
      const verifier=randomBytes(32).toString('hex');
      const result=await request('kakao-start',{method:'POST',body:{purpose,challenge:createHash('sha256').update(verifier).digest('hex'),...(purpose==='login'?{ageConfirmed:true,consent:true}:purpose==='delete'?{confirm:true}:{}),...extra}});
      return {...result,verifier};
    }
    async function callback(flow,{cancel=false}={}){
      const address=new URL(flow.value.authorizeUrl);
      assert.equal(address.searchParams.has('scope'),false);
      const response=await fetch(origin+'/api/account/kakao-callback?'+new URLSearchParams({state:address.searchParams.get('state'),...(cancel?{error:'access_denied'}:{code:randomBytes(16).toString('hex')})}),{redirect:'manual'});
      assert.equal(response.status,303);
      assert.equal(response.headers.get('location').includes('access_token'),false);
      return response;
    }
    const complete=(flow,verifier=flow.verifier)=>request('kakao-complete',{method:'POST',body:{flowId:flow.value.flowId,verifier}});
    return {request,start,callback,complete};
  }
  return {agent,advance:()=>{time+=11*60*1000;},setMember:value=>{member=value;},invalidate:()=>{valid=false;},calls:()=>calls};
}

test('키가 없으면 카카오만 비활성화하고 자체 계정 서버는 유지한다',async context=>{
  const setup=await fixture(context,{enabled:false}),agent=setup.agent();
  assert.equal((await agent.request('kakao-config')).value.enabled,false);
  assert.equal((await agent.start()).status,503);
  assert.equal((await agent.request('session')).status,200);assert.equal(setup.calls().length,0);
});
test('회원번호만 검증해 신규 자체 세션을 발급하고 재로그인 시 같은 기록을 읽는다',async context=>{
  const setup=await fixture(context),agent=setup.agent();
  const first=await agent.start();await agent.callback(first);
  const logged=await agent.complete(first);assert.equal(logged.status,200);assert.equal(logged.value.user.hasPassword,false);
  const data=(await agent.request('data')).value;
  await agent.request('data',{method:'PUT',body:{revision:0,data:{...data.data,goals:{selected:['skin'],note:'카카오 기록'}}}});
  assert.equal((await agent.complete(first)).status,401);
  await agent.request('logout',{method:'POST',body:{}});
  const second=await agent.start();await agent.callback(second);const relogged=await agent.complete(second);
  assert.equal(relogged.value.user.id,logged.value.user.id);
  assert.equal((await agent.request('data')).value.data.goals.note,'카카오 기록');
  assert.equal(setup.calls().every(address=>['https://kauth.kakao.com/oauth/token','https://kapi.kakao.com/v1/user/access_token_info'].includes(address)),true);
});
test('아이디 계정에 명시적으로 연결하고 중복 연결·기록 병합을 막는다',async context=>{
  const setup=await fixture(context),owner=setup.agent(),other=setup.agent(),password=randomBytes(20).toString('hex');
  const registered=await owner.request('register',{method:'POST',body:{username:'kakao-owner',password,ageConfirmed:true,consent:true}});
  const original=(await owner.request('data')).value;
  await owner.request('data',{method:'PUT',body:{revision:0,data:{...original.data,goals:{selected:['skin'],note:'기존 계정 기록'}}}});
  const link=await owner.start('link');await owner.callback(link);assert.equal((await owner.complete(link)).value.linked,true);
  const login=await other.start();await other.callback(login);assert.equal((await other.complete(login)).value.user.id,registered.value.user.id);
  assert.equal((await other.request('data')).value.data.goals.note,'기존 계정 기록');
  await other.request('logout',{method:'POST',body:{}});
  await other.request('register',{method:'POST',body:{username:'kakao-other',password,ageConfirmed:true,consent:true}});
  const duplicate=await other.start('link');await other.callback(duplicate);assert.equal((await other.complete(duplicate)).value.error.code,'KAKAO_ALREADY_LINKED');
  assert.equal((await other.request('data')).value.data.goals.note,'');
  await owner.request('delete',{method:'POST',body:{password,confirm:true}});
  assert.equal((await owner.request('login',{method:'POST',body:{username:'kakao-owner',password}})).status,401);
});
test('Android 카카오 로그인은 토큰 세션이며 본인 재인증으로 탈퇴한다',async context=>{
  const setup=await fixture(context,{native:true}),agent=setup.agent();
  const flow=await agent.start();const callback=await agent.callback(flow);
  assert.equal(callback.headers.get('location').startsWith('com.dldhkddl.skincare://kakao?flow='),true);
  const logged=await agent.complete(flow);assert.equal(typeof logged.value.accessToken,'string');
  const removal=await agent.start('delete');await agent.callback(removal);assert.equal((await agent.complete(removal)).value.deleted,true);
  assert.equal((await agent.request('data')).status,401);
});
test('동의 누락·잘못된 검증값·다른 앱 토큰·취소·만료는 계정을 발급하지 않는다',async context=>{
  const setup=await fixture(context),agent=setup.agent();
  assert.equal((await agent.start('login',{ageConfirmed:false})).status,400);
  assert.equal((await agent.start('login',{consent:false})).status,400);
  assert.equal((await agent.start('link')).status,401);
  const flow=await agent.start();await agent.callback(flow);assert.equal((await agent.complete(flow,randomBytes(32).toString('hex'))).status,401);
  assert.equal((await agent.request('session')).value.user,null);
  setup.invalidate();const bad=await agent.start();await agent.callback(bad);assert.equal((await agent.complete(bad)).value.error.code,'KAKAO_INCOMPLETE');
  const cancelled=await agent.start();await agent.callback(cancelled,{cancel:true});assert.equal((await agent.complete(cancelled)).status,409);
  setup.advance();assert.equal((await agent.complete(flow)).status,401);
});
test('카카오 재인증 계정이 다르면 탈퇴하지 않는다',async context=>{
  const setup=await fixture(context),agent=setup.agent();
  const flow=await agent.start();await agent.callback(flow);await agent.complete(flow);
  setup.setMember(10002);const removal=await agent.start('delete');await agent.callback(removal);
  assert.equal((await agent.complete(removal)).value.error.code,'KAKAO_ACCOUNT_MISMATCH');
  assert.equal((await agent.request('data')).status,200);
});
