import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAppService } from '../서버/앱서버.js';
import { createAccountClient } from '../화면/계정연결.js';
import { createConnection } from '../화면/연결설정.js';

test('앱 서버 설정은 HTTPS만 허용하고 웹 상대주소는 유지한다',()=>{
  assert.equal(createConnection({native:false}).url('/api/account/session'),'/api/account/session');
  assert.equal(createConnection({native:false,base:'https://api.example.com'}).url('/api/account/session'),'/api/account/session');
  assert.equal(createConnection({native:true,base:'https://api.example.com/'}).url('/api/account/session'),'https://api.example.com/api/account/session');
  for(const base of ['http://example.com','https://user:secret@example.com','https://example.com/path','javascript:alert(1)'])assert.throws(()=>createConnection({native:true,base}));
  assert.throws(()=>createConnection({native:true}).url('/api/account/session'));
});

test('암호화 저장을 기다리는 동안 로그아웃하면 늦은 로그인으로 복원하지 않는다',async()=>{
  let release,entered;
  const writing=new Promise(resolve=>{entered=resolve;});
  const tokenStore={get:async()=>'',remove:async()=>{},set:()=>{entered();return new Promise(resolve=>{release=resolve;});}};
  const client=createAccountClient({connection:{native:true,url:path=>path},tokenStore,fetchImpl:async()=>Response.json({user:{id:'test-account',username:'test-user'},sessionId:'session',csrfToken:'csrf',accessToken:randomBytes(32).toString('hex')})});
  const pending=client.authenticate('login',{});
  await writing;client.clear();release();await assert.rejects(pending,{code:'SESSION_CHANGED'});
  assert.equal(client.state().user,null);
});

test('앱 토큰 로그인·저장·재시작·탈퇴와 CORS는 실제 서버에서 격리된다',async context=>{
  let service,saved='',externalCalls=0;
  const server=createServer((request,response)=>service.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  service=createAppService({dbPath:':memory:',origins:[origin,'https://localhost'],env:{},fetchImpl:async()=>{externalCalls++;throw Error('외부 호출 금지');}});
  context.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();});
  const connection={native:true,url:path=>origin+path};
  const tokenStore={get:async()=>saved,set:async value=>{saved=value;},remove:async()=>{saved='';}};
  const fetchImpl=async(address,options={})=>{
    assert.equal(options.credentials,'omit');
    const response=await fetch(address,{...options,headers:{Origin:'https://localhost',...options.headers}});
    if(address.endsWith('/register'))assert.equal(response.headers.get('set-cookie'),null);
    return response;
  };
  const password=randomBytes(24).toString('hex');
  const first=createAccountClient({connection,tokenStore,fetchImpl});
  await first.authenticate('register',{username:'native-user',password,consent:true,ageConfirmed:true});
  const original=await first.read();
  await first.write({...original,goals:{selected:['skin'],note:'계정별 기록'}},original);
  const restarted=createAccountClient({connection,tokenStore,fetchImpl});
  await restarted.refresh();assert.equal((await restarted.read()).goals.note,'계정별 기록');
  const status=await restarted.photoFetch('/api/youcam/status',{});
  assert.equal(status.status,200);assert.equal(externalCalls,0);
  const preflight=await fetch(origin+'/api/account/login',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-session-mode,content-type,x-beauty-client'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://localhost');
  for(const untrusted of ['https://evil.example','null'])assert.equal((await fetch(origin+'/api/account/session',{headers:{Origin:untrusted}})).status,403);
  const oldToken=saved;
  await restarted.deleteAccount(password);
  const revoked=await fetch(origin+'/api/account/session',{headers:{Origin:'https://localhost','X-Session-Mode':'token',Authorization:`Bearer ${oldToken}`}});
  assert.equal((await revoked.json()).user,null);
  await assert.rejects(()=>first.read(),{code:'AUTH_REQUIRED'});
});
