import { today } from './계산.js';
import { availableInventory } from './계획계산.js';
import { buildSkinPlan, weekReport } from './피부계산.js';
import { photoHistory } from './사진이력.js';
import { PHOTO_ACTIONS, PHOTO_SIMPLE_LABELS } from './사진항목.js';
import { recommendPhoto } from './사진추천.js';
import { careTip, focusReminder } from './관리팁.js';
import { PRODUCT_KINDS, vanityRoutine } from './화장대순서.js';
import { monthlyBudgetPlan, needsReplacement } from './예산계산.js';
import { withParticle } from './조사.js';

const offsetDate=(date,offset)=>{const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const daysApart=(earlier,later)=>(Date.parse(`${later}T12:00:00Z`)-Date.parse(`${earlier}T12:00:00Z`))/86400000;

export function createDailyTemplatePicker({storage=()=>globalThis.localStorage,random=Math.random}={}){
  const memory=new Map();
  return (variants,{account,date})=>{
    let hash=2166136261;
    for(const character of account)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
    const key=`manager-template-v1:${hash.toString(16)}`;
    let entry=memory.get(key);
    if(!entry){try{entry=JSON.parse(storage()?.getItem(key)??'null');}catch{}}
    if(!entry||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Number.isInteger(entry.index)||entry.index<0||entry.index>=variants.length)entry=null;
    if(entry?.date!==date){
      const previous=entry?.date===offsetDate(date,-1)?entry.index:null;
      const choices=variants.map((_,index)=>index).filter(index=>index!==previous);
      const value=Number(random());
      const index=choices[Math.min(choices.length-1,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*choices.length)))];
      entry={date,index};
      try{storage()?.setItem(key,JSON.stringify(entry));}catch{}
    }
    memory.set(key,entry);return variants[entry.index];
  };
}

export function completedCareDates(care,asOf=today()){
  return new Set([...(care?.days??[]).filter(day=>day.date<=asOf&&(day.morning||day.evening)).map(day=>day.date),...(care?.checkins??[]).filter(entry=>entry.date<=asOf).map(entry=>entry.date)]);
}

export function consecutiveCareDays(care,asOf=today(),assumeTodayDone=false){
  const completed=completedCareDates(care,asOf);
  if(assumeTodayDone)completed.add(asOf);
  let cursor=completed.has(asOf)?asOf:offsetDate(asOf,-1),count=0;
  while(completed.has(cursor)){count++;cursor=offsetDate(cursor,-1);}
  return count;
}

export function managerMemory(data,asOf=today(),pick=variants=>variants[0]){
  const care=data.skinCare;
  if(!care?.profile)return '';
  const yesterday=offsetDate(asOf,-1);
  const latest=(care.checkins??[]).filter(entry=>entry.date<=asOf).at(-1);
  const plan=buildSkinPlan(data,asOf);
  if(plan?.paused){
    if(latest?.feeling==='uncomfortable'&&latest.date>=yesterday){const when=latest.date===asOf?'오늘':'어제';return pick([`${when} 불편했죠. ${when==='오늘'?'지금':'오늘'}은 순하게 가요.`,`${when} 불편하셨죠. 새 제품은 잠시 쉬어요.`,`${when} 남긴 불편함부터 살펴볼게요.`]);}
    if(care.profile.discomfort==='yes'&&care.profile.updatedAt>=yesterday)return pick(['불편하셨죠. 오늘은 순하게 가요.','불편함을 알려주셨죠. 새 제품은 잠시 쉬어요.','알려주신 불편함부터 함께 살펴봐요.']);
    return pick(['불편하셨죠. 느낌부터 살펴봐요.','남겨주신 불편함, 지금은 어떤가요?','오늘도 불편함이 있는지 먼저 살펴봐요.']);
  }
  const streak=consecutiveCareDays(care,asOf);
  if(streak>=2)return pick([`${streak}일 연속 챙기셨네요.`,`${streak}일째 꾸준히 챙기고 계세요.`,`벌써 ${streak}일째예요. 잘 이어오셨어요.`]);
  const latestPhoto=photoHistory(care).filter(entry=>entry.reference.date<=asOf).at(-1)?.reference;
  const photoAge=latestPhoto?daysApart(latestPhoto.date,asOf):null;
  if(latestPhoto&&photoAge<28){
    const focused=recommendPhoto(care,null,{asOf})?.focused[0];
    if(focused){const label=PHOTO_SIMPLE_LABELS[focused];const tip=focusReminder(focused,'morning');return pick([`지난 ${label} 관찰을 기억해요. ${tip}`,`${label} 관찰, ${tip}`,`${withParticle(label,'을/를')} 오늘 루틴과 이어볼까요? ${tip}`]);}
  }
  if(plan?.missing.length&&availableInventory(data,asOf).some(item=>item.category==='cosmetic'&&item.comfort==='comfortable'&&['cleanser','cream','sunscreen'].includes(item.kind)&&!care.selection?.[item.kind]))return pick(['가진 제품을 바르는 순서로 정리했어요.','내 화장대 제품을 아침·저녁 순서로 모았어요.','오늘 루틴에서 가진 제품 순서를 볼 수 있어요.']);
  if(latestPhoto&&photoAge>=28)return pick(['지난 관찰 후 4주가 지났어요.','같은 조명에서 다시 살펴볼까요?','지난 사진과 비교할 시기예요. 촬영 조건을 맞춰볼까요?']);
  return '';
}

export function checkinReply(care,adherence,asOf=today()){
  if(adherence==='pending')return '괜찮아요, 저녁에 다시 기록해도 돼요.';
  if(adherence==='some')return '일부만 챙기셨군요. 한 가지씩 가요.';
  if(adherence!=='yes')return '';
  const streak=consecutiveCareDays(care,asOf,true);
  return streak>=2?`좋아요, ${streak}일째예요.`:'좋아요, 오늘도 챙기셨네요.';
}

export function weeklyCareLine(data,asOf=today()){
  const days=[...completedCareDates(data.skinCare,asOf)].filter(date=>date>=offsetDate(asOf,-6)).length;
  return days?`최근 7일 중 ${days}일 챙기셨어요.`:'';
}

export const MANAGER_QUESTION_CATEGORIES=Object.freeze([
  {id:'routine',label:'루틴'},{id:'skin',label:'피부'},
  {id:'products',label:'제품·예산'},{id:'records',label:'내 기록'},
]);

export const MANAGER_QUESTIONS=Object.freeze([
  {id:'order',category:'routine',label:'바르는 순서가 뭐예요?'},
  {id:'today',category:'routine',label:'오늘 아침엔 뭐 발라요?'},
  {id:'sunAmount',category:'routine',label:'선크림 얼마나 발라야 해요?'},
  {id:'sunAgain',category:'routine',label:'선크림 다시 발라야 해요?'},
  {id:'newProduct',category:'routine',label:'새 제품은 언제 넣어요?'},
  {id:'skinNow',category:'skin',label:'요즘 제 피부 어때요?'},
  {id:'skinChange',category:'skin',label:'지난번보다 좋아졌어요?'},
  {id:'focus',category:'skin',label:'지금 뭐에 집중하면 돼요?'},
  {id:'trouble',category:'skin',label:'트러블 났어요'},
  {id:'redness',category:'skin',label:'붉은기 올라왔어요'},
  {id:'dry',category:'skin',label:'너무 건조해요'},
  {id:'oily',category:'skin',label:'번들거려요'},
  {id:'low',category:'products',label:'곧 떨어지는 거 있어요?'},
  {id:'budget',category:'products',label:'이번 달 뭐 사야 해요?'},
  {id:'missing',category:'products',label:'화장대에 빠진 단계 있어요?'},
  {id:'streak',category:'records',label:'체크인 며칠째예요?'},
  {id:'week',category:'records',label:'이번 주 어땠어요?'},
  {id:'analyses',category:'records',label:'분석 몇 번 남았어요?'},
]);

const QUESTION_COPY=Object.freeze({
  emptyVanity:'아직 화장대가 비어 있어요. 쓰는 것부터 넣어볼까요?',
  emptyPhoto:'아직 사진 관찰이 없어요. 한 번 살펴보면 같이 볼 수 있어요.',
  emptyCheckin:'아직 체크인 기록이 없어요. 오늘부터 같이 시작해볼까요?',
  emptyBudget:'이번 달 예산을 정해주시면 필요한 순서를 같이 볼게요.',
  emptyAccess:'이용권 정보를 확인하지 못했어요. 마이에서 다시 살펴볼까요?',
  skinNoPhoto:'사진 관찰이 아직 없어요. 직접 남긴 피부 느낌부터 함께 볼게요.',
  skinCaution:'심하거나 오래가면 피부과에서 확인받아요.',
});

const questionResult=(lines,kind,label)=>({lines,action:{kind,label}});
const skinResult=(lines,kind,label)=>questionResult([...lines.slice(0,2),QUESTION_COPY.skinCaution],kind,label);
const photoEntries=(data,asOf)=>photoHistory(data.skinCare).filter(entry=>entry.reference.date<=asOf);
const lastCheckin=(data,asOf)=>[...(data.skinCare?.checkins??[])].filter(entry=>entry.date<=asOf).sort((first,second)=>first.date.localeCompare(second.date)).at(-1);
const readyProducts=(data,asOf)=>availableInventory(data,asOf).filter(item=>item.category==='cosmetic');
const shortKinds=items=>[...new Set(items.map(item=>PRODUCT_KINDS[item.kind]).filter(Boolean))].join(' → ');
const photoLine=(data,asOf)=>{
  const latest=photoEntries(data,asOf).at(-1)?.reference;
  if(!latest)return '';
  const focused=recommendPhoto(data.skinCare,null,{asOf})?.focused[0];
  if(focused&&Number.isFinite(latest.scores[focused]))return `최근 사진에선 ${PHOTO_SIMPLE_LABELS[focused]} ${latest.scores[focused]}점이에요. 참고값으로 봐요.`;
  if(Number.isFinite(latest.summary?.overallScore))return `최근 종합 참고값은 ${latest.summary.overallScore}점이에요.`;
  return '최근 사진 관찰이 있어요. 같은 조건의 기록을 함께 봐요.';
};
const trendLine=(data,type,asOf)=>{
  const result=recommendPhoto(data.skinCare,null,{asOf});
  const item=result?.comparable?result.items.find(entry=>entry.type===type):null;
  return item?.change?`${PHOTO_SIMPLE_LABELS[type]} 사진 점수는 지난번과 비교해 ${item.change} 참고값이에요.`:'';
};

export function managerQuestionLabel(id,hour=12){
  if(id==='today')return hour<17?'오늘 아침엔 뭐 발라요?':'오늘 저녁엔 뭐 발라요?';
  return MANAGER_QUESTIONS.find(question=>question.id===id)?.label??'';
}

export function recommendedManagerQuestions(data,asOf=today(),hour=12){
  const chosen=[];
  const add=id=>{if(!chosen.includes(id)&&chosen.length<3)chosen.push(id);};
  const care=data.skinCare??{};
  const day=(care.days??[]).find(item=>item.date===asOf);
  const entry=(care.checkins??[]).find(item=>item.date===asOf);
  if(entry?.feeling==='uncomfortable'||care.profile?.discomfort==='yes')add('skinNow');
  else if(!entry||hour<17&&!day?.morning||hour>=17&&!day?.evening)add('today');
  if(readyProducts(data,asOf).some(item=>needsReplacement(item,data,asOf)))add('low');
  if(photoEntries(data,asOf).length>1)add('skinChange');
  if(photoEntries(data,asOf).length)add('focus');
  if(readyProducts(data,asOf).length)add('order');
  if(!Object.hasOwn(data.budgets??{},asOf.slice(0,7)))add('budget');
  for(const id of ['week','sunAgain','missing','skinNow'])add(id);
  return chosen;
}

export function managerQuestionAnswer(data,id,asOf=today(),options={}){
  const result=answerQuestion(data,id,asOf,options);
  const todayDone=(data.skinCare?.checkins??[]).some(entry=>entry.date===asOf)||(data.skinCare?.days??[]).some(day=>day.date===asOf&&(day.morning||day.evening));
  if(result?.action.kind==='checkin'&&result.action.label==='오늘 체크인하기'&&todayDone)return {...result,action:{kind:'records',label:'관리 기록 보기'}};
  return result;
}

function answerQuestion(data,id,asOf=today(),{hour=12,access=null}={}){
  if(!MANAGER_QUESTIONS.some(question=>question.id===id))return null;
  const care=data.skinCare??{},ready=readyProducts(data,asOf);
  const photos=photoEntries(data,asOf),photo=recommendPhoto(care,null,{asOf});
  const checkin=lastCheckin(data,asOf);
  if(id==='order'||id==='today'){
    if(!ready.length)return questionResult([QUESTION_COPY.emptyVanity],'inventory','화장대 채우기');
    if(id==='order'){
      const sorted=vanityRoutine(data.inventory,asOf);
      return questionResult([`아침은 ${shortKinds(sorted.morning)} 순서예요.`, `저녁은 ${shortKinds(sorted.evening)} 순서로 챙겨요.`],'inventory','화장대 보기');
    }
    const period=hour<17?'morning':'evening',steps=buildSkinPlan(data,asOf)?.[period]??[];
    if(!steps.length)return questionResult(['불편함을 남기셨죠. 오늘은 새 제품을 더하지 말고 쉬어가요.'],'checkin','피부 느낌 남기기');
    const missing=steps.filter(step=>!step.product).map(step=>step.kind);
    return questionResult([`${period==='morning'?'아침':'저녁'}엔 ${shortKinds(steps)} 순서로 챙겨요.`,...(missing.length?[`쓰는 ${withParticle(PRODUCT_KINDS[missing[0]],'이/가')} 있으면 화장대에 골라 주세요.`]:[])],'inventory','화장대 보기');
  }
  if(id==='sunAmount')return questionResult(['얼굴에는 선크림을 최소 1티스푼 정도 넉넉히 발라요.','제품 표시도 함께 확인해 주세요.'],'inventory','화장대 보기');
  if(id==='sunAgain')return questionResult(['야외에서는 2시간마다 덧발라요.','수영하거나 땀을 흘렸다면 다시 발라요.'],'inventory','화장대 보기');
  if(id==='newProduct')return questionResult(['새 제품은 한 번에 하나씩 넣어봐요.','며칠 써보고 피부 느낌을 확인한 뒤 다음 제품을 생각해요.'],'checkin','피부 느낌 남기기');
  if(id==='skinNow'){
    if(!photos.length&&!checkin)return skinResult(['최근 피부 느낌 기록이 아직 없어요. 오늘 느낌부터 남겨볼까요?'],'checkin','피부 느낌 남기기');
    const lines=[];
    if(photos.length)lines.push(photoLine(data,asOf));
    if(checkin)lines.push(`직접 남긴 최근 느낌은 ${withParticle(checkin.feeling==='uncomfortable'?'불편함':checkin.feel==='dry'?'당김':checkin.feel==='oily'?'번들거림':checkin.feel==='balanced'?'편안함':'확인 중','이에요/예요')}.`);
    else lines.push('최근 피부 느낌 기록이 아직 없어요. 오늘 느낌부터 남겨볼까요?');
    return skinResult(lines,'checkin','피부 느낌 남기기');
  }
  if(id==='skinChange'){
    if(photos.length<2)return questionResult([photos.length?'사진 관찰이 아직 한 번이에요. 한 번 더 찍으면 비교해드릴게요.':QUESTION_COPY.skinNoPhoto],'photo',photos.length?'사진 다시 살펴보기':'사진으로 살펴보기');
    if(!photo?.comparable)return questionResult(['촬영 조건이나 분석 버전이 달라 이번엔 점수를 직접 비교하지 않을게요.'],'photo','같은 조건으로 살펴보기');
    if(!photo.items.length)return questionResult(['비교할 사진 점수가 아직 없어요. 다음 분석에서 점수 항목을 함께 살펴볼게요.'],'photo','사진 다시 살펴보기');
    const changed=photo.items.filter(item=>item.change&&item.change!=='비슷해요').slice(0,2);
    return questionResult(changed.length?changed.map(item=>`${item.label} ${item.difference>0?'+':''}${item.difference}점, ${item.change} 사진 참고값이에요.`):['이번 사진 점수는 지난번과 비슷해요. 사진 참고값이에요.'],'photo','비교 기록 보기');
  }
  if(id==='focus'){
    if(!photos.length){
      const concern=care.profile?.concerns?.[0];
      const type={dryness:'moisture',oil:'oiliness',pore:'pore',redness:'redness',acne:'acne',pigment:'age_spot',aging:'wrinkle',eye:'dark_circle_v2',texture:'texture',dullness:'radiance'}[concern];
      return type?questionResult([`직접 고른 ${PHOTO_SIMPLE_LABELS[type]}부터 살펴볼까요?`,careTip(type,data,asOf)?.action??'오늘 느낌을 남겨주세요.'],'checkin','오늘 체크인하기'):questionResult([QUESTION_COPY.emptyPhoto],'photo','사진으로 살펴보기');
    }
    const focused=photo?.focused?.slice(0,2)??[];
    if(!focused.length)return questionResult(['이번 사진에서 따로 집중할 항목은 없어요. 지금 루틴을 이어가 볼까요?'],'checkin','오늘 체크인하기');
    const graduated=photo.graduated?.map(item=>PHOTO_SIMPLE_LABELS[item.type]).filter(Boolean)??[];
    return questionResult([`${focused.map(type=>PHOTO_SIMPLE_LABELS[type]).join('·')}부터 살펴볼까요? 사진 점수는 참고값이에요.`,graduated.length?`${withParticle(graduated.join('·'),'은/는')} 이번엔 유지하면서 새 집중 항목을 볼게요.`:careTip(focused[0],data,asOf)?.action??'같은 조건으로 다음 결과도 살펴봐요.'],'checkin','오늘 체크인하기');
  }
  const skinTip={trouble:'acne',redness:'redness',dry:'moisture',oily:'oiliness'}[id];
  if(skinTip){
    const tip=careTip(skinTip,data,asOf)?.action??'오늘 피부 느낌을 남겨볼까요?';
    return skinResult([tip,trendLine(data,skinTip,asOf)||'오늘 느낌을 남기면 다음 기록과 함께 살펴볼게요.'],'checkin','피부 느낌 남기기');
  }
  if(id==='low'){
    if(!ready.length)return questionResult([QUESTION_COPY.emptyVanity],'inventory','화장대 채우기');
    const near=ready.filter(item=>needsReplacement(item,data,asOf));
    return questionResult([near.length?`${withParticle([...new Set(near.map(item=>PRODUCT_KINDS[item.kind]))].join('·'),'을/를')} 곧 다 쓸 수 있어요. 남은 양을 확인해볼까요?`:'지금 기록만으로는 곧 다 쓸 제품이 보이지 않아요. 남은 양을 살펴봐요.'],'inventory','사용 상태 확인하기');
  }
  if(id==='budget'){
    const plan=monthlyBudgetPlan(data,asOf.slice(0,7),asOf);
    if(!plan)return questionResult([QUESTION_COPY.emptyBudget],'budget','예산 짜기');
    return questionResult(plan.lines.slice(0,2),'budget','예산 계획 보기');
  }
  if(id==='missing'){
    if(!ready.length)return questionResult([QUESTION_COPY.emptyVanity],'inventory','화장대 채우기');
    const missing=['cleanser','cream','sunscreen'].filter(kind=>!ready.some(item=>item.kind===kind));
    return questionResult([missing.length?`기본 단계 중 ${withParticle(missing.map(kind=>PRODUCT_KINDS[kind]).join('·'),'이/가')} 화장대에 없어요. 쓰는 게 있다면 알려주세요.`:'세안·보습·자외선 차단 단계가 화장대에 있어요.'],'inventory','화장대 보기');
  }
  if(id==='streak'){
    const dates=completedCareDates(care,asOf);
    if(!dates.size)return questionResult([QUESTION_COPY.emptyCheckin],'checkin','오늘 체크인하기');
    const streak=consecutiveCareDays(care,asOf);
    return questionResult([`지금까지 ${dates.size}일 기록했어요.`,streak>=2?`${streak}일 연속 챙기고 계세요.`:'다음 체크인부터 이어갈 수 있어요.'],'checkin','오늘 체크인하기');
  }
  if(id==='week'){
    const report=weekReport(data,asOf),recorded=report.days.filter(day=>day.entry?.morning||day.entry?.evening).length;
    if(!recorded&&!report.current.feedbackDays)return questionResult([QUESTION_COPY.emptyCheckin],'checkin','오늘 체크인하기');
    const lines=[recorded?`최근 7일 중 ${recorded}일 루틴을 챙기셨어요.`:'루틴 기록은 오늘부터 시작해도 좋아요.',`${report.current.feedbackDays}일 피부 느낌을 남기셨어요.`];
    if(report.current.uncomfortable)lines.push('불편했던 날도 있었죠. 오늘은 쓰던 것만 순하게 가요.');
    else lines.push(recorded?`아침 ${report.current.morning}번·저녁 ${report.current.evening}번 챙기셨어요.`:'남겨주신 피부 느낌부터 함께 볼게요.');
    return questionResult(lines,'records','관리 기록 보기');
  }
  if(!access)return questionResult([QUESTION_COPY.emptyAccess],'subscription','이용권 보기');
  if(access.trialLocked&&access.remaining===0)return questionResult([`무료 체험은 체크인 ${access.trialRequiredDays}일 뒤 열려요. 지금 ${access.completedCheckinDays}/${access.trialRequiredDays}일이에요.`],'checkin','오늘 체크인하기');
  const parts=[];
  if(access.subscriptionRemaining>0)parts.push(`구독 ${access.subscriptionRemaining}회`);
  if(access.oneTimeRemaining>0)parts.push(`1회권 ${access.oneTimeRemaining}회`);
  if(access.freeTrialRemaining>0)parts.push(`무료 체험 ${access.freeTrialRemaining}회`);
  return questionResult([parts.length?`${parts.join(' · ')} 남았어요.`:'지금 남은 사진 분석 횟수는 없어요.'],'subscription','이용권 보기');
}
