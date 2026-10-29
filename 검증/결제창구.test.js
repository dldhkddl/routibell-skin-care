import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../서버/계정저장소.js';
import { createEntitlementService } from '../서버/이용권.js';
import { createFakePaymentProvider, createPaymentGateway } from '../서버/결제창구.js';

const first='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const second='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function fixture(context){
  const database=createAccountStore({dbPath:':memory:'});
  context.after(()=>database.close());
  for(const [id,name] of [[first,'first'],[second,'second']])await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,'test','test',1);
  let time=Date.parse('2026-09-29T10:00:00Z');
  const now=()=>time,entitlements=createEntitlementService({database,now,monthlyLimit:2,getCheckinDates:async()=>['2026-09-26','2026-09-27','2026-09-28']});
  const provider=createFakePaymentProvider({now});
  const payment=createPaymentGateway({database,provider,now,entitlements,price:7900});
  return {database,provider,payment,setTime:value=>{time=Date.parse(value);}};
}

test('시험 공급자 구매 확인·해지·만료·복원은 서버 권한과 맞물리고 결제는 발생하지 않는다',async context=>{
  const {provider,payment,setTime}=await fixture(context);
  const receipt=provider.issue(first);
  await assert.rejects(payment.purchase(second,receipt),{code:'PURCHASE_UNVERIFIED'});
  assert.equal((await payment.purchase(first,receipt)).access.tier,'subscription');
  assert.equal((await payment.status(first)).access.subscriptionRemaining,2);
  await assert.rejects(payment.purchase(first,receipt),{code:'PURCHASE_UNVERIFIED'});
  const canceled=await payment.cancel(first);
  assert.equal(canceled.access.tier,'subscription');
  assert.equal(canceled.access.autoRenew,false);
  assert.equal((await payment.restore(first)).access.tier,'subscription');
  setTime('2026-10-30T10:00:00Z');
  assert.equal((await payment.restore(first)).access.tier,'free');
  assert.equal((await payment.status(second)).access.tier,'free');
});

test('갱신은 결제기간을 옮기고 환불은 즉시 유료 권한을 없앤다',async context=>{
  const {provider,payment,setTime}=await fixture(context);
  await payment.purchase(first,provider.issue(first));
  const original=(await payment.status(first)).access.periodStart;
  setTime('2026-10-29T10:00:00Z');
  const renewed=await payment.renew(first);
  assert.ok(renewed.access.periodStart>original);
  setTime('2026-10-30T10:00:00Z');
  assert.equal((await payment.status(first)).access.tier,'subscription');
  assert.equal((await payment.refund(first)).access.tier,'free');
  assert.equal((await payment.restore(first)).access.tier,'free');
});

test('실제 공급자 미설정 때 구매·해지는 차단하되 무료 상태 조회는 유지한다',async context=>{
  const {database}=await fixture(context);
  const entitlements=createEntitlementService({database});
  const gateway=createPaymentGateway({database,entitlements});
  assert.equal((await gateway.status(first)).billingAvailable,false);
  await assert.rejects(gateway.purchase(first,'anything'),{code:'PAYMENT_UNAVAILABLE'});
  await assert.rejects(gateway.cancel(first),{code:'PAYMENT_UNAVAILABLE'});
});
