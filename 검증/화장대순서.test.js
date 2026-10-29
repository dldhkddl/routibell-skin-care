import test from 'node:test';
import assert from 'node:assert/strict';
import { vanityRoutine, sortVanity, PRODUCT_KINDS } from '../화면/화장대순서.js';
import { validateInventory } from '../화면/계획계산.js';

const product=(kind,id=kind)=>validateInventory({id,title:PRODUCT_KINDS[kind],category:'cosmetic',kind,comfort:'unknown',remaining:100,status:'available',opened:'',expires:'',memo:''});

test('종류만 입력해도 아침과 저녁 화장대 순서를 자동으로 보여준다',()=>{
  const routine=vanityRoutine(['sunscreen','cream','serum','toner','cleanser','eyecream'].map(kind=>product(kind)));
  assert.deepEqual(routine.morning.map(item=>item.kind),['cleanser','toner','serum','eyecream','cream','sunscreen']);
  assert.deepEqual(routine.evening.map(item=>item.kind),['cleanser','toner','serum','eyecream','cream']);
  assert.match(routine.tips.join(' '),/세럼은 토너 다음/);
  assert.deepEqual(sortVanity(['serum','cleanser','toner'].map(kind=>product(kind))).map(item=>item.kind),['cleanser','toner','serum']);
});

test('불편하거나 다 쓴 제품은 빼고 선크림 누락과 함께 쓰지 않을 조합을 알려준다',()=>{
  const routine=vanityRoutine([product('retinol'),product('exfoliant'),product('cream'),{...product('sunscreen'),comfort:'uncomfortable'}]);
  assert.deepEqual(routine.evening.map(item=>item.kind),['cream']);
  assert.ok(routine.tips.some(tip=>tip.includes('같은 날 저녁')));
  assert.ok(routine.tips.some(tip=>tip.includes('아침 선크림')));
  assert.throws(()=>product('unknown'));
});
