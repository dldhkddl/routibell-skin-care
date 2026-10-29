import { availableInventory } from './계획계산.js';
import { careTip } from './관리팁.js';
import { consecutiveCareDays } from './매니저문구.js';
import { recommendPhoto } from './사진추천.js';
import { photoHistory } from './사진이력.js';
import { PRODUCT_KINDS } from './화장대순서.js';
import { nextBudgetAlert } from './예산계산.js';
import { withParticle } from './조사.js';

const dateOffset=(date,offset)=>{const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const daysBetween=(first,second)=>(Date.parse(`${second}T12:00:00Z`)-Date.parse(`${first}T12:00:00Z`))/86_400_000;
const choose=(pick,lines,key,date)=>pick(lines,{account:key,date});

export function completionMessage(data,{date,previous=null,answers=null,hour=12,pick=lines=>lines[0],account='manager'}={}){
  const care=data.skinCare,entry=care.checkins.find(item=>item.date===date);
  if(!entry)return '';
  const select=(lines,key)=>choose(pick,lines,`${account}:completion:${key}`,date);
  if(previous)return select(entry.feeling==='uncomfortable'?['바꿔뒀어요. 오늘은 쓰던 것만 순하게 써요.']:['바꿔둘게요. 알려줘서 고마워요.','수정했어요. 정확하게 남기는 게 제일 좋아요.'],'edited');
  if(hour>=0&&hour<4)return '늦게까지 수고했어요. 푹 자는 것도 관리예요.';
  const count=care.checkins.length;
  if([10,30,100].includes(count))return ({10:'벌써 10번째 기록이에요.',30:'30번째 체크인이에요. 한 달치를 쌓으셨어요 👏',100:'100번째예요. 이건 진짜 습관이에요 👏'})[count];
  const previousDate=care.checkins.filter(item=>item.date<date).at(-1)?.date;
  if(previousDate&&daysBetween(previousDate,date)>=7)return select(['오랜만이에요. 다시 와줘서 반가워요.','기다렸어요. 오늘 하나만 같이 해봐요.','그동안 바빴죠? 오늘부터 다시 천천히 가요.'],'return');
  if(count===1)return select(['첫 기록이에요. 오늘부터 제가 같이 챙길게요.','반가워요. 오늘이 1일째예요.','시작이 제일 어려운데, 벌써 하셨어요.'],'first');
  if(entry.feeling==='uncomfortable'){
    const yesterday=care.checkins.find(item=>item.date===dateOffset(date,-1));
    return yesterday?.feeling==='uncomfortable'?'불편했던 제품은 잠시 쉬어요. 계속 불편하면 전문가와 상담해봐요.':select(['알려줘서 고마워요. 오늘은 새 제품 없이 쓰던 것만 써요.','오늘은 피부가 쉬어야 할 때예요. 순하게만 가요.','불편했던 제품은 잠시 쉬어요. 계속 불편하면 전문가와 상담해봐요.'],'discomfort');
  }
  if(entry.adherence==='pending')return select(hour<17?['괜찮아요. 저녁에 다시 물어볼게요.','아직 시간 있어요. 저녁 루틴 때 다시 올게요.','오늘은 저녁에 한 번만 챙겨봐요.']:['괜찮아요, 그런 날도 있어요. 내일 아침에 다시 봬요.','오늘은 쉬어가요. 내일 한 번만 챙기면 돼요.','피곤한 날이었나 봐요. 푹 자는 것도 관리예요.'],'pending');
  if(entry.adherence==='some')return select(['일부만이라도 한 게 어디예요. 기록해둘게요.','오늘은 그 정도면 충분해요. 나머지는 내일 챙겨요.','바쁜 날엔 이것만 해도 잘한 거예요.'],'partial');
  const streak=consecutiveCareDays(care,date);
  if(streak===2)return select(['이틀째예요. 흐름 탔어요.','어제에 이어 오늘도요. 좋아요.','2일 연속이에요. 이대로만 가요.'],'streak2');
  if(streak>=3&&streak<=6)return select([`${streak}일째예요. 이제 습관 쪽으로 넘어가고 있어요.`,`${streak}일 연속 챙기셨어요 👏`,`벌써 ${streak}일째네요. 피부도 알아챌 거예요.`],'streak3');
  if(streak>=7)return select([`${streak}일째예요. 이 정도면 루틴이 자리 잡았어요 👏`,'일주일 넘게 이어오셨어요. 대단해요.',`${streak}일 연속이에요. 제가 괜히 뿌듯하네요.`],'streak7');
  if(previousDate&&daysBetween(previousDate,date)>=2)return select(['다시 오셨네요. 오늘부터 또 세면 돼요.','반가워요. 쉬었던 건 괜찮아요, 오늘 한 게 중요해요.','다시 시작한 날이 제일 어려운데, 해내셨어요.'],'restart');
  return select(['좋아요, 오늘 몫은 챙기셨어요.','잘하셨어요. 이렇게 하루씩이면 충분해요.','오늘도 해내셨네요. 기록해둘게요.'],'done');
}

export function managerNext(data,date){
  const day=data.skinCare.days.find(item=>item.date===date),near=availableInventory(data,date).find(item=>item.category==='cosmetic'&&item.remaining<=15);
  if(day?.morning&&!day.evening)return {label:'저녁 루틴 체크하기',line:'저녁 루틴 때 다시 올게요.',kind:'checkin'};
  if(day?.morning&&day.evening)return {label:null,line:'오늘 할 건 다 했어요. 내일 아침에 봬요.',kind:null};
  if(!data.inventory?.some(item=>item.category==='cosmetic'))return {label:'내 화장대 채우기',line:'쓰는 제품을 알려주면 순서를 정리해드릴게요.',kind:'inventory'};
  if(near)return {label:'이번 달 예산 짜기',line:`${withParticle(PRODUCT_KINDS[near.kind],'이/가')} 거의 다 됐어요. 예산 안에서 챙겨볼까요?`,kind:'budget'};
  const latest=photoHistory(data.skinCare).at(-1)?.reference.date;
  const days=latest===undefined?null:28-daysBetween(latest,date);
  if(days!==null&&days>=0&&days<=7)return {label:`다음 분석 D-${days}`,line:'조명만 지난번이랑 맞춰주세요.',kind:'photo'};
  const monthEnd=new Date(`${date.slice(0,7)}-01T12:00:00Z`);monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1);monthEnd.setUTCDate(0);
  if(daysBetween(date,monthEnd.toISOString().slice(0,10))<=3)return {label:'이번 달 돌아보기',line:`이번 달 ${data.skinCare.checkins.filter(item=>item.date.startsWith(date.slice(0,7))).length}번 챙기셨어요. 정리해볼까요?`,kind:'report'};
  return {label:'오늘 피부 느낌 남기기',line:'오늘 느낌을 남겨주시면 다음 관리를 같이 볼게요.',kind:'checkin'};
}

export function completionTip(data,date){
  const care=data.skinCare,entry=care.checkins.find(item=>item.date===date);
  if(entry?.feeling==='uncomfortable')return care.checkins.find(item=>item.date===dateOffset(date,-1))?.feeling==='uncomfortable'?'오늘은 쉬어가요. 계속 불편하면 전문가와 상담해봐요.':'오늘은 새 제품 없이 쉬어가요.';
  const concernMap={dryness:'moisture',oil:'oiliness',texture:'texture',dullness:'radiance',pore:'pore',redness:'redness',acne:'acne',pigment:'age_spot',aging:'wrinkle',eye:'dark_circle_v2'};
  const focus=recommendPhoto(care,null,{asOf:date})?.focused[0]??care.profile?.concerns.map(item=>concernMap[item]).find(Boolean);
  const fallback=Number(date.slice(-2))%2?'moisture':'age_spot';
  return careTip(focus??fallback,data,date)?.action??'';
}

export function managerSheetState(data,date,hour=12,shownAlert=null){
  const day=data.skinCare.days.find(item=>item.date===date),entry=data.skinCare.checkins.find(item=>item.date===date);
  const near=availableInventory(data,date).find(item=>item.category==='cosmetic'&&item.remaining<=15);
  const alert=shownAlert??nextBudgetAlert(data,date);
  const tasks=[];
  if(entry?.feeling==='uncomfortable')tasks.push({label:'오늘 피부 느낌 남기기',kind:'checkin'});
  else{
    if(near||!Object.hasOwn(data.budgets,date.slice(0,7)))tasks.push({label:'이번 달 예산 짜기',kind:'budget'});
    if(alert)tasks.push({label:'내 화장대 확인',kind:'inventory'});
    if(!day?.morning&&hour<17)tasks.push({label:'아침 루틴 체크하기',kind:'checkin'});
    if(!day?.evening)tasks.push({label:'저녁 루틴 체크하기',kind:'checkin'});
  }
  const first=entry?.feeling==='uncomfortable'?'오늘은 쉬어가는 날이에요. 불편한 게 있으면 적어두세요.':alert?`${withParticle(PRODUCT_KINDS[alert.kind],'이/가')} 곧 떨어질 것 같아요. 확인해볼까요?`:near?`${withParticle(PRODUCT_KINDS[near.kind],'이/가')} 거의 다 됐어요. 미리 챙겨둘까요?`:day?.morning&&day.evening?(tasks.length?'오늘 루틴은 챙기셨어요. 남은 일도 같이 볼까요?':'오늘 할 건 끝났어요. 궁금한 거 있으면 물어보세요.'):day?.morning&&hour>=17?'오늘 저녁 루틴 아직이에요. 금방 끝나요.':day?.morning?'아침은 챙겼어요. 저녁엔 이것만 하면 돼요.':'좋은 아침이에요. 오늘 아침 루틴부터 볼까요?';
  return {first,tasks:tasks.slice(0,2),quick:['오늘 피부 느낌 남기기','쓴 제품 사용감 남기기','오늘 산 거 기록하기','거의 다 쓴 제품 표시하기']};
}
