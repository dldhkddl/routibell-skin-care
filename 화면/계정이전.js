import { EMPTY, validateData } from './계산.js';

export function selectLegacyData(source,{recordIds=[],sections=[]}={}){
  const data=validateData(source),selected=new Set(recordIds);
  if(selected.size!==recordIds.length||recordIds.some(identifier=>!data.records.some(record=>record.id===identifier)))throw Error('이전할 소비 기록을 다시 선택해 주세요.');
  if(sections.some(section=>!['care','budgets','goals','wishes','schedules'].includes(section)))throw Error('이전할 항목을 확인해 주세요.');
  const next=EMPTY();next.records=data.records.filter(record=>selected.has(record.id));
  if(sections.includes('care')){next.skinCare=data.skinCare;next.inventory=data.inventory;}
  if(sections.includes('budgets')){next.budgets=data.budgets;next.plans=data.plans;}
  if(sections.includes('goals')){next.goals=data.goals;next.onboarding=data.onboarding;}
  if(sections.includes('wishes')){
    if(data.wishes.some(wish=>wish.recordId&&!selected.has(wish.recordId)))throw Error('구매 고민에 연결된 소비 기록도 선택해 주세요. 자동으로 가져오지 않아요.');
    next.wishes=data.wishes;
  }
  if(sections.includes('schedules'))next.schedules=data.schedules;
  if(!recordIds.length&&!sections.length)throw Error('가져올 항목을 하나 이상 선택해 주세요.');
  return validateData(next);
}
