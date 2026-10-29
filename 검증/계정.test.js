import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createAccountService } from '../서버/계정서버.js';
import { createAccountClient } from '../화면/계정연결.js';
import { createAccountUI } from '../화면/계정화면.js';
import { selectLegacyData } from '../화면/계정이전.js';
import { EMPTY, validateData } from '../화면/계산.js';
import { emptyCare } from '../화면/피부계산.js';
import { saveBotCheckin } from '../화면/체크인계산.js';
import { monthlyReport } from '../화면/월간계산.js';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { savePhotoObservation } from '../화면/사진이력.js';
import { renderPrivacyPolicy } from '../화면/개인정보방침.js';
import { needsGoalSetup } from '../화면/시작흐름.js';
import { addPurchasePrice, markBudgetAlert, updateProductStatus } from '../화면/예산계산.js';

test('예산·제품 상태·교체 주기·구매 가격·알림 확인은 계정 서버에 저장되고 재로그인 후 유지된다',async context=>{
  const server=await serverFor(context),client=createAccountClient({fetchImpl:accountAgent(server).fetchImpl});
  await client.authenticate('register',{username:'budget-persistence',password,consent:true,ageConfirmed:true});
  const original=await client.read();
  const product={id:'budget-sun',title:'내 선크림',category:'cosmetic',kind:'sunscreen',comfort:'unknown',status:'available',usageState:'using',remaining:50,registeredAt:'2026-09-01',opened:'2026-09-01',finishedAt:'',expires:'',memo:''};
  let data={...original,inventory:[product],budgets:{'2026-09':39000}};
  data=updateProductStatus(data,product.id,'finished','2026-09-30');
  data=addPurchasePrice(data,'sunscreen',20000,'2026-09-30','budget-purchase');
  data=markBudgetAlert(data,product.id);
  await client.write(data,original);
  await client.logout();
  await client.authenticate('login',{username:'budget-persistence',password});
  const restored=await client.read();
  assert.equal(restored.inventory[0].status,'finished');
  assert.equal(restored.budgetCare.cycles[0].days,29);
  assert.equal(restored.budgetCare.purchases[0].price,20000);
  assert.deepEqual(restored.budgetCare.notified,[product.id]);
  assert.equal(restored.budgets['2026-09'],39000);
});

test('목표 선택과 수정은 재로그인 후에도 계정에 유지된다',async context=>{
  const server=await serverFor(context),client=createAccountClient({fetchImpl:accountAgent(server).fetchImpl});
  await client.authenticate('register',{username:'goal-persistence',password,consent:true,ageConfirmed:true});
  const original=await client.read();
  assert.equal(needsGoalSetup(original),true);
  await client.write({...original,goals:{selected:['skin'],note:''},onboarding:true},original);
  await client.logout();await client.authenticate('login',{username:'goal-persistence',password});
  const restored=await client.read();
  assert.deepEqual(restored.goals,{selected:['skin'],note:''});
  assert.equal(needsGoalSetup(restored),false);
  await client.write({...restored,goals:{selected:['hair'],note:'내 스타일 찾기'}},restored);
  await client.logout();await client.authenticate('login',{username:'goal-persistence',password});
  assert.deepEqual((await client.read()).goals,{selected:['hair'],note:'내 스타일 찾기'});
});

test('실제 응답의 종합 점수·피부 나이·세 영역은 계정 저장 후 재로그인해도 보존된다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server),other=accountAgent(server);
  const client=createAccountClient({fetchImpl:agent.fetchImpl});
  await client.authenticate('register',{username:'actual-summary',password,consent:true,ageConfirmed:true});
  const empty=await client.read(),date='2026-09-23';
  const base={...empty,skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date}}};
  const response=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
  const result=normalizeAnalysis(response,()=>Date.parse('2026-09-23T06:00:00Z'),PHOTO_ACTIONS);
  await client.write(savePhotoObservation(base,result,'skin_type'),empty);
  await client.logout();await client.authenticate('login',{username:'actual-summary',password});
  const saved=await client.read();
  assert.deepEqual(saved.skinCare.observation.summary,{overallScore:80.6,skinAge:28});
  assert.equal(Object.keys(saved.skinCare.observation.skinTypes).length,3);
  assert.deepEqual(monthlyReport(saved,'2026-09',date).photos.first.reference.summary,result.summary);
  await other.register('other-summary');assert.equal((await other.request('data')).payload.data.skinCare.observations.length,0);
});

const password='isolated-test-long-passphrase-42';
const record={id:'one',title:'계정 전용 검증 기록',category:'cosmetic',amount:23000,date:'2025-03-01',rating:null,repurchase:null,memo:''};
async function serverFor(context,options={}){
  let service;
  const server=createServer((request,response)=>service.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  service=createAccountService({dbPath:':memory:',...options,origins:[origin]});
  context.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();});
  return {origin,service};
}
function accountAgent(server){
  let cookie='',auth=null;
  const fetchImpl=async(address,options={})=>{
    const response=await fetch(address.startsWith('/')?server.origin+address:address,{...options,headers:{Origin:server.origin,'X-Beauty-Client':'account-v1',...(cookie?{Cookie:cookie}:{}),...options.headers}});
    const nextCookie=response.headers.get('set-cookie');if(nextCookie)cookie=nextCookie.split(';')[0];return response;
  };
  async function request(path,method='GET',body,headers={}){
    const response=await fetchImpl(`/api/account/${path}`,{method,headers:{...(auth?{'X-Account-ID':auth.user.id,'X-Session-ID':auth.sessionId,'X-CSRF-Token':auth.csrfToken}:{}),...(method!=='GET'?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const payload=await response.json();if(payload.user)auth=payload;
    return {status:response.status,payload,headers:response.headers};
  }
  return {request,fetchImpl,auth:()=>auth,cookie:()=>cookie,register:username=>request('register','POST',{username,password,consent:true,ageConfirmed:true})};
}

test('결제가 닫혀 있으면 관심 표시만 계정·상품별 한 번 저장된다',async context=>{
  const server=await serverFor(context,{env:{PAYMENTS_ENABLED:'false'}}),first=accountAgent(server),second=accountAgent(server);
  await first.register('interest-first');await second.register('interest-second');
  assert.equal((await first.request('subscription')).payload.paymentsEnabled,false);
  for(const product of ['pass','pass','subscription'])assert.equal((await first.request('payment-interest','POST',{product})).status,200);
  assert.equal((await second.request('payment-interest','POST',{product:'pass'})).status,200);
  assert.equal((await first.request('payment-interest','POST',{product:'invalid'})).status,400);
});

test('가입·로그인·실제 서버 저장은 계정별로 분리되고 새 계정은 빈 기록이다',async context=>{
  const server=await serverFor(context),first=accountAgent(server),second=accountAgent(server);
  assert.equal((await first.request('data')).status,401);
  const registration=await first.register('alpha');assert.equal(registration.status,201);
  assert.match(registration.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await second.register('bravo')).status,201);
  assert.deepEqual((await first.request('data')).payload.data,validateData(EMPTY()));
  const written=await first.request('data','PUT',{data:{...EMPTY(),records:[record]},revision:0});assert.equal(written.status,200);
  assert.equal((await second.request('data')).payload.data.records.length,0);
  assert.equal((await first.request('data')).payload.data.records[0].amount,23000);
  assert.equal((await first.request('data?userId='+second.auth().user.id)).status,404);
  assert.equal((await first.request('data','GET',undefined,{'X-Account-ID':second.auth().user.id})).status,409);
  assert.equal((await first.request('data','PUT',{data:EMPTY(),revision:1,userId:second.auth().user.id})).status,400);
});

test('버튼형 체크인은 계정에 저장되고 재로그인·수정 후에도 월간 리포트에 한 번만 반영된다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server),other=accountAgent(server);
  const client=createAccountClient({fetchImpl:agent.fetchImpl});
  await client.authenticate('register',{username:'checkin-bot',password,consent:true,ageConfirmed:true});
  const original=await client.read(),date='2025-03-15';
  let data=await client.write({...original,skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date}}},original);
  data=await client.write(saveBotCheckin(data,{adherence:'yes',routine:'morning',mood:'balanced'},date),data);
  await client.logout();
  await client.authenticate('login',{username:'checkin-bot',password});
  const restored=await client.read();
  assert.equal(restored.skinCare.days[0].morning,true);
  assert.equal(monthlyReport(restored,'2025-03',date).feedback.comfortable,1);
  const edited=await client.write(saveBotCheckin(restored,{adherence:'pending',mood:'oily',comfort:'unsure'},date),restored);
  assert.equal(edited.skinCare.checkins.length,1);
  assert.equal(monthlyReport(edited,'2025-03',date).routine.done,0);
  assert.equal(monthlyReport(edited,'2025-03',date).feedback.difficult,0);
  await other.register('checkin-other');
  assert.equal((await other.request('data')).payload.data.skinCare.checkins.length,0);
});

test('CSRF·교차 사이트·잘못된 요청을 차단하고 서버는 사용자 자료 전체를 검증한다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);await agent.register('charlie');
  for(const headers of [{'X-CSRF-Token':''},{'X-CSRF-Token':'é'.repeat(64)},{Origin:'https://evil.example'},{Origin:'null'},{'X-Beauty-Client':''}])assert.equal((await agent.request('data','PUT',{data:EMPTY(),revision:0},headers)).status,403);
  assert.equal((await agent.request('data','PUT',{data:{...EMPTY(),records:[{...record,amount:-1}]},revision:0})).status,400);
  assert.equal((await agent.request('data','PUT',{data:EMPTY(),revision:-1})).status,400);
  assert.equal((await agent.request('data')).payload.revision,0);
  assert.equal((await agent.request('login','POST',{username:'charlie',password:'x'.repeat(6000)})).status,413);
});

test('저장 버전 충돌은 이전 기록을 덮어쓰지 않고 오류 후 재조회가 가능하다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);await agent.register('delta');
  const first=await agent.request('data','PUT',{data:{...EMPTY(),records:[record]},revision:0});assert.equal(first.status,200);
  assert.equal((await agent.request('data','PUT',{data:EMPTY(),revision:0})).status,409);
  assert.equal((await agent.request('data')).payload.data.records.length,1);
  const modified={...first.payload.data,records:[{...record,amount:25000}]};
  assert.equal((await agent.request('data','PUT',{data:modified,revision:1})).status,200);
  assert.equal((await agent.request('data')).payload.data.records[0].amount,25000);
});

test('이전은 백업·선택 동의 후 새 빈 계정에만 가능하며 반복·덮어쓰기를 막는다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);await agent.register('echo');
  const body={data:{...EMPTY(),records:[record]},revision:0};
  assert.equal((await agent.request('import','PUT',body)).status,400);
  assert.equal((await agent.request('data')).payload.revision,0);
  assert.equal((await agent.request('import','PUT',{...body,consent:true,backupConfirmed:true})).status,200);
  assert.equal((await agent.request('import','PUT',{...body,revision:1,consent:true,backupConfirmed:true})).status,409);
  assert.equal((await agent.request('data')).payload.data.records.length,1);
});

test('로그아웃·이전 세션·사진 권한 표는 서버에서 폐기된다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);await agent.register('foxtrot');
  const ticket=(await agent.request('photo-ticket','POST',{})).payload.ticket;
  const verifier=accountAgent(server);
  assert.equal((await verifier.request('photo-verify','POST',{ticket})).payload.userId,agent.auth().user.id);
  const savedCookie=agent.cookie();
  assert.equal((await agent.request('logout','POST',{})).status,200);
  assert.equal((await agent.request('data','GET',undefined,{Cookie:savedCookie})).status,401);
  assert.equal((await verifier.request('photo-verify','POST',{ticket})).status,401);
  assert.equal((await agent.request('session')).payload.user,null);
});

test('탈퇴는 비밀번호 재확인 뒤 계정·기록·모든 세션·사진 권한 표를 삭제한다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server),other=accountAgent(server);
  await agent.register('delete-owner');
  const ticket=(await agent.request('photo-ticket','POST',{})).payload.ticket;
  assert.equal((await agent.request('data','PUT',{data:{...EMPTY(),records:[record]},revision:0})).status,200);
  assert.equal((await other.request('login','POST',{username:'delete-owner',password})).status,200);
  assert.equal((await agent.request('delete','POST',{password:'wrong',confirm:true})).status,401);
  assert.equal((await agent.request('data')).payload.data.records.length,1);
  assert.equal((await agent.request('delete','POST',{password,confirm:false})).status,400);
  const deleted=await agent.request('delete','POST',{password,confirm:true});
  assert.equal(deleted.status,200);assert.match(deleted.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await agent.request('data')).status,401);
  assert.equal((await other.request('data')).status,401);
  assert.equal((await other.request('photo-verify','POST',{ticket})).status,401);
  assert.equal((await other.request('login','POST',{username:'delete-owner',password})).status,401);
});

test('세션에는 유휴 만료와 절대 만료가 있고 요청으로 무한 연장되지 않는다',async context=>{
  let clock=1000;const server=await serverFor(context,{now:()=>clock,sessionLifetime:3000,idleLifetime:1000}),agent=accountAgent(server);
  await agent.register('golf');clock=1900;assert.ok((await agent.request('session')).payload.user);
  clock=2800;assert.ok((await agent.request('session')).payload.user);
  clock=3700;assert.ok((await agent.request('session')).payload.user);
  clock=4001;assert.equal((await agent.request('data')).status,401);
});

test('잘못된 비밀번호·중복 가입·복구 코드 재사용을 막고 복구하면 이전 세션을 폐기한다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server),other=accountAgent(server);
  const registered=await agent.register('hotel');const code=registered.payload.recoveryCode;
  assert.equal((await other.register('HOTEL')).status,409);
  assert.equal((await other.request('login','POST',{username:'hotel',password:password+'wrong'})).status,401);
  const reset=await other.request('recover','POST',{username:'hotel',password:password+'new',recoveryCode:code});assert.equal(reset.status,200);
  assert.equal((await agent.request('data')).status,401);
  assert.equal((await other.request('recover','POST',{username:'hotel',password,recoveryCode:code})).status,401);
  assert.equal((await other.request('login','POST',{username:'hotel',password:password+'new'})).status,200);
});

test('유휴 시간이 지나면 데이터와 사진 권한 표를 거절한다',async context=>{
  let clock=1000;const server=await serverFor(context,{now:()=>clock,sessionLifetime:10_000,idleLifetime:1000}),agent=accountAgent(server);
  await agent.register('idleuser');const issued=await agent.request('photo-ticket','POST',{});
  clock=2001;
  assert.equal((await agent.request('data')).status,401);
  assert.equal((await accountAgent(server).request('photo-verify','POST',{ticket:issued.payload.ticket})).status,401);
});

test('비밀번호·가입 동의·아이디 형식을 검사하고 과도한 시도를 제한한다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);
  assert.equal((await agent.request('register','POST',{username:'young-user',password,consent:true})).payload.error.code,'AGE_CONFIRMATION_REQUIRED');
  assert.equal((await agent.request('register','POST',{username:'young-user',password,consent:true,ageConfirmed:false})).status,400);
  assert.equal((await agent.request('login','POST',{username:'young-user',password})).status,401);
  assert.equal((await agent.request('register','POST',{username:'india',password,consent:false})).status,400);
  for(const invalid of ['',null,1234,'x'.repeat(129)])assert.equal((await agent.request('register','POST',{username:'india',password:invalid,consent:true})).status,400);
  assert.equal((await agent.request('register','POST',{username:"' OR 1=1",password,consent:true})).status,400);
  for(let attempt=0;attempt<9;attempt++)assert.equal((await agent.request('register','POST',{username:'juliet',password,consent:false})).status,400);
  assert.equal((await agent.request('register','POST',{username:'juliet',password,consent:false})).status,400);
  assert.equal((await agent.request('register','POST',{username:'juliet',password,consent:false})).status,429);
});

test('가입·마이에서 처리방침을 열고 초안 및 국외 이전 필수 내용을 확인할 수 있다',()=>{
  const previous=globalThis.document;globalThis.document={addEventListener(){}};
  try{
    const ui=createAccountUI({render(){},client:{state:()=>({user:{username:'tester'},revision:0})}});
    assert.match(ui.gate(),/개인정보 처리방침/);
    assert.match(ui.panel(),/<h1>tester<\/h1>/);
    assert.doesNotMatch(ui.panel(),/MY ACCOUNT|나의 관리와 선택/);
    const app=readFileSync(new URL('../화면/앱.js',import.meta.url),'utf8');
    assert.match(app,/settingsRow\('개인정보 처리방침'/);
    assert.match(app,/settingsRow\('계정 탈퇴'/);
    const policy=renderPrivacyPolicy();
    for(const text of ['초안 · 공개 전 검토 필요','얼굴 사진','미국 서버','Perfect Corp.','제28조의8','거부 방법·효과','보관 장소와 기간·파기','결제 정보','Supabase','권리와 행사 방법','연락처'])assert.match(policy,new RegExp(text));
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('DB·재시작에서 암호화된 계정 기록을 복구하며 평문 비밀번호·소비 내용을 보관하지 않는다',async context=>{
  const directory=mkdtempSync(join(tmpdir(),'beauty-account-test-')),dbPath=join(directory,'시험.sqlite');
  const disposers=[],localContext={after:callback=>disposers.push(callback)};
  context.after(async()=>{for(const dispose of disposers.reverse())await dispose();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep));assert.ok(target.includes('beauty-account-test-'));rmSync(target,{recursive:true,force:true});});
  const server=await serverFor(localContext,{dbPath}),agent=accountAgent(server);await agent.register('kilo');
  await agent.request('data','PUT',{data:{...EMPTY(),records:[record]},revision:0});
  for(const file of readdirSync(directory).filter(file=>file.startsWith('시험.sqlite'))){const raw=readFileSync(join(directory,file)).toString('utf8');assert.ok(!raw.includes(password));assert.ok(!raw.includes(record.title));}
  const second=await serverFor(localContext,{dbPath}),sameUser=accountAgent(second);
  assert.equal((await sameUser.request('login','POST',{username:'kilo',password})).status,200);
  assert.equal((await sameUser.request('data')).payload.data.records[0].title,record.title);
});

test('클라이언트도 계정 변경·만료 응답을 감지하며 기존 로컬 자료로 대체 저장하지 않는다',async context=>{
  const server=await serverFor(context),transport=accountAgent(server);let lost=0;
  const client=createAccountClient({fetchImpl:transport.fetchImpl,onLost:()=>lost++});
  assert.equal(await client.refresh(),null);
  await client.authenticate('register',{username:'lima',password,consent:true,ageConfirmed:true});
  const initial=await client.read();assert.equal(initial.records.length,0);
  await client.write({...initial,records:[record]},initial);
  assert.equal((await client.read()).records.length,1);
  await transport.request('register','POST',{username:'mike',password,consent:true,ageConfirmed:true});
  await assert.rejects(client.read(),issue=>issue.code==='SESSION_CHANGED');assert.equal(lost,1);assert.equal(client.state().user,null);
  await assert.rejects(client.write(EMPTY()),/먼저|로그인/);
});

test('선택 이전은 고른 기록만 포함하고 선택하지 않은 피부·예산을 자동 전송하지 않는다',()=>{
  const source={...EMPTY(),records:[record,{...record,id:'two',title:'제외할 시험 기록'}],budgets:{'2025-03':100000}};
  const selected=selectLegacyData(source,{recordIds:['one']});
  assert.equal(selected.records.length,1);assert.deepEqual(selected.budgets,{});assert.equal(selected.skinCare.profile,null);
  assert.equal(selectLegacyData(source,{sections:['budgets']}).budgets['2025-03'],100000);
  assert.throws(()=>selectLegacyData(source,{recordIds:['missing']}));assert.throws(()=>selectLegacyData(source));
  assert.equal(source.records.length,2);
});

test('서버 저장 실패 시 클라이언트는 마지막 성공 버전과 기록을 유지한다',async context=>{
  const server=await serverFor(context),transport=accountAgent(server);let offline=false;
  const client=createAccountClient({fetchImpl:(...args)=>{if(offline)throw Error('연결 실패');return transport.fetchImpl(...args);}});
  await client.authenticate('register',{username:'november',password,consent:true,ageConfirmed:true});
  const initial=await client.read();offline=true;
  await assert.rejects(client.write({...initial,records:[record]},initial),issue=>issue.code==='NETWORK');
  assert.equal(client.state().revision,0);offline=false;
  assert.equal((await client.read()).records.length,0);
  await client.write({...initial,records:[record]},initial);assert.equal(client.state().revision,1);
});

test('세션을 비운 뒤 늦게 완료된 응답은 다시 계정을 복원하지 않는다',async()=>{
  let finish;
  const client=createAccountClient({fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})})});
  const loading=client.refresh();await new Promise(resolve=>setImmediate(resolve));client.clear();
  finish({user:{id:'old-owner',username:'olduser'},sessionId:'old-session',csrfToken:'old-csrf'});
  await assert.rejects(loading,issue=>issue.code==='SESSION_CHANGED');assert.equal(client.state().user,null);
});

test('최소 길이를 강제하지 않고 짧은 비밀번호로 가입·로그인·복구하며 기록을 보존한다',async context=>{
  const server=await serverFor(context),agent=accountAgent(server);
  const registered=await agent.request('register','POST',{username:'shortpass',password:'a',consent:true,ageConfirmed:true});
  assert.equal(registered.status,201);
  assert.equal((await agent.request('data','PUT',{data:{...EMPTY(),records:[record]},revision:0})).status,200);
  assert.equal((await agent.request('logout','POST',{})).status,200);
  assert.equal((await agent.request('login','POST',{username:'shortpass',password:'a'})).status,200);
  assert.equal((await agent.request('data')).payload.data.records[0].amount,23000);
  const recovery=await agent.request('recover','POST',{username:'shortpass',password:'b',recoveryCode:registered.payload.recoveryCode});
  assert.equal(recovery.status,200);
  assert.equal((await agent.request('login','POST',{username:'shortpass',password:'a'})).status,401);
  assert.equal((await agent.request('login','POST',{username:'shortpass',password:'b'})).status,200);
  assert.equal((await agent.request('data')).payload.data.records[0].amount,23000);
});

test('로그인·회원가입·복구 화면의 비밀번호에 최소 길이 속성이나 15자 안내가 없다',async()=>{
  const previous=globalThis.document,listeners={};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;}};
  try{
    const ui=createAccountUI({render(){}});
    for(const mode of ['login','register','recover']){
      await listeners.click({target:{closest:()=>({dataset:{accountMode:mode}})}});
      const html=ui.gate(),inputs=html.match(/<input\b[^>]*type="password"[^>]*>/g);
      assert.equal(inputs.length,mode==='login'?1:2);
      for(const input of inputs){assert.doesNotMatch(input,/minlength/);assert.match(input,/required/);}
      assert.doesNotMatch(html,/15자/);
    }
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('사진 연결 주소는 로그인한 계정만 확인하고 입력 없이 클라이언트에 연결한다',async context=>{
  const server=await serverFor(context,{photoConnection:()=>({path:'/api/youcam'})}),agent=accountAgent(server);
  assert.equal((await agent.request('photo-connection')).status,401);
  const client=createAccountClient({fetchImpl:agent.fetchImpl});
  await client.authenticate('register',{username:'autophoto',password,consent:true,ageConfirmed:true});
  assert.deepEqual(await client.photoConnection(),{path:'/api/youcam'});
  assert.equal((await agent.request('photo-connection','GET',undefined,{'X-Account-ID':'other'})).status,409);
});
