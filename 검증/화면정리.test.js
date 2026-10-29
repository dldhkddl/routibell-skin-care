import test from 'node:test';
import assert from 'node:assert/strict';
import { copyDetails, numericCard, primaryCandidate, actionVisible, syncScreenAction } from '../화면/화면정리.js';

test('안내는 짧은 본문과 닫힌 자세히 보기로 나누고 사용자 문자열을 이스케이프한다',()=>{
  const html=copyDetails('보습 <확인>','<p>전체 설명</p>','자세히 <보기>');
  assert.match(html,/<p class="card-copy">보습 &lt;확인&gt;<\/p>/);
  assert.match(html,/<details class="card-details"><summary>자세히 &lt;보기&gt;<\/summary><div><p>전체 설명<\/p>/);
  assert.doesNotMatch(html,/<details[^>]* open/);
  assert.equal(copyDetails('',''),'');
  assert.match(numericCard('남은 예산',0,'원'),/<strong>0<small>원<\/small><\/strong>/);
  assert.match(numericCard('<체크율>','미설정'),/&lt;체크율&gt;/);
});

test('화면 주요 행동은 보이는 활성 버튼 중 우선순위 하나만 고르며 원본 목록을 바꾸지 않는다',()=>{
  const entries=[{element:'일반',visible:true,priority:0},{element:'저장',visible:true,priority:20},{element:'숨김',visible:false,priority:100},{element:'불가',visible:true,disabled:true,priority:100}];
  const before=JSON.stringify(entries);
  assert.equal(primaryCandidate(entries),'저장');
  assert.equal(JSON.stringify(entries),before);
  assert.equal(primaryCandidate([]),null);
  assert.equal(primaryCandidate([{visible:true,disabled:true}]),null);
});

function action({parentElement=null,hidden=false,rects=true}={}){
  const classes=new Set();
  return {parentElement,tagName:'BUTTON',getClientRects:()=>rects?[{}]:[],closest:()=>hidden?{}:null,dataset:{},getAttribute:()=>null,matches:()=>false,classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)}};
}

test('접힌 설명 안의 저장 버튼은 크기가 남아 있어도 주요 행동으로 선택하지 않는다',()=>{
  const summary={tagName:'SUMMARY',contains:element=>element===summary};
  const details={tagName:'DETAILS',open:false,children:[summary],parentElement:null};
  const button=action({parentElement:details});
  assert.equal(actionVisible(button),false);
  details.open=true;assert.equal(actionVisible(button),true);
  details.open=false;Object.assign(summary,action({parentElement:details}),{tagName:'SUMMARY'});
  assert.equal(actionVisible(summary),true);
  const inner={tagName:'DETAILS',open:true,children:[],parentElement:details};
  assert.equal(actionVisible(action({parentElement:inner})),false);
  assert.equal(actionVisible(action({hidden:true})),false);
  assert.equal(actionVisible(action({rects:false})),false);
});

test('펼침·접힘·팝업 전환 때 기존 강조를 해제하고 하나만 남긴다',()=>{
  const summary=action(),save=action(),dialogSave=action();
  summary.dataset.mainAction='5';save.matches=()=>true;dialogSave.matches=()=>true;
  const details={tagName:'DETAILS',open:false,children:[{tagName:'SUMMARY',contains:()=>false}],parentElement:null};
  save.parentElement=details;
  let popup=false;
  const scope={querySelectorAll:()=>[summary,save]},dialog={querySelectorAll:()=>[dialogSave]};
  const all=[summary,save,dialogSave];
  const root={querySelector:()=>scope,querySelectorAll:selector=>selector==='dialog[open]'?(popup?[dialog]:[]):all.filter(item=>item.classList.contains('screen-primary'))};
  const active=()=>all.filter(item=>item.classList.contains('screen-primary'));
  syncScreenAction(root);assert.deepEqual(active(),[summary]);
  details.open=true;syncScreenAction(root);assert.deepEqual(active(),[save]);
  popup=true;syncScreenAction(root);assert.deepEqual(active(),[dialogSave]);
  popup=false;save.disabled=true;syncScreenAction(root);assert.deepEqual(active(),[summary]);
});
