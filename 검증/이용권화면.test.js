import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSubscription } from '../화면/이용권화면.js';

test('무료와 구독 권한·임시 가격·갱신·해지·환불이 한 화면에 표시된다',()=>{
  const page=renderSubscription({
    priceKrw:7900,analysisPassPriceKrw:3900,monthlyAnalyses:2,billingAvailable:false,
    access:{tier:'free',freeTrialRemaining:0,remaining:0,autoRenew:false,expiresAt:null},
  });
  for(const text of ['무료 분석 체험을 사용했어요','체크인','내 화장대','1회권','4개 항목','16개 항목','2회','3,900원','7,900원','자동 갱신','해지','환불','임시값'])assert.match(page,new RegExp(text));
  assert.doesNotMatch(page,/data-subscription-purchase|구매 완료/);
  assert.match(page,/사진·관리 화면으로 돌아가기/);
});

test('활성 구독은 남은 횟수·기간과 해지 상태를 함께 표시한다',()=>{
  const page=renderSubscription({
    priceKrw:9900,monthlyAnalyses:2,billingAvailable:false,
    access:{tier:'subscription',remaining:1,autoRenew:false,expiresAt:Date.parse('2026-10-29T00:00:00Z')},
  });
  assert.match(page,/1회 남았어요/);
  assert.match(page,/9,900원/);
  assert.match(page,/해지됨/);
});
