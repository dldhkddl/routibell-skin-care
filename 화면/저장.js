import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { EMPTY, validateData } from './계산.js';
const KEY='beautylog-v1';
let pendingWrite=Promise.resolve();
export async function readData(){
  const value=Capacitor.isNativePlatform()?(await Preferences.get({key:KEY})).value:localStorage.getItem(KEY);
  return value?validateData(JSON.parse(value)):EMPTY();
}
export async function writeData(data, expected){
  const value=JSON.stringify(validateData(data));
  const commit=async()=>{
    if(expected!==undefined && JSON.stringify(validateData(await readData()))!==JSON.stringify(validateData(expected))){
      const issue=Error('다른 창에서 기록이 변경됐어요. 입력 내용을 따로 보관하고 새로고침한 뒤 다시 확인해 주세요.');
      issue.name='DataConflict';throw issue;
    }
    if(Capacitor.isNativePlatform())await Preferences.set({key:KEY,value});
    else localStorage.setItem(KEY,value);
  };
  const operation=pendingWrite.then(()=>!Capacitor.isNativePlatform() && typeof navigator!=='undefined' && navigator.locks ? navigator.locks.request('beautylog-write',commit) : commit());
  pendingWrite=operation.catch(()=>{});
  await operation;
}
