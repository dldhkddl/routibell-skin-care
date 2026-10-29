import { today } from './계산.js';
import { buildSkinPlan, saveDaily, saveSkinCheckin, validateProductSnapshot } from './피부계산.js';

const choices = entries => entries.map(([value,label]) => ({value,label}));
const moods = choices([['balanced','편안해요'],['dry','당겨요'],['oily','번들거려요'],['uncomfortable','불편해요'],['unsure','잘 모르겠어요']]);
const discomfort = answers => answers.mood === 'uncomfortable' || answers.comfort === 'uncomfortable';

export function checkinProducts(data,date=today()) {
  const day=data.skinCare.days.find(entry=>entry.date===date);
  const previous=data.skinCare.checkins.find(entry=>entry.date===date);
  const products=[...(day?.morningProducts??[]),...(day?.eveningProducts??[]),...(data.inventory??[]).filter(item=>item.category==='cosmetic'&&['cleanser','cream','sunscreen'].includes(item.kind)),...(previous?.product?[previous.product]:[])];
  return [...new Map(products.map(product=>[product.id,validateProductSnapshot(product)])).values()];
}

export function checkinQuestions(data,answers={},date=today()) {
  const plan=buildSkinPlan(data,date);
  if(!plan)return [];
  const questions=[];
  if(!plan.paused) {
    questions.push({key:'adherence',text:'오늘 루틴 하셨어요?',options:choices([['yes','했어요'],['pending','아직 못 했어요'],['some','일부만']])});
    if(['yes','some'].includes(answers.adherence))questions.push({key:'routine',text:'오늘 완료한 루틴을 알려주세요.',help:'아침·저녁 중 끝까지 마친 루틴만 골라요.',options:choices([['morning','아침만 완료'],['evening','저녁만 완료'],...(answers.adherence==='yes'?[['both','아침·저녁 완료']]:[['none','완료한 루틴은 없어요']])])});
  }
  questions.push({key:'mood',text:'지금 피부 느낌은 어때요?',options:moods});
  if(['dry','oily'].includes(answers.mood))questions.push({key:'comfort',text:'그 느낌 때문에 불편한가요?',options:choices([['uncomfortable','불편해요'],['comfortable','괜찮아요'],['unsure','잘 모르겠어요']])});
  const previous=data.skinCare.checkins.find(entry=>entry.date===date);
  if(discomfort(answers)||previous?.product)questions.push({key:'product',text:discomfort(answers)?'불편함을 느꼈을 때 쓴 제품이 있나요?':'함께 기록할 제품을 골라주세요.',help:discomfort(answers)?'고른 제품은 사용 후보에서 제외해요. 불편함의 원인으로 단정하지 않아요.':undefined,options:[...checkinProducts(data,date).map(product=>({value:product.id,label:product.title})),{value:'none',label:'특정하지 않을게요'}]});
  return questions;
}

export function prepareBotCheckin(data,answers,date=today()) {
  if(!data.skinCare?.profile)throw Error('피부 상태를 먼저 저장해 주세요.');
  if(!answers||typeof answers!=='object'||Array.isArray(answers))throw Error('체크인 답변을 확인해 주세요.');
  if(answers.quick===true){
    const allowed=['quick','adherence','routine','mood','product'];
    if(Object.keys(answers).some(key=>!allowed.includes(key))||!['yes','some','pending'].includes(answers.adherence))throw Error('체크인 답변을 확인해 주세요.');
    if(['yes','some'].includes(answers.adherence)&&!['morning','evening','both'].includes(answers.routine))throw Error('아침·저녁 중 챙긴 루틴을 선택해 주세요.');
    if(answers.adherence==='pending'&&answers.routine!==undefined)throw Error('아직 하지 않은 루틴은 완료로 저장하지 않아요.');
    if(answers.mood!==undefined&&!moods.some(option=>option.value===answers.mood))throw Error('피부 느낌을 확인해 주세요.');
    const products=checkinProducts(data,date);
    if(answers.product!==undefined&&answers.product!=='none'&&!products.some(item=>item.id===answers.product))throw Error('함께 기록할 제품을 확인해 주세요.');
    const previous=data.skinCare.checkins.find(entry=>entry.date===date);
    const paused=buildSkinPlan(data,date).paused;
    const feeling=answers.mood==='uncomfortable'?'uncomfortable':answers.mood==='balanced'?'comfortable':'unsure';
    return {entry:{date,feeling,adherence:paused?(previous?.adherence??'unreported'):answers.adherence,feel:answers.mood==='uncomfortable'?null:answers.mood??null,product:products.find(item=>item.id===answers.product)??null,memo:previous?.memo??''},periods:paused?null:{morning:['morning','both'].includes(answers.routine),evening:['evening','both'].includes(answers.routine)},paused};
  }
  const questions=checkinQuestions(data,answers,date);
  if(Object.keys(answers).length!==questions.length||questions.some(question=>!question.options.some(option=>option.value===answers[question.key])))throw Error('질문에 모두 답한 뒤 저장해 주세요.');
  const previous=data.skinCare.checkins.find(entry=>entry.date===date);
  const paused=buildSkinPlan(data,date).paused;
  const feeling=discomfort(answers)?'uncomfortable':answers.mood==='balanced'?'comfortable':answers.comfort??'unsure';
  const entry={date,feeling,adherence:paused?(previous?.adherence??'unreported'):answers.adherence,feel:answers.mood==='uncomfortable'?null:answers.mood,product:checkinProducts(data,date).find(product=>product.id===answers.product)??null,memo:previous?.memo??''};
  const periods=paused?null:{morning:['morning','both'].includes(answers.routine),evening:['evening','both'].includes(answers.routine)};
  return {entry,periods,paused};
}

export function saveBotCheckin(data,answers,date=today(),asOf=date) {
  const prepared=prepareBotCheckin(data,answers,date);
  let next=data;
  if(prepared.periods)for(const period of ['morning','evening']) {
    const day=next.skinCare.days.find(entry=>entry.date===date);
    if(!day||day[period]!==prepared.periods[period])next=saveDaily(next,period,prepared.periods[period],date);
  }
  return saveSkinCheckin(next,prepared.entry,asOf);
}
