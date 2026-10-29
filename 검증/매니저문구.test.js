import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY } from '../화면/계산.js';
import { checkinReply, consecutiveCareDays, managerMemory, weeklyCareLine, createDailyTemplatePicker } from '../화면/매니저문구.js';

const asOf='2026-09-28';
const day=(date,done=true)=>({date,morning:done,evening:false,morningProducts:[],eveningProducts:[]});
const fixture=()=>{
  const data=EMPTY();
  data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:asOf};
  return data;
};
const product={id:'cream-one',title:'쓰던 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:60,opened:'2026-09-01',expires:'2099-12-31',memo:''};
const recentPhoto=data=>{data.skinCare.observation={provider:'youcam',version:'v2.1',date:'2026-09-27',focus:'moisture',actions:['pore','moisture'],scores:{pore:74,moisture:56}};};

test('기록 없는 신규 계정에는 기억 문구도 기본 문구도 넣지 않는다',()=>{
  assert.equal(managerMemory(EMPTY(),asOf),'');
  assert.equal(managerMemory(fixture(),asOf),'');
  assert.equal(weeklyCareLine(fixture(),asOf),'');
});

test('불편함이 칭찬·분석·제품보다 앞서고 어제라고 말할 근거가 있을 때만 말한다',()=>{
  const data=fixture();
  data.inventory=[product];recentPhoto(data);
  data.skinCare.days=[day('2026-09-26'),day('2026-09-27')];
  data.skinCare.checkins=[{date:'2026-09-27',feeling:'uncomfortable',adherence:'yes',feel:null,product:null,memo:''}];
  data.skinCare.profile.discomfort='yes';data.skinCare.profile.updatedAt='2026-09-27';
  assert.equal(managerMemory(data,asOf),'어제 불편했죠. 오늘은 순하게 가요.');
  data.skinCare.checkins=[];data.skinCare.profile.updatedAt='2026-09-20';
  assert.equal(managerMemory(data,asOf),'불편하셨죠. 느낌부터 살펴봐요.');
});

test('연속 실천 2일 이상만 칭찬하고, 부분 답변이라도 실제 완료가 없는 날은 세지 않는다',()=>{
  const data=fixture();recentPhoto(data);
  data.skinCare.days=[day('2026-09-25'),day('2026-09-26'),day('2026-09-27')];
  assert.equal(consecutiveCareDays(data.skinCare,asOf),3);
  assert.equal(managerMemory(data,asOf),'3일 연속 챙기셨네요.');
  assert.equal(checkinReply(data.skinCare,'yes',asOf),'좋아요, 4일째예요.');
  data.skinCare.days=[day('2026-09-26'),day('2026-09-27',false)];
  assert.equal(consecutiveCareDays(data.skinCare,asOf),0);
  assert.equal(managerMemory(data,asOf),'지난 수분 관찰을 기억해요. 아침 보습부터 가볍게 챙겨볼까요?');
});

test('분석은 숫자 항목 하나만 이름으로 기억하며 없는 값과 피부 타입은 순위에 넣지 않는다',()=>{
  const data=fixture();recentPhoto(data);
  assert.equal(managerMemory(data,asOf),'지난 수분 관찰을 기억해요. 아침 보습부터 가볍게 챙겨볼까요?');
  data.skinCare.observation.actions.push('skin_type');data.skinCare.observation.scores.skin_type=0;
  assert.equal(managerMemory(data,asOf),'지난 수분 관찰을 기억해요. 아침 보습부터 가볍게 챙겨볼까요?');
  data.skinCare.observation.actions=['skin_type'];data.skinCare.observation.scores={skin_type:null};
  assert.equal(managerMemory(data,asOf),'');
});

test('제품 선택 안내와 30일 지난 분석 안내는 앞선 항목이 없을 때만 보인다',()=>{
  const data=fixture();data.inventory=[{...product,comfort:'uncomfortable'}];
  assert.equal(managerMemory(data,asOf),'');
  data.inventory=[product];
  assert.equal(managerMemory(data,asOf),'가진 제품을 바르는 순서로 정리했어요.');
  data.skinCare.observation={provider:'youcam',version:'v2.1',date:'2026-08-29',focus:'moisture',actions:['moisture'],scores:{moisture:56}};
  assert.equal(managerMemory(data,asOf),'가진 제품을 바르는 순서로 정리했어요.');
  const cleanser={...product,id:'cleanser-one',title:'쓰던 세안제',kind:'cleanser'};
  const sunscreen={...product,id:'sunscreen-one',title:'쓰던 선크림',kind:'sunscreen'};
  data.inventory.push(cleanser,sunscreen);
  data.skinCare.selection={cleanser:cleanser.id,cream:product.id,sunscreen:sunscreen.id};
  assert.equal(managerMemory(data,asOf),'지난 관찰 후 4주가 지났어요.');
  data.skinCare.observation.date='2026-09-01';
  assert.equal(managerMemory(data,asOf),'지난 수분 관찰을 기억해요. 아침 보습부터 가볍게 챙겨볼까요?');
});

test('버튼 답변과 최근 7일 요약은 실제 완료 일수만 말한다',()=>{
  const data=fixture();
  data.skinCare.days=[day('2026-09-21'),day('2026-09-22'),day('2026-09-24'),day('2026-09-26'),day('2026-09-27'),day(asOf)];
  assert.equal(weeklyCareLine(data,asOf),'최근 7일 중 5일 챙기셨어요.');
  assert.equal(checkinReply(data.skinCare,'pending',asOf),'괜찮아요, 저녁에 다시 기록해도 돼요.');
  assert.equal(checkinReply(data.skinCare,'some',asOf),'일부만 챙기셨군요. 한 가지씩 가요.');
  assert.equal(checkinReply(data.skinCare,'yes',asOf),'좋아요, 3일째예요.');
});

test('상황마다 세 문구를 제공하고 점수·진단 없이 하나만 표시한다',()=>{
  const data=fixture();recentPhoto(data);
  const variants=[];
  managerMemory(data,asOf,options=>{variants.push(...options);return options[0];});
  assert.equal(new Set(variants).size,3);
  for(const text of variants){assert.match(text,/수분/);assert.doesNotMatch(text,/56|74|나빠|문제|진단|빨강/);}
  let chosen=0;assert.equal(managerMemory(EMPTY(),asOf,()=>{chosen++;return '기본문구';}),'');assert.equal(chosen,0);
});

test('색소 집중 항목은 홈에서 아침 선크림을 떠올리게 한다',()=>{
  const data=fixture();
  data.skinCare.observation={provider:'youcam',version:'v2.1',date:'2026-09-27',focus:'age_spot',actions:['age_spot'],scores:{age_spot:35}};
  const text=managerMemory(data,asOf);
  assert.match(text,/선크림/);
  assert.doesNotMatch(text,/35|치료|진단/);
});

test('같은 날 재표시·재로그인에는 유지하고 전날 선택은 제외하여 무작위로 고른다',()=>{
  const values=new Map(),storage=()=>({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)});
  const variants=['첫 문구','둘째 문구','셋째 문구'];
  let picker=createDailyTemplatePicker({storage,random:()=>0});
  assert.equal(picker(variants,{account:'account-one',date:asOf}),'첫 문구');
  picker=createDailyTemplatePicker({storage,random:()=>0.99});
  assert.equal(picker(variants,{account:'account-one',date:asOf}),'첫 문구');
  assert.equal(picker(variants,{account:'account-one',date:'2026-09-29'}),'셋째 문구');
  assert.equal(picker(variants,{account:'account-one',date:'2026-09-30'}),'둘째 문구');
  assert.equal(picker(variants,{account:'account-two',date:asOf}),'셋째 문구');
  assert.doesNotMatch(JSON.stringify([...values]),/account-one|첫 문구|둘째 문구|셋째 문구|수분|불편함/);
});

test('문구 선택 저장 실패는 기록을 건드리지 않고 같은 실행 안에서는 유지한다',()=>{
  const picker=createDailyTemplatePicker({storage:()=>{throw Error('저장 차단');},random:()=>0.5});
  const variants=['첫 문구','둘째 문구','셋째 문구'];
  assert.equal(picker(variants,{account:'isolated',date:asOf}),picker(variants,{account:'isolated',date:asOf}));
  assert.notEqual(picker(variants,{account:'isolated',date:asOf}),picker(variants,{account:'isolated',date:'2026-09-29'}));
});
