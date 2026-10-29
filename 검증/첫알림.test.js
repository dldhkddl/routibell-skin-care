import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY } from '../화면/계산.js';
import { createReminderUI, shouldOfferFirstReminder } from '../화면/알림화면.js';

test('첫 체크인 알림 권유는 Android에서만 보이고 거절해도 다시 묻지 않는다',async context=>{
  assert.equal(shouldOfferFirstReminder({native:false,firstCheckin:true,alreadyAsked:false,enabled:false}),false);
  assert.equal(shouldOfferFirstReminder({native:true,firstCheckin:true,alreadyAsked:false,enabled:false}),true);
  assert.equal(shouldOfferFirstReminder({native:true,firstCheckin:true,alreadyAsked:true,enabled:false}),false);
  const previousDocument=globalThis.document;
  globalThis.document={addEventListener(){},getElementById(){return null;}};
  context.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  const values=new Map(),dialogs=[];
  const storage={get:async({key})=>({value:values.get(key)??null}),set:async({key,value})=>{values.set(key,value);}};
  const data=EMPTY();data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:'2026-09-30'};
  const create=()=>createReminderUI({state:()=>({ready:true,user:{id:'test-user'},identity:'test-user',data,demo:false}),dialog:(title,body)=>dialogs.push({title,body}),toast(){},navigate(){}},{platform:()=> 'android',storage,notifications:{}});
  await create().offerFirstCheckin();
  assert.equal(dialogs.length,1);
  assert.match(dialogs[0].title,/내일 아침에도 챙겨드릴까요/);
  assert.match(dialogs[0].body,/알림 켜기.*괜찮아요|괜찮아요.*알림 켜기/);
  await create().offerFirstCheckin();
  assert.equal(dialogs.length,1);
});
