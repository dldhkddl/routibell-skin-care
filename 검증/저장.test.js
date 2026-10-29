import test from 'node:test';
import assert from 'node:assert/strict';
import { readData, writeData } from '../화면/저장.js';
import { EMPTY } from '../화면/계산.js';

test('저장 실패·잘못된 백업은 기존 저장 문자열을 덮어쓰지 않음',async()=>{
  let stored=JSON.stringify({version:1,budgets:{'2025-01':12345},records:[]});
  const original=stored;
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:()=>{throw Error('저장 공간 부족');}}});
  try {
const migrated=await readData();assert.equal(migrated.version,6);assert.equal(migrated.budgets['2025-01'],12345);
    await assert.rejects(writeData(EMPTY()),/저장 공간 부족/);assert.equal(stored,original);
    await assert.rejects(writeData({...EMPTY(),inventory:[{}]}));assert.equal(stored,original);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}}});
    await writeData(migrated);assert.deepEqual(await readData(),migrated);
    stored='깨진 JSON';await assert.rejects(readData());assert.equal(stored,'깨진 JSON');
  } finally {
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
  }
});
