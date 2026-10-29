import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today } from '../화면/계산.js';
import { buildSkinPlan, emptyCare } from '../화면/피부계산.js';
import { createSkinUI } from '../화면/피부계획.js';

test('화장대의 클렌저·크림·선크림이 현재 루틴 모든 단계에 표시된다', context=>{
  const previous=globalThis.document;
  globalThis.document={addEventListener(){},getElementById(){return null;}};
  context.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const inventory=['cleanser','cream','sunscreen'].map(kind=>({id:`owned-${kind}`,title:`내 ${kind}`,category:'cosmetic',kind,comfort:'unknown',status:'available',remaining:60,opened:null,expires:null,memo:''}));
  const data={...EMPTY(),inventory,skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:today()}}};
  const plan=buildSkinPlan(data,today());
  assert.deepEqual(plan.morning.map(step=>step.product?.id),inventory.map(item=>item.id));
  assert.deepEqual(plan.evening.map(step=>step.product?.id),inventory.slice(0,2).map(item=>item.id));
  const html=createSkinUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false}),render(){},toast(){}}).render();
  for(const item of inventory)assert.match(html,new RegExp(item.title));
  assert.equal((html.match(/내 화장대 · /g)??[]).length,5);
  assert.equal((html.match(/내 cleanser/g)??[]).length,2);
  assert.equal((html.match(/내 cream/g)??[]).length,2);
  assert.equal((html.match(/내 sunscreen/g)??[]).length,1);
});
