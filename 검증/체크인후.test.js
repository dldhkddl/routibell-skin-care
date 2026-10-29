import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY } from '../화면/계산.js';
import { emptyCare } from '../화면/피부계산.js';
import { saveBotCheckin } from '../화면/체크인계산.js';
import { completionMessage, completionTip, managerNext, managerSheetState } from '../화면/체크인후.js';

const date='2025-03-15';
const product={id:'cream-one',title:'내 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:60,opened:'2025-02-15',expires:'2099-12-31',memo:''};
const base=()=>({...EMPTY(),inventory:[{...product}],skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:date},selection:{cleanser:null,cream:product.id,sunscreen:null}}});

test('체크인 완료는 응답 다섯 종류와 다음 할 일을 기록대로 구분한다',()=>{
  const before=saveBotCheckin(base(),{adherence:'yes',routine:'both',mood:'balanced'},'2025-03-14',date);
  const cases=[
    [{adherence:'yes',routine:'morning',mood:'balanced'},/2일|어제에 이어|이틀째/,/저녁 루틴 체크하기/],
    [{adherence:'pending',mood:'balanced'},/괜찮아요|아직 시간|저녁에 한 번/,/오늘 피부 느낌 남기기/],
    [{adherence:'pending',mood:'uncomfortable',product:'none'},/새 제품 없이|쉬어야|전문가/,/오늘은 새 제품 없이 쉬어가요/],
    [{adherence:'some',routine:'morning',mood:'balanced'},/일부만|그 정도면|바쁜 날/,/저녁 루틴 체크하기/],
    [{adherence:'yes',routine:'both',mood:'balanced'},/2일|어제에 이어|이틀째/,null],
  ];
  for(const [answers,reaction,next] of cases){
    const saved=saveBotCheckin(before,answers,date);
    assert.match(completionMessage(saved,{date,hour:12}),reaction);
    if(answers.mood==='uncomfortable')assert.match(completionTip(saved,date),next);
    else if(next)assert.match(managerNext(saved,date).label,next);
    else assert.equal(managerNext(saved,date).label,null);
  }
});

test('매니저 시트는 아침 전·저녁 남음·다 써가는 제품을 구분하고 할 일을 두 개만 보여준다',()=>{
  const morning=base();
  assert.match(managerSheetState(morning,date,9).first,/좋은 아침/);
  assert.ok(managerSheetState(morning,date,9).tasks.length<=2);
  const evening=saveBotCheckin(morning,{adherence:'yes',routine:'morning',mood:'balanced'},date);
  assert.match(managerSheetState(evening,date,20).first,/저녁 루틴 아직/);
  const low={...morning,inventory:[{...product,remaining:10}]};
  assert.match(managerSheetState(low,date,9).first,/크림.*(?:곧 떨어질|거의 다)/);
  assert.deepEqual(managerSheetState(low,date,9).quick,['오늘 피부 느낌 남기기','쓴 제품 사용감 남기기','오늘 산 거 기록하기','거의 다 쓴 제품 표시하기']);
});
