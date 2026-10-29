import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, today } from '../화면/계산.js';
import { MANAGER_QUESTIONS, managerQuestionAnswer, managerQuestionLabel, recommendedManagerQuestions } from '../화면/매니저문구.js';

const shift=(date,days)=>{const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);};
const date=today();
const inventory=(kind,id,state='using')=>({id,title:`내 ${kind}`,category:'cosmetic',kind,comfort:'comfortable',status:'available',usageState:state,remaining:state==='low'?10:60,registeredAt:shift(date,-28),opened:shift(date,-28),expires:'',memo:''});
const fixture=()=>{
  const data=EMPTY(),before=shift(date,-14),recent=shift(date,-1);
  data.inventory=[inventory('cleanser','cleanser'),inventory('cream','cream'),inventory('sunscreen','sunscreen','low')];
  data.budgets[date.slice(0,7)]=45000;
  data.skinCare.profile={feel:'dry',concerns:['dryness'],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:before};
  data.skinCare.selection={cleanser:'cleanser',cream:'cream',sunscreen:'sunscreen'};
  data.skinCare.checkins=[{date:recent,adherence:'yes',feeling:'comfortable',feel:'dry',product:null,memo:''}];
  data.skinCare.days=[{date:recent,morning:true,evening:true,morningProducts:[],eveningProducts:[]}];
  data.skinCare.observations=[
    {id:'first',completedAt:`${before}T01:00:00.000Z`,condition:'unknown',baselineId:null,reference:{provider:'youcam',version:'v2.1',date:before,focus:'moisture',actions:['moisture','redness','acne','oiliness'],scores:{moisture:51,redness:62,acne:75,oiliness:68}}},
    {id:'second',completedAt:`${recent}T01:00:00.000Z`,condition:'matched',baselineId:'first',reference:{provider:'youcam',version:'v2.1',date:recent,focus:'moisture',actions:['moisture','redness','acne','oiliness'],scores:{moisture:58,redness:56,acne:75,oiliness:68}}},
  ];
  data.skinCare.observation=data.skinCare.observations[1].reference;
  return data;
};

test('질문은 네 종류에 정확히 18개이며 아침·저녁 말이 시간에 맞춰 바뀐다',()=>{
  assert.equal(MANAGER_QUESTIONS.length,18);
  assert.equal(new Set(MANAGER_QUESTIONS.map(item=>item.id)).size,18);
  assert.deepEqual(MANAGER_QUESTIONS.reduce((counts,item)=>({...counts,[item.category]:(counts[item.category]??0)+1}),{}),{routine:5,skin:7,products:3,records:3});
  assert.match(managerQuestionLabel('today',9),/아침/);
  assert.match(managerQuestionLabel('today',20),/저녁/);
});

for(const question of MANAGER_QUESTIONS){
  test(`${question.label}: 기록 있음·없음에 모두 근거 있는 답과 행동 하나`,()=>{
    const rich=managerQuestionAnswer(fixture(),question.id,date,{hour:9,access:{subscriptionRemaining:1,oneTimeRemaining:1,freeTrialRemaining:0,trialLocked:false}});
    const empty=managerQuestionAnswer(EMPTY(),question.id,date,{hour:9});
    for(const answer of [rich,empty]){
      assert.ok(answer,question.id);
      assert.ok(answer.lines.length>=1&&answer.lines.length<=3,question.id);
      assert.ok(answer.lines.every(line=>typeof line==='string'&&line.trim()),question.id);
      assert.ok(answer.action?.kind&&answer.action?.label,question.id);
      const content=answer.lines.join(' ');
      assert.doesNotMatch(content,/진단|처방|시술|병원|약품|브랜드|당장 구매|무조건 구매/);
      if(['skinNow','trouble','redness','dry','oily'].includes(question.id))assert.equal(answer.lines.at(-1),'심하거나 오래가면 피부과에서 확인받아요.');
      else assert.doesNotMatch(content,/심하거나 오래가면 피부과에서 확인받아요/);
      assert.doesNotMatch(content,/화장대에 남긴 기록을 기준으로 다시 살펴볼게요|정한 예산 안에서 필요한 순서만 함께 볼게요|직접 남긴 느낌을 다음 답에 이어볼게요/);
    }
    if(question.id==='analyses')assert.match(rich.lines[0],/구독 1회.*1회권 1회/);
    if(question.id==='sunAmount')assert.match(empty.lines[0],/1티스푼/);
    if(question.id==='sunAgain')assert.match(empty.lines.join(' '),/2시간.*수영/);
    if(question.id==='week')assert.ok(rich.lines.length<=3);
  });
}

test('추천 질문은 매번 서로 다른 3개, 미체크인·소진 제품을 먼저 골라준다',()=>{
  const data=fixture();
  const morning=recommendedManagerQuestions(data,date,9);
  assert.equal(morning.length,3);
  assert.equal(new Set(morning).size,3);
  assert.equal(morning[0],'today');
  assert.equal(morning[1],'low');
  assert.ok(morning.includes('skinChange'));
  data.skinCare.profile.discomfort='yes';
  assert.equal(recommendedManagerQuestions(data,date,9)[0],'skinNow');
  const empty=recommendedManagerQuestions(EMPTY(),date,20);
  assert.equal(empty.length,3);
  assert.equal(empty[0],'today');
  assert.ok(empty.includes('budget'));
});

test('촬영 조건이 다르면 변화라고 말하지 않고, 기록이 없으면 횟수를 지어내지 않는다',()=>{
  const data=fixture();
  data.skinCare.observations[1].condition='unknown';
  data.skinCare.observations[1].baselineId=null;
  assert.match(managerQuestionAnswer(data,'skinChange',date).lines[0],/비교하지 않을게요/);
  assert.match(managerQuestionAnswer(EMPTY(),'analyses',date).lines[0],/확인하지 못했어요/);
});

test('첫 체크인 뒤에는 다시 체크인 버튼을 요구하지 않고 사진을 안 찍었다면 처음 살펴보기로 안내한다',()=>{
  const once=fixture();
  const answer=managerQuestionAnswer(once,'streak',date,{hour:9});
  assert.doesNotMatch(answer.lines.join(' '),/1일 연속/);
  once.skinCare.checkins.push({date,adherence:'yes',feeling:'comfortable',memo:''});
  const done=managerQuestionAnswer(once,'focus',date,{hour:9});
  assert.notEqual(done.action.label,'오늘 체크인하기');
  assert.equal(done.action.kind,'records');
  const empty=managerQuestionAnswer(EMPTY(),'skinChange',date);
  assert.equal(empty.action.label,'사진으로 살펴보기');
  assert.equal(managerQuestionAnswer(EMPTY(),'skinNow',date).lines[0],'최근 피부 느낌 기록이 아직 없어요. 오늘 느낌부터 남겨볼까요?');
});

test('불편함 입력은 루틴보다 앞서고, 피부 느낌을 사진 점수로 덮어쓰지 않는다',()=>{
  const data=fixture();
  data.skinCare.profile.discomfort='yes';
  assert.match(managerQuestionAnswer(data,'today',date).lines[0],/쉬어가요/);
  const status=managerQuestionAnswer(data,'skinNow',date).lines.join(' ');
  assert.match(status,/직접 남긴 최근 느낌은 당김/);
});
