import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../서버/계정저장소.js';
import { createEntitlementService } from '../서버/이용권.js';

const firstId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const secondId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const requestIds=[
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
];

async function fixture(context){
  const database=createAccountStore({dbPath:':memory:'});
  context.after(()=>database.close());
  for(const [id,name] of [[firstId,'first'],[secondId,'second']]){
    await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,'test','test',1);
  }
  let time=Date.parse('2026-09-29T10:00:00Z');
  const entitlements=createEntitlementService({database,now:()=>time,monthlyLimit:2,getCheckinDates:async()=>['2026-09-26','2026-09-27','2026-09-28']});
  return {database,entitlements,setTime:value=>{time=Date.parse(value);}};
}

test('무료 체험은 계정마다 한 번이고 같은 요청ID가 횟수를 다시 차감하지 않는다',async context=>{
  const {entitlements}=await fixture(context);
  assert.equal((await entitlements.access(firstId)).remaining,1);
  await entitlements.reserve(firstId,requestIds[0],async()=>{},async()=>false);
  await assert.rejects(entitlements.reserve(firstId,requestIds[0],async()=>{},async()=>false),{code:'ANALYSIS_USED'});
  assert.equal((await entitlements.access(firstId)).remaining,0);
  await assert.rejects(entitlements.reserve(firstId,requestIds[1],async()=>{},async()=>false),{code:'UPGRADE_REQUIRED'});
  assert.equal((await entitlements.access(secondId)).remaining,1);
  await entitlements.transition(firstId,requestIds[0],'failed',async()=>{});
  assert.equal((await entitlements.access(firstId)).remaining,1);
  await entitlements.reserve(firstId,requestIds[1],async()=>{},async()=>false);
  await entitlements.transition(firstId,requestIds[1],'success',async()=>{});
  assert.equal((await entitlements.access(firstId)).remaining,0);
});

test('구독 두 회를 먼저 쓰고 무료 체험을 쓴 뒤 만료되면 결제 기간만 초기화된다',async context=>{
  const {database,entitlements,setTime}=await fixture(context);
  const start=Date.parse('2026-09-20T00:00:00Z'),end=Date.parse('2026-10-20T00:00:00Z');
  await database.prepare('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?,?)').run(firstId,'fake','sandbox-sub','active',start,end,1,start);
  assert.deepEqual(((await entitlements.access(firstId)).maxActions),(16));
  await entitlements.reserve(firstId,requestIds[0],async()=>{},async()=>false);
  await entitlements.transition(firstId,requestIds[0],'success',async()=>{});
  await entitlements.reserve(firstId,requestIds[1],async()=>{},async()=>false);
  assert.equal((await entitlements.access(firstId)).subscriptionRemaining,0);
  assert.equal((await entitlements.access(firstId)).nextAnalysisSource,'free');
  await entitlements.reserve(firstId,requestIds[2],async()=>{},async()=>false);
  await entitlements.transition(firstId,requestIds[2],'success',async()=>{});
  assert.equal((await entitlements.access(firstId)).remaining,0);
  await database.prepare("UPDATE subscriptions SET status='canceled',auto_renew=0 WHERE user_id=?").run(firstId);
  assert.equal((await entitlements.access(firstId)).remaining,0);
  setTime('2026-10-20T00:00:00Z');
  assert.equal((await entitlements.access(firstId)).tier,'free');
  assert.equal((await entitlements.access(firstId)).remaining,0);
  await database.prepare("UPDATE subscriptions SET status='active',period_start=?,period_end=?,auto_renew=1 WHERE user_id=?").run(end,Date.parse('2026-11-20T00:00:00Z'),firstId);
  assert.equal((await entitlements.access(firstId)).remaining,2);
});

test('이전 서버에서 이미 쓴 체험은 새 테이블에서도 재사용하지 않는다',async context=>{
  const {database,entitlements}=await fixture(context);
  await database.prepare('INSERT INTO photo_usage VALUES(?,?,?,?)').run(firstId,1,null,1);
  assert.equal((await entitlements.access(firstId)).remaining,0);
  assert.equal((await entitlements.access(secondId)).remaining,1);
});
