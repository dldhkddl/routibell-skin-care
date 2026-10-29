import { CATEGORIES, currency, summary } from './계산.js';
import { icon } from './아이콘.js';

const colors = { hair:'#ff9dc8', skin:'#ff517e', cosmetic:'#6499ff', nail:'#ffbd73', grooming:'#a285e9', other:'#8d9cb8' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const categoryColor = category => colors[category] ?? colors.other;

export function ringGradient(segments) {
  const visible = segments.filter(segment => segment.amount > 0);
  const total = visible.reduce((amount, segment) => amount + segment.amount, 0);
  if (!total) return '#edf0f5';
  let offset = 0;
  return `conic-gradient(${visible.map(segment => {
    const start = offset;
    offset += segment.amount / total * 100;
    return `${segment.color} ${start}% ${offset}%`;
  }).join(',')})`;
}

function ring(segments, caption, value) {
  return `<div class="portfolio-ring" style="--ring:${ringGradient(segments)}"><div class="ring-center"><span>${escapeHtml(caption)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
}

function legend(segments) {
  return `<ul class="ring-legend">${segments.map(segment => `<li><span><i style="--dot:${segment.color}"></i>${escapeHtml(segment.name)}</span><strong>${currency(segment.amount)}</strong></li>`).join('')}</ul>`;
}

export function spendingPortfolio(data, month) {
  const current = summary(data, month);
  const segments = current.categories.filter(category => category.count).map(category => ({...category, color:categoryColor(category.id)}));
  if (current.remaining !== null && current.remaining > 0) segments.push({name:'남은 예산',amount:current.remaining,color:'#e8edf6'});
  return `<section class="portfolio-summary" aria-label="이번 달 지출 포트폴리오">${ring(segments,'이번 달 지출',currency(current.total))}${legend(segments)}${!current.records.length?'<p class="chart-note">아직 소비 기록이 없어요. 첫 기록부터 차근차근 채워보세요.</p>':''}<div class="budget-line"><span>${current.budget===null?'월 예산 미설정':`내 예산 ${currency(current.budget)}`}</span><button class="text-link" data-action="budget">${current.budget===null?'예산 정하기':'예산 수정'} ${icon('chevron')}</button></div>${current.remaining!==null&&current.remaining<0?`<p class="budget-warning">정한 예산보다 ${currency(-current.remaining)} 더 사용했어요.</p>`:''}</section>`;
}

export function planPortfolio(plan, configured = true) {
  const segments = CATEGORIES.map(category => ({name:category.name,amount:plan.allocations[category.id],color:categoryColor(category.id)}));
  const remainder = plan.total - plan.reserve - segments.reduce((amount, segment) => amount + segment.amount, 0);
  segments.push({name:'남겨둘 금액',amount:plan.reserve,color:'#a285e9'});
  if (remainder > 0) segments.push({name:'미배분',amount:remainder,color:'#e8edf6'});
  return `<div class="plan-portfolio">${ring(segments,'전체 월 예산',configured?currency(plan.total):'미설정')}${legend(segments.filter(segment=>segment.amount>0))}<p class="chart-note">현재 저장된 계획 · 입력 변경은 저장 후 반영돼요.</p></div>`;
}

export function monthlyTrend(data, month, count = 6) {
  return Array.from({length:count}, (_, index) => {
    const date = new Date(Number(month.slice(0,4)), Number(month.slice(5))-count+index, 1, 12);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const current = summary(data,key);
    return {month:key,total:current.total,average:current.average,rated:current.rated,count:current.records.length};
  });
}

export function trendChart(data, month) {
  const history = monthlyTrend(data,month);
  if (!history.some(item=>item.count)) return '<div class="chart-empty">'+icon('chart')+'<p>기록이 쌓이면 월별 지출과<br>직접 남긴 만족도를 보여드려요.</p></div>';
  const maximum = Math.max(1,...history.map(item=>item.total));
  const lines = [];
  let points = [];
  for (const [index,item] of history.entries()) {
    if (item.average === null) { if(points.length)lines.push(points); points=[]; }
    else points.push(`${25+index*50},${110-item.average/5*84}`);
  }
  if(points.length)lines.push(points);
  return `<div class="trend-chart"><div class="chart-scale"><span>지출 최대 ${currency(Math.max(...history.map(item=>item.total)))}</span><span>만족도 5점 기준</span></div><svg viewBox="0 0 300 143" role="img" aria-label="최근 6개월 지출과 만족도 추이. 정확한 금액은 아래 월별 수치에서 확인할 수 있어요."><path class="chart-grid" d="M8 26H292M8 68H292M8 110H292"/>${history.map((item,index)=>`<rect class="spending-bar" x="${14+index*50}" y="${110-item.total/maximum*84}" width="22" height="${item.total/maximum*84}" rx="3"/><text x="${25+index*50}" y="135" text-anchor="middle">${Number(item.month.slice(5))}월</text>`).join('')}${lines.map(line=>`<polyline class="satisfaction-line" points="${line.join(' ')}"/>`).join('')}${history.map((item,index)=>item.average===null?'':`<circle class="satisfaction-point" cx="${25+index*50}" cy="${110-item.average/5*84}" r="3.5"/>`).join('')}</svg><div class="chart-key"><span><i class="spending-key"></i>지출 금액</span><span><i class="satisfaction-key"></i>만족도</span></div><details class="data-details"><summary>월별 수치 보기</summary><table><caption class="sr-only">최근 6개월 지출과 평가</caption><thead><tr><th scope="col">월</th><th scope="col">지출</th><th scope="col">평균 만족도</th></tr></thead><tbody>${history.map(item=>`<tr><th scope="row">${escapeHtml(item.month)}</th><td>${currency(item.total)}</td><td>${item.average===null?'미평가':`${item.average.toFixed(1)} · ${item.rated}건`}</td></tr>`).join('')}</tbody></table></details></div>`;
}

export function lifetimeStats(data) {
  const rated = data.records.filter(record=>record.rating!==null);
  return {total:data.records.reduce((amount,record)=>amount+record.amount,0),count:data.records.length,rated:rated.length,average:rated.length?rated.reduce((amount,record)=>amount+record.rating,0)/rated.length:null,repurchase:data.records.filter(record=>record.repurchase===true).length};
}
