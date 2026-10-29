import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createAccountStore } from '../서버/계정저장소.js';
import { createEntitlementService } from '../서버/이용권.js';
import { createFakePaymentProvider, createPaymentGateway } from '../서버/결제창구.js';
import { ANALYSIS_PASS_PRODUCT_ID, readProductSettings } from '../서버/상품설정.js';
import { createPreparationService } from '../서버/유캠준비.js';
import { createPhotoUI } from '../화면/사진분석.js';
import { EMPTY } from '../화면/계산.js';

const first='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const second='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const request=index=>`${String(index).padStart(8,'0')}-1111-1111-1111-111111111111`;

async function fixture(context,{bypass=[]}={}){
  const database=createAccountStore({dbPath:':memory:'});
  context.after(()=>database.close());
  for(const [id,name] of [[first,'first'],[second,'second']])await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,'test','test',1);
  const dates=new Map([[first,[]],[second,[]]]);
  let time=Date.parse('2026-09-29T10:00:00Z');
  const now=()=>time;
  const entitlements=createEntitlementService({database,now,monthlyLimit:2,trialDays:3,trialBypassAccountIds:bypass,getCheckinDates:async id=>dates.get(id)});
  const provider=createFakePaymentProvider({now});
  const payment=createPaymentGateway({database,provider,now,entitlements});
  return {database,dates,entitlements,provider,payment,setTime:value=>{time=Date.parse(value);}};
}

test('무료 체험은 서로 다른 날 체크인 3회 뒤에만 열리고 서버가 예약을 거절한다',async context=>{
  const {dates,entitlements}=await fixture(context);
  let access=await entitlements.access(first);
  assert.equal(access.trialLocked,true);
  assert.equal(access.remaining,0);
  await assert.rejects(entitlements.reserve(first,request(1),async()=>{},async()=>false),{code:'TRIAL_LOCKED'});
  dates.set(first,['2026-09-27','2026-09-27','2026-09-28']);
  access=await entitlements.access(first);
  assert.equal(access.completedCheckinDays,2);
  assert.equal(access.trialLocked,true);
  dates.get(first).push('2026-09-29');
  access=await entitlements.access(first);
  assert.equal(access.trialLocked,false);
  assert.equal(access.nextAnalysisSource,'free');
  assert.equal(access.maxActions,4);
  await entitlements.reserve(first,request(1),async()=>{},async()=>false);
  await entitlements.transition(first,request(1),'failed',async()=>{});
  assert.equal((await entitlements.access(first)).freeTrialRemaining,1);
  await entitlements.reserve(first,request(2),async()=>{},async()=>false);
  await entitlements.transition(first,request(2),'success',async()=>{});
  assert.equal((await entitlements.access(first)).freeTrialRemaining,0);
  assert.equal((await entitlements.access(second)).trialLocked,true);
});

test('관리자 지정 계정만 체크인 조건을 건너뛰고 설정은 12명을 넘기지 않는다',async context=>{
  const {entitlements}=await fixture(context,{bypass:[first]});
  assert.equal((await entitlements.access(first)).trialUnlocked,true);
  assert.equal((await entitlements.access(second)).trialLocked,true);
  assert.equal(readProductSettings({FREE_TRIAL_BYPASS_ACCOUNT_IDS:first}).trialBypassAccountIds.length,1);
  assert.throws(()=>readProductSettings({FREE_TRIAL_BYPASS_ACCOUNT_IDS:Array(13).fill(first).join(',')}));
});

test('전체 분석 상한은 계정 간 공유되고 실패하면 환급되며 날짜별로 초기화된다',async context=>{
  const {database}=await fixture(context);
  let time=Date.parse('2026-09-29T10:00:00Z');
  const alerts=[];
  const entitlements=createEntitlementService({database,now:()=>time,dailyCap:1,totalCap:2,trialBypassAccountIds:[first,second],onCapThreshold:()=>alerts.push('near')});
  await entitlements.reserve(first,request(70),async()=>{},async()=>false);
  await assert.rejects(entitlements.reserve(second,request(71),async()=>{},async()=>false),{code:'ANALYSIS_DAILY_CAP'});
  await entitlements.transition(first,request(70),'failed',async()=>{});
  await entitlements.reserve(second,request(71),async()=>{},async()=>false);
  assert.equal((await entitlements.capacity()).daily,1);
  assert.ok(alerts.length>=1);
  time+=86_400_000;
  await entitlements.reserve(first,request(72),async()=>{},async()=>false);
  assert.equal((await entitlements.capacity()).total,2);
  time+=86_400_000;
  const third='cccccccc-cccc-cccc-cccc-cccccccccccc';
  await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(third,'third','test','test',1);
  const thirdEntitlements=createEntitlementService({database,now:()=>time,dailyCap:1,totalCap:2,trialBypassAccountIds:[third]});
  await assert.rejects(thirdEntitlements.reserve(third,request(73),async()=>{},async()=>false),{code:'ANALYSIS_TOTAL_CAP'});
});

test('검증된 1회권만 누적되고 중복 요청·실패 환급·미사용 환불이 정확히 반영된다',async context=>{
  const {database,entitlements,provider,payment}=await fixture(context);
  const firstReceipt=provider.issue(first,ANALYSIS_PASS_PRODUCT_ID);
  await assert.rejects(payment.purchase(second,firstReceipt,ANALYSIS_PASS_PRODUCT_ID),{code:'PURCHASE_UNVERIFIED'});
  await assert.rejects(payment.purchase(first,firstReceipt),{code:'PURCHASE_UNVERIFIED'});
  const firstPass=await payment.purchase(first,firstReceipt,ANALYSIS_PASS_PRODUCT_ID);
  const secondPass=await payment.purchase(first,provider.issue(first,ANALYSIS_PASS_PRODUCT_ID),ANALYSIS_PASS_PRODUCT_ID);
  assert.equal(firstPass.analysisPassPriceKrw,3900);
  assert.equal(firstPass.access.oneTimeRemaining,1);
  assert.equal(secondPass.access.oneTimeRemaining,2);
  assert.equal(secondPass.access.maxActions,16);
  await entitlements.reserve(first,request(3),async()=>{},async()=>false);
  const usedPassId=(await database.prepare('SELECT slot FROM analysis_requests WHERE user_id=? AND request_id=?').get(first,request(3))).slot.slice(5);
  assert.ok([firstPass.purchaseId,secondPass.purchaseId].includes(usedPassId));
  const unusedPassId=usedPassId===firstPass.purchaseId?secondPass.purchaseId:firstPass.purchaseId;
  await assert.rejects(entitlements.reserve(first,request(3),async()=>{},async()=>false),{code:'ANALYSIS_USED'});
  assert.equal((await entitlements.access(first)).oneTimeRemaining,1);
  await entitlements.transition(first,request(3),'failed',async()=>{});
  assert.equal((await entitlements.access(first)).oneTimeRemaining,2);
  await payment.refund(first,ANALYSIS_PASS_PRODUCT_ID,unusedPassId);
  assert.equal((await entitlements.access(first)).oneTimeRemaining,1);
  await payment.restore(first,ANALYSIS_PASS_PRODUCT_ID,unusedPassId);
  assert.equal((await entitlements.access(first)).oneTimeRemaining,1);
  await entitlements.reserve(first,request(4),async()=>{},async()=>false);
  await entitlements.transition(first,request(4),'success',async()=>{});
  assert.equal((await entitlements.access(first)).oneTimeRemaining,0);
  await payment.refund(first,ANALYSIS_PASS_PRODUCT_ID,usedPassId);
  assert.equal((await entitlements.access(first)).remaining,0);
});

test('구독 → 1회권 → 무료 순서로 쓰며 1회권은 결제 기간이 바뀌어도 남는다',async context=>{
  const {database,dates,entitlements,provider,payment,setTime}=await fixture(context);
  dates.set(first,['2026-09-26','2026-09-27','2026-09-28']);
  const pass=await payment.purchase(first,provider.issue(first,ANALYSIS_PASS_PRODUCT_ID),ANALYSIS_PASS_PRODUCT_ID);
  await payment.purchase(first,provider.issue(first));
  for(const [index,slot] of [[5,'paid'],[6,'paid'],[7,`pass:${pass.purchaseId}`],[8,'free']]){
    await entitlements.reserve(first,request(index),async()=>{},async()=>false);
    await entitlements.transition(first,request(index),'success',async()=>{});
    assert.equal((await database.prepare('SELECT slot FROM analysis_requests WHERE user_id=? AND request_id=?').get(first,request(index))).slot,slot);
  }
  assert.equal((await entitlements.access(first)).remaining,0);
  setTime('2026-10-31T10:00:00Z');
  assert.equal((await entitlements.access(first)).oneTimeRemaining,0);
  assert.equal((await entitlements.access(first)).freeTrialRemaining,0);
  const newPass=await payment.purchase(first,provider.issue(first,ANALYSIS_PASS_PRODUCT_ID),ANALYSIS_PASS_PRODUCT_ID);
  assert.equal(newPass.access.oneTimeRemaining,1);
  assert.equal(newPass.access.maxActions,16);
});

test('잠긴 체험은 사진 서버의 견적·전송 앞에서 거절되고 유캠을 호출하지 않는다',async context=>{
  const {entitlements}=await fixture(context);
  let service;
  const server=createServer((request,response)=>service.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let externalCalls=0;
  service=createPreparationService({integrated:true,origins:[origin],env:{YOUCAM_API_KEY:'local-test-only-not-a-real-key',YOUCAM_ALLOW_LOOKUP:'1',YOUCAM_ALLOW_ANALYSIS:'1'},verifyAccount:async()=>first,resolveAnalysisAccess:id=>entitlements.access(id),fetchImpl:async()=>{externalCalls++;throw Error('외부 호출 금지');}});
  context.after(async()=>{service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const status=await(await fetch(`${origin}/api/youcam/status`,{headers:{Origin:origin,'X-Photo-Account':'test-ticket'}})).json();
  assert.equal(status.access.trialLocked,true);
  const headers={Origin:origin,'X-Photo-Account':'test-ticket','X-Local-Token':status.localToken};
  const quote=await fetch(`${origin}/api/youcam/analysis/quote`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({consent:true,actions:['moisture']})});
  assert.equal(quote.status,403);
  assert.equal((await quote.json()).error.code,'TRIAL_LOCKED');
  const start=await fetch(`${origin}/api/youcam/analysis/start`,{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:Buffer.alloc(32)});
  assert.equal(start.status,403);
  assert.equal((await start.json()).error.code,'TRIAL_LOCKED');
  assert.equal(externalCalls,0);
});

test('체험 잠금 화면에는 3일 진행 안내만 보이고 사진 선택·분석 버튼은 없다',async()=>{
  const previous=globalThis.document,listeners={};
  globalThis.document={addEventListener:(name,handler)=>{listeners[name]=handler;},getElementById:()=>null};
  try{
    const data=EMPTY();
    const access={tier:'free',remaining:0,freeTrialRemaining:1,trialLocked:true,completedCheckinDays:1,trialRequiredDays:3,maxActions:4};
    const ui=createPhotoUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),photoConnection:async()=>({path:'/api/youcam'}),photoFetch:async address=>Response.json(address.endsWith('/status')?{accountScoped:true,analysisEnabled:true,analysisUsed:false,localToken:'test-only',access}:{used:false,job:null,access}),toast(){}});
    await listeners.click({target:{closest:()=>({dataset:{photo:'connect'}})}});
    const html=ui.render();
    assert.match(html,/3일만 같이 챙겨보면 사진 분석을 한 번 해드릴게요/);
    assert.match(html,/photo-trial-progress">1\/3/);
    assert.doesNotMatch(html,/지금은 사진 분석을 이용할 수 없어요|다시 확인/);
    assert.match(html,/data-photo="checkin"/);
    assert.doesNotMatch(html,/data-photo="start"|id="photo-file"|data-photo-concern/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
