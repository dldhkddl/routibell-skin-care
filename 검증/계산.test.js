import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today, summary, suggestions, validateData, validateRecord, validDate } from '../화면/계산.js';
const month=today().slice(0,7);
const record=(extra={})=>({id:'record-1',title:'수분 크림',category:'cosmetic',amount:30000,date:today(),rating:null,repurchase:null,memo:'',...extra});
test('월별 지출과 예산 초과를 계산하며 다른 달의 지출은 제외',()=>{
 const d={version:1,budgets:{[month]:50000},records:[record(),record({id:'2',amount:25000}),record({id:'3',date:'2000-01-01',amount:100000})]};
 const s=summary(d,month);assert.equal(s.total,55000);assert.equal(s.remaining,-5000);assert.equal(s.average,null);assert.equal(s.records.length,2);
});
test('미평가는 0점에 포함하지 않으며 무료 소비도 기록',()=>{
 const d={...EMPTY(),records:[record({rating:5,amount:0}),record({id:'2'})]};
 const s=summary(d,month);assert.equal(s.average,5);assert.equal(s.rated,1);assert.equal(s.budget,null);assert.equal(s.total,30000);
});
test('예산 0원과 예산 미설정을 구분하고 초과 시 구매 보류',()=>{
 const d={...EMPTY(),budgets:{[month]:0},records:[record()]};
 assert.equal(summary(d,month).budget,0);assert.ok(suggestions(d,month).some(t=>t.title.includes('쉬어가요')));
});
test('한 번의 낮은 평가로 분야 전체가 나쁘다고 추천하지 않음',()=>{
 const d={...EMPTY(),records:[record({rating:1})]};
 assert.ok(!suggestions(d,month).some(t=>t.title.includes('화장품, 다음')));
 d.records.push(record({id:'2',rating:2}));assert.ok(suggestions(d,month).some(t=>t.title.includes('화장품, 다음')));
});
test('만족도가 높아도 지출 확대를 권하지 않음',()=>{
 const d={...EMPTY(),budgets:{[month]:100000},records:[record({rating:5}),record({id:'2',rating:4})]};
 assert.ok(suggestions(d,month).some(t=>t.text.includes('추가 구매가 필요하다는 뜻은 아니에요')));
 assert.ok(suggestions(d,month).some(t=>t.title.includes('꼭 쓰지 않아도')));
});
test('백업을 검증하고 지원하지 않는 필드는 제거',()=>{
 const d=validateData({...EMPTY(),records:[{...record(),unknown:'remove'}]});assert.equal(d.records[0].unknown,undefined);
 assert.throws(()=>validateData({...EMPTY(),records:[record(),record()]}),/중복/);
 assert.throws(()=>validateData({...EMPTY(),budgets:{'__bad__':100}}));
 assert.throws(()=>validateRecord(record({amount:-1})));
 assert.throws(()=>validateRecord(record({amount:Infinity})));
 assert.throws(()=>validateRecord(record({rating:0})));
 assert.throws(()=>validateRecord(record({rating:'5'})));
 assert.throws(()=>validateRecord(record({category:'invalid'})));
 assert.throws(()=>validateRecord(record({title:' '})));
 assert.throws(()=>validateRecord(record({date:'2099-01-01'})));
});
test('존재하지 않는 날짜와 잘못된 월을 거절',()=>{
 assert.equal(validDate('2025-02-29'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-04-31'),false);
 assert.throws(()=>validateData({...EMPTY(),budgets:{'2026-13':300000}}));
});
