import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today, validateData } from '../화면/계산.js';
import { createFlowUI, goalFirstRoute, needsGoalSetup } from '../화면/시작흐름.js';
import { createSkinUI } from '../화면/피부계획.js';

test('목표 없는 새 계정은 건너뛰기 기록이 있어도 목표 화면으로 보내고 기존 기록은 존중',()=>{
  const fresh=EMPTY(),month=today().slice(0,7);
  assert.equal(needsGoalSetup(fresh),true);
  assert.equal(needsGoalSetup({...fresh,onboarding:true}),true);
  for(const route of ['home','care','records','report'])assert.equal(goalFirstRoute(fresh,route),'goals');
  assert.equal(goalFirstRoute(fresh,'privacy'),'privacy');
  assert.equal(goalFirstRoute(fresh,'terms'),'terms');
  assert.equal(goalFirstRoute(fresh,'settings'),'settings');
  assert.equal(needsGoalSetup({...fresh,goals:{selected:['skin'],note:''}}),false);
  assert.equal(goalFirstRoute({...fresh,goals:{selected:['skin'],note:''}},'care'),'care');
  assert.equal(needsGoalSetup({...fresh,goals:{selected:[],note:'내 취향 찾기'}}),false);
  assert.equal(needsGoalSetup({...fresh,budgets:{[month]:0}}),false);
  assert.equal(needsGoalSetup({...fresh,wishes:[{id:'legacy'}]}),false);
  assert.equal(needsGoalSetup({...fresh,schedules:[{id:'legacy'}]}),false);
  assert.equal(needsGoalSetup({...fresh,skinCare:{...fresh.skinCare,checkins:[{date:today()}]}}),false);
});

test('목표를 입력하지 않거나 저장에 실패하면 진행하지 않고, 저장 성공 후에만 이동',async()=>{
  const previousDocument=globalThis.document,previousFormData=globalThis.FormData;
  const listeners={};globalThis.document={addEventListener(type,callback){(listeners[type]??=[]).push(callback);}};
  try{
    let saved=EMPTY(),navigated=null,succeeds=false;
    createFlowUI({state:()=>({data:saved,busy:false,demo:false,storageError:false}),persist:async next=>{if(!succeeds)return false;saved=validateData(next);return true;},navigate:route=>{navigated=route;}});
    const error={textContent:''},button={disabled:false};
    const form={id:'goals-form',querySelector:selector=>selector==='.form-error'?error:button};
    const event={target:form,preventDefault(){}};
    let selected=[];
    globalThis.FormData=class {getAll(){return selected;}get(){return '';}};
    const submit=async()=>{for(const listener of listeners.submit)await listener(event);};
    await submit();
    assert.match(error.textContent,/목표를 하나 선택/);
    assert.equal(saved.onboarding,false);assert.equal(navigated,null);
    selected=['skin'];await submit();
    assert.equal(button.disabled,false);assert.equal(saved.onboarding,false);assert.equal(navigated,null);
    succeeds=true;await submit();
    assert.deepEqual(saved.goals.selected,['skin']);
    assert.equal(saved.onboarding,true);assert.equal(navigated,'care');
    assert.equal(needsGoalSetup(saved),false);
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousFormData===undefined)delete globalThis.FormData;else globalThis.FormData=previousFormData;}
});

test('목표 저장 뒤 피부 느낌을 받고 루틴을 먼저 보여준 다음 사진 체험으로 이어간다',()=>{
  const previousDocument=globalThis.document;
  globalThis.document={addEventListener(){}};
  try{
    const fresh=validateData({...EMPTY(),goals:{selected:['skin'],note:''}}),month=today().slice(0,7);
    const makeUI=data=>createSkinUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false})});
    const first=makeUI(fresh).render();
    assert.match(first,/사진 분석 전, 피부 느낌만 알려주세요/);
    assert.ok(first.indexOf('id="care-routine-start"')<first.indexOf('id="photo-analysis"'));
    const withBudget=makeUI(validateData({...fresh,budgets:{[month]:0}})).render();
    assert.doesNotMatch(withBudget,/이제 예산을 정해볼까요/);
    assert.ok(withBudget.indexOf('id="care-routine-start"')<withBudget.indexOf('id="photo-analysis"'));
    const profile={feel:'unsure',concerns:[],sensitivity:'unsure',discomfort:'no',priority:'comfort',budget:null,updatedAt:today()};
    const ready=makeUI(validateData({...fresh,skinCare:{...fresh.skinCare,profile}})).render();
    assert.ok(ready.indexOf('id="care-routine-start"')<ready.indexOf('id="photo-analysis"'));
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
