import { readFileSync } from 'node:fs';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS, PHOTO_SIMPLE_LABELS } from '../화면/사진항목.js';
import { compareRecommendationScenarios, makeRecommendationScenarios, recommendationMetrics } from './추천전략시나리오.js';

const response=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
const actual=normalizeAnalysis(response,()=>Date.parse('2026-09-23T06:00:00Z'),PHOTO_ACTIONS);
const scores=Object.fromEntries(actual.items.map(item=>[item.type,item.rawScore]));
const skinTypes=actual.items.find(item=>item.type==='skin_type').skinTypes;
const comparisons=compareRecommendationScenarios(makeRecommendationScenarios(scores,actual.summary,skinTypes));
const start=Number(process.argv[2]??'1');
const end=Number(process.argv[3]??'30');
const kinds={cleanser:'세안',cream:'보습',sunscreen:'자차',serum:'세럼',toner:'토너',eyecream:'눈가'};
const names=types=>types.length?types.map(type=>PHOTO_SIMPLE_LABELS[type]).join('·'):'없음';
const routine=plan=>plan.paused?'불편함 확인·루틴 중단':`아침 ${plan.morning.map(step=>kinds[step.kind]??step.title).join('→')} / 저녁 ${plan.evening.map(step=>kinds[step.kind]??step.title).join('→')}`;
const transition=result=>result.guidance.graduationLine??result.guidance.returnLine??(result.events.some(event=>event.action==='transition')?'집중 항목 전환':'—');
const column=result=>`집중 ${names(result.focus)}<br>제안 ${result.guidance.action}${result.guidance.product?` / ${result.guidance.product}`:''}<br>루틴 ${routine(result.plan)}<br>졸업·전환 ${transition(result)}`;

if(start===1){
  console.log(JSON.stringify({A:recommendationMetrics(comparisons,'A'),B:recommendationMetrics(comparisons,'B')},null,2));
  console.log('| 번호·상황 | A · 고정 구간 | B · 내 피부 기준 |');
  console.log('| --- | --- | --- |');
}
for(const {scenario,A,B} of comparisons.slice(start-1,end))console.log(`| ${scenario.id} ${scenario.title} | ${column(A)} | ${column(B)} |`);
