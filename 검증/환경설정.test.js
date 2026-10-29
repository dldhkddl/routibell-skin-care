import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { X509Certificate } from 'node:crypto';
import { readServerEnvironment, isPrivateServerPath } from '../서버/환경설정.js';
import { createAppService } from '../서버/앱서버.js';
import { createAccountClient } from '../화면/계정연결.js';

const fakeKey='env-test-only-not-a-real-key';
function environmentFiles(context,files={}){
  const root=mkdtempSync(join(tmpdir(),'beauty-env-'));
  context.after(()=>{
    const target=resolve(root);
    assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('beauty-env-'));
    rmSync(target,{recursive:true,force:true});
  });
  for(const [name,content] of Object.entries(files))writeFileSync(join(root,name),content);
  return root;
}

test('환경 파일에서 서버 전용 설정만 읽고 따옴표·달러 문자를 보존한다',context=>{
  const root=environmentFiles(context,{'.env':`YOUCAM_API_KEY="${fakeKey}$literal"\r\nYOUCAM_ALLOW_LOOKUP=1\r\nYOUCAM_ALLOW_ANALYSIS=1\r\nUNRELATED_SECRET=not-forwarded\r\nVITE_TITLE=beauty\r\n`});
  assert.deepEqual(readServerEnvironment({root,env:{}}),{YOUCAM_API_KEY:fakeKey+'$literal',YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:'1'});
});

test('모드·로컬 파일 순서와 명시적인 실행 환경의 빈 값·차단 설정을 우선한다',context=>{
  const root=environmentFiles(context,{'.env':`YOUCAM_API_KEY=${fakeKey}\nYOUCAM_ALLOW_LOOKUP=1\nYOUCAM_ALLOW_ANALYSIS=0`,'.env.local':'YOUCAM_API_KEY=local-test-key','.env.production':'YOUCAM_API_KEY=production-test-key','.env.production.local':'YOUCAM_API_KEY=production-local-test-key\nYOUCAM_ALLOW_ANALYSIS=1'});
  assert.equal(readServerEnvironment({root,mode:'production',env:{}}).YOUCAM_API_KEY,'production-local-test-key');
  assert.equal(readServerEnvironment({root,mode:'development',env:{}}).YOUCAM_API_KEY,'local-test-key');
  assert.deepEqual(readServerEnvironment({root,mode:'production',env:{YOUCAM_API_KEY:'',YOUCAM_ALLOW_LOOKUP:'0',YOUCAM_ALLOW_ANALYSIS:'0'}}),{YOUCAM_API_KEY:'',YOUCAM_ALLOW_LOOKUP:'0',YOUCAM_ALLOW_ANALYSIS:'0'});
});

test('환경 파일이 없어도 실행하며 읽기 실패는 값을 노출하지 않고 중단한다',context=>{
  const root=environmentFiles(context);
  assert.deepEqual(readServerEnvironment({root,env:{}}),{YOUCAM_API_KEY:'',YOUCAM_ALLOW_LOOKUP:'',YOUCAM_ALLOW_ANALYSIS:''});
  mkdirSync(join(root,'.env'));
  assert.throws(()=>readServerEnvironment({root,env:{}}),issue=>issue.message==='서버 환경 설정 파일을 읽지 못했습니다. 파일 형식과 읽기 권한을 확인해 주세요.');
});

test('브라우저 노출 접두사의 유캠 설정은 시작·빌드 전에 거절한다',context=>{
  const root=environmentFiles(context,{'.env':`VITE_YOUCAM_API_KEY=${fakeKey}`});
  assert.throws(()=>readServerEnvironment({root,env:{}}),issue=>issue.message.includes('VITE_')&&!issue.message.includes(fakeKey));
  const emptyRoot=environmentFiles(context);
  assert.throws(()=>readServerEnvironment({root:emptyRoot,env:{VITE_YOUCAM_API_KEY:fakeKey}}),issue=>!issue.message.includes(fakeKey));
});

test('카카오 비밀 설정은 서버만 읽고 브라우저 접두사는 값 노출 없이 차단한다',context=>{
  const root=environmentFiles(context);
  const server=readServerEnvironment({root,env:{KAKAO_REST_API_KEY:fakeKey,KAKAO_APP_ID:'1234',APP_PUBLIC_URL:'https://api.example.com',VITE_API_BASE_URL:'https://api.example.com'}});
  assert.equal(server.KAKAO_REST_API_KEY===fakeKey,true);assert.equal(Object.hasOwn(server,'VITE_API_BASE_URL'),false);
  assert.throws(()=>readServerEnvironment({root,env:{VITE_KAKAO_CLIENT_SECRET:fakeKey}}),issue=>!issue.message.includes(fakeKey));
});

test('DB 주소와 저장키는 서버 전용으로만 읽고 브라우저 접두사는 차단한다',context=>{
  const root=environmentFiles(context,{'.env':'DATABASE_URL=postgresql://example.invalid/test\nACCOUNT_ENCRYPTION_KEY=test-only-key'});
  const settings=readServerEnvironment({root,env:{}});
  assert.equal(Boolean(settings.DATABASE_URL),true);
  assert.equal(Boolean(settings.ACCOUNT_ENCRYPTION_KEY),true);
  assert.equal(Object.hasOwn(settings,'VITE_DATABASE_URL'),false);
  assert.throws(()=>readServerEnvironment({root,env:{VITE_DATABASE_URL:'invalid'}}),issue=>!issue.message.includes('postgresql://'));
});

test('배포에 포함된 Supabase CA 인증서는 공개된 유효한 인증서다',()=>{
  const certificate=readFileSync(new URL('../서버/인증서/Supabase인증서.crt',import.meta.url),'utf8');
  assert.equal(certificate.includes('PRIVATE KEY'),false);
  const parsed=new X509Certificate(certificate);
  assert.equal(parsed.ca,true);
  assert.equal(Date.parse(parsed.validTo)>Date.now(),true);
});

test('개발·미리보기 공통 차단은 환경 파일·인코딩 주소·DB·Git 경로를 보호한다',()=>{
  for(const path of ['/.env','/.env.local?raw','/.env.production.local','/.env.backup','/%2eenv','/%2Eenv?import','/@fs/C:/project/.env','/public/.env','/public%5c.env','.env','/%','.계정자료/사진연결.json','/.검증자료/sample','/보관/제품사진/예시.jpg','/.git/config','/뷰티로그.sqlite','/저장키'])assert.equal(isPrivateServerPath(path),true,path);
  for(const path of ['/','/assets/index.js','/api/account/session','/api/youcam/status','/api/youcam/analysis/start'])assert.equal(isPrivateServerPath(path),false,path);
});

test('환경 파일의 키로 통합 사진 API를 켜되 시작·상태 조회에서는 외부 호출하지 않는다',async context=>{
  const root=environmentFiles(context,{'.env':`YOUCAM_API_KEY=${fakeKey}\nYOUCAM_ALLOW_LOOKUP=1\nYOUCAM_ALLOW_ANALYSIS=1`});
  let service,providerCalls=0,cookie='';
  const server=createServer((request,response)=>service.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  service=createAppService({dbPath:':memory:',origins:[origin],env:readServerEnvironment({root,env:{}}),fetchImpl:async()=>{providerCalls++;throw Error('외부 호출 금지');}});
  context.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();});
  const client=createAccountClient({fetchImpl:async(path,options={})=>{
    const response=await fetch(origin+path,{...options,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...options.headers}});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return response;
  }});
  await client.authenticate('register',{username:'env-test-user',password:'test-password',consent:true,ageConfirmed:true});
  const status=await(await client.photoFetch('/api/youcam/status')).json();
  assert.equal(status.keyConfigured,true);assert.equal(status.analysisEnabled,true);
  const initial=await client.read(),record={id:'env-record',title:'환경 설정 검증 기록',category:'cosmetic',amount:12300,date:'2025-03-01',rating:null,repurchase:null,memo:''};
  await client.write({...initial,records:[record]});
  await client.write({...initial,records:[{...record,amount:14500}]});
  client.clear();await client.refresh();
  assert.equal((await client.read()).records[0].amount,14500);
  assert.equal(providerCalls,0);assert.ok(!JSON.stringify(status).includes(fakeKey));
});

test('실행 도우미에는 반복 키 입력이 없고 환경 파일은 Git 제외 규칙에 포함된다',()=>{
  const start=readFileSync(new URL('../시작하기.cmd',import.meta.url),'utf8');
  const script=readFileSync(new URL('../서버/시작.ps1',import.meta.url),'utf8');
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  assert.doesNotMatch(start,/pwsh|YOUCAM_API_KEY/);assert.match(start,/call npm run preview/);
  assert.doesNotMatch(script,/Read-Host|SecureString|YOUCAM_API_KEY/);
  assert.ok(ignore.split(/\r?\n/).includes('.env*'));
});

test('실제 Vite 개발·미리보기 서버 모두 환경 파일 HTTP 요청을 차단한다',async context=>{
  const root=environmentFiles(context),names=['YOUCAM_API_KEY','YOUCAM_ALLOW_LOOKUP','YOUCAM_ALLOW_ANALYSIS','BEAUTY_DB_PATH'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.YOUCAM_API_KEY=fakeKey;process.env.YOUCAM_ALLOW_LOOKUP='0';process.env.YOUCAM_ALLOW_ANALYSIS='0';process.env.BEAUTY_DB_PATH=join(root,'test.sqlite');
  try{
    const {createServer:createViteServer,preview}=await import('vite');
    const {default:configuration}=await import('../vite.config.js');
    for(const mode of ['development','production']){
      const config=configuration({mode});
      const options={...config,configFile:false,logLevel:'silent',mode};
      const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
      const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
      const server=mode==='development'?await createViteServer({...options,server:{...config.server,port}}):await preview({...options,preview:{...config.preview,port}});
      try{
        if(mode==='development')await server.listen();
        assert.equal(server.config.env.YOUCAM_API_KEY,undefined);
        assert.ok(!JSON.stringify(server.config.env).includes(fakeKey));
        const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
        for(const path of ['/.env','/.env?raw','/%2eenv','/.env.local','/.env.production','/@fs/C:/project/.env']){
          const response=await fetch(origin+path);
          assert.equal(response.status,404,`${mode}: ${path}`);assert.equal(await response.text(),'');
        }
      }finally{
        if(mode==='development')await server.close();
        else{server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}
      }
    }
  }finally{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});
