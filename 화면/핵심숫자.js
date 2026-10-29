import { today, summary } from './계산.js';
import { weekReport } from './피부계산.js';
import { numericCard } from './화면정리.js';

export function renderHomeMetrics(data,asOf=today(),{showBudgetPrompt=true}={}){
  const current=summary(data,asOf.slice(0,7)),week=weekReport(data,asOf),routine=week.current;
  const dates=new Set(week.days.map(day=>day.date));
  const recordedDays=new Set([...data.skinCare.days,...data.skinCare.checkins].filter(entry=>dates.has(entry.date)).map(entry=>entry.date)).size;
  const completedDays=data.skinCare.days.filter(day=>dates.has(day.date)&&(day.morning||day.evening)).length;
  const rate=recordedDays===0?'':`<div class="number-card"><span>최근 7일 관리</span><p>${completedDays>=3?`이번 주 ${completedDays}일 챙기셨어요`:'기록을 시작했어요'}</p></div>`;
  const budget=current.remaining===null?'':numericCard(current.remaining<0?'이번 달 예산 초과':'이번 달 남은 예산',Math.abs(current.remaining).toLocaleString('ko-KR'),'원');
  return `${rate||budget?`<section class="home-numbers" aria-label="최근 관리와 이번 달 예산">${rate}${budget}</section>`:''}${showBudgetPrompt&&current.remaining===null?'<div class="metric-prompt"><button type="button" class="text-link" data-action="budget">예산 정하기 →</button></div>':''}`;
}
