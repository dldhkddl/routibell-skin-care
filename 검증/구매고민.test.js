import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,today,validateData,validateWish,summary} from '../화면/계산.js';
import {recommend,purchaseWish,removeRecord} from '../화면/추천계산.js';
const month=today().slice(0,7);
const wish=extra=>({id:'wish1',title:'새 크림',month,limit:30000,priority:'price',owned:false,status:'pending',productId:null,recordId:null,...extra});
const fixture=extra=>({...EMPTY(),budgets:{[month]:100000},wishes:[wish()],...extra});
test('이전 백업은 예산과 기록을 유지하며 빈 고민함으로 이전',()=>{
 const old={version:1,budgets:{[month]:12345},records:[]};
 const next=validateData(old);assert.equal(next.version,6);assert.equal(next.budgets[month],12345);assert.deepEqual(next.wishes,[]);assert.equal(old.version,1);
 assert.throws(()=>validateData({version:2,budgets:{},records:[]}));
});
test('배송비 포함 한도, 예산 0원, 월 예산 미설정을 구분',()=>{
 const d=fixture();const w=wish({limit:15000});assert.equal(recommend(d,w).candidates.filter(p=>p.eligible).length,0);
 assert.equal(recommend(d,wish({limit:16100})).candidates.filter(p=>p.eligible).length,1);
 assert.equal(recommend(fixture({budgets:{[month]:0}}),wish()).cap,0);
 assert.equal(recommend(fixture({budgets:{}}),wish()).cap,30000);
 assert.ok(recommend(fixture({budgets:{}}),wish()).reasons.some(x=>x.includes('월 예산이 없어')));
});
test('기존 제품 보유 시 보류를 먼저 제안하고 과거 가격은 적합 후보에서 제외',()=>{
 assert.equal(recommend(fixture(),wish({owned:true})).hold,true);
 const r=recommend(fixture(),wish(),'2026-11-01');assert.equal(r.stale,true);assert.ok(r.candidates.every(p=>!p.eligible));
});
test('실제 구매만 소비로 연결하고 중복 저장을 막으며 삭제 시 연결을 해제',()=>{
 const d=fixture();const next=purchaseWish(d,'wish1','soonjung',15500,today());
 assert.equal(d.records.length,0);assert.equal(next.records.length,1);assert.equal(summary(next,month).total,15500);
 assert.equal(next.records[0].rating,null);assert.equal(next.wishes[0].status,'purchased');
 assert.throws(()=>purchaseWish(next,'wish1','soonjung',15500,today()),/이미/);
 const removed=removeRecord(next,next.records[0].id);assert.equal(removed.wishes[0].status,'pending');assert.equal(removed.wishes[0].recordId,null);assert.equal(removed.records.length,0);
 assert.equal(validateData(JSON.parse(JSON.stringify(next))).wishes[0].recordId,next.records[0].id);
});
test('보류는 지출에 포함하지 않고 다른 달의 구매는 실제 구매 월에 집계',()=>{
 const d=fixture({wishes:[wish({status:'held',month:'2000-01'})]});
 assert.equal(summary(d,month).total,0);
 const next=purchaseWish(d,'wish1','atobarrier',28050,today());assert.equal(summary(next,month).total,28050);assert.equal(summary(next,'2000-01').total,0);
});
test('내 재구매 거절과 실제 만족도를 다음 후보에 반영',()=>{
 const next=purchaseWish(fixture(),'wish1','soonjung',15500,today());
 next.records[0].rating=2;next.records[0].repurchase=false;
 const p=recommend(next,wish({id:'wish2'})).candidates.find(p=>p.id==='soonjung');assert.equal(p.eligible,false);assert.equal(p.previous.rating,2);
});
test('손상된 고민 백업과 끊어진 연결, 중복 링크를 거절',()=>{
 assert.throws(()=>validateWish(wish({limit:-1})));assert.throws(()=>validateWish(wish({owned:'yes'})));
 assert.throws(()=>validateData(fixture({wishes:[wish(),wish()]})),/중복/);
 assert.throws(()=>validateData(fixture({wishes:[wish({status:'purchased',recordId:'missing'})]})),/연결/);
 assert.throws(()=>purchaseWish(fixture(),'wish1','unknown',1,today()));
 assert.throws(()=>purchaseWish(fixture(),'wish1','soonjung',-1,today()));
});
