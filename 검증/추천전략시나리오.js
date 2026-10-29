import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { EMPTY } from '../화면/계산.js';
import { buildPhotoGuidance, guidanceFromReference } from '../화면/사진설명.js';
import { buildSkinPlan } from '../화면/피부계산.js';
import { recommendPhoto } from '../화면/사진추천.js';

export const REVIEW_DATE = '2026-09-29';

const numericActions = PHOTO_ACTIONS.filter(type => type !== 'skin_type');
const all = score => Object.fromEntries(numericActions.map(type => [type, score]));
const mostlyGood = changes => ({...all(90), ...changes});
const product = kind => ({id: kind, title: `내 ${kind}`, category: 'cosmetic', kind, comfort: 'comfortable', status: 'available', remaining: 70, opened: '', expires: '', memo: ''});

export function makeRecommendationScenarios(actualScores, actualSummary = null, actualSkinTypes = null) {
  const cases = [
    ['01','실제 16항목 응답',[actualScores],{summary: actualSummary,skinTypes:actualSkinTypes}],
    ['02','전부 높은 편',[all(92)]],
    ['03','전부 낮은 편',[all(35)]],
    ['04','모공만 중간',[mostlyGood({pore: 55})]],
    ['05','모공만 낮음',[mostlyGood({pore: 32})]],
    ['06','수분만 낮음',[mostlyGood({moisture: 42})]],
    ['07','붉은기만 낮음',[mostlyGood({redness: 39})]],
    ['08','트러블만 낮음',[mostlyGood({acne: 45})]],
    ['09','색소만 낮음',[mostlyGood({age_spot: 40})]],
    ['10','주름만 낮음',[mostlyGood({wrinkle: 44})]],
    ['11','광채만 낮음',[mostlyGood({radiance: 48})]],
    ['12','눈가만 낮음',[mostlyGood({dark_circle_v2: 45})]],
    ['13','모공·수분 낮음',[mostlyGood({pore: 33, moisture: 49})]],
    ['14','붉은기·트러블 낮음',[mostlyGood({redness: 35, acne: 41})]],
    ['15','불편함과 붉은기',[mostlyGood({redness: 34})],{discomfort:'yes'}],
    ['16','불편함과 트러블',[mostlyGood({acne: 38})],{discomfort:'yes'}],
    ['17','불편함만 있음',[all(90)],{discomfort:'yes'}],
    ['18','당김 직접 입력',[mostlyGood({moisture: 88, pore: 47})],{feel:'dry'}],
    ['19','번들거림 직접 입력',[mostlyGood({oiliness: 87})],{feel:'oily'}],
    ['20','피부 느낌 모름',[mostlyGood({moisture: 55, skin_type: null})],{feel:'unsure', skinTypes:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}}],
    ['21','모공 소폭 상승',[{pore: 35, moisture: 75},{pore: 37, moisture: 75}]],
    ['22','모공 큰 상승',[{pore: 35, moisture: 43},{pore: 48, moisture: 42}]],
    ['23','모공 점수 하락',[{pore: 72, moisture: 70},{pore: 45, moisture: 70}]],
    ['24','촬영 조건 미확인',[{pore: 34, moisture: 68},{pore: 85, moisture: 68}],{unmatched:true}],
    ['25','분석 버전 다름',[{pore: 32},{pore: 86}],{versionChanged:true}],
    ['26','좋음 구간 졸업',[{pore: 34, moisture: 52},{pore: 87, moisture: 50}]],
    ['27','졸업 후 다시 하락',[{pore: 34, moisture: 52},{pore: 87, moisture: 50},{pore: 30, moisture: 49}]],
    ['28','집중 항목 전환',[{pore: 30, moisture: 72},{pore: 86, moisture: 44}]],
    ['29','피부 타입만 선택',[{skin_type: null}],{feel:'unsure', skinTypes:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}}],
    ['30','적은 항목 중 한 개',[{redness: 74, acne: 58, moisture: 65}]],
  ];
  return cases.map(([id, title, records, options = {}]) => {
    const data = EMPTY();
    data.skinCare.profile = {feel:options.feel??'balanced', concerns:options.concerns??[], sensitivity:'rare', discomfort:options.discomfort??'no', priority:'comfort', budget:null, updatedAt:'2026-09-01'};
    data.inventory = options.products === false ? [] : ['cleanser','cream','sunscreen','serum','eyecream'].map(product);
    data.skinCare.selection = {cleanser:'cleanser',cream:'cream',sunscreen:'sunscreen'};
    data.skinCare.observations = records.map((scores, index) => {
      const date = ['2026-09-01','2026-09-15','2026-09-23'][index];
      const reference = {provider:'youcam',version:options.versionChanged&&index?'v2.0':'v2.1',date,focus:Object.keys(scores)[0],actions:Object.keys(scores),scores,
        ...(options.skinTypes?{skinTypes:options.skinTypes}:{}),...(options.summary?{summary:options.summary}:{})};
      return {id:`case-${id}-${index}`,completedAt:`${date}T06:00:00.000Z`,reference,condition:index&&!options.unmatched?'matched':'unknown',baselineId:index&&!options.unmatched?`case-${id}-${index-1}`:null};
    });
    data.skinCare.observation = data.skinCare.observations.at(-1).reference;
    return {id,title,data};
  });
}

export function evaluateRecommendationScenario(scenario, strategy) {
  const {data} = scenario;
  const recommendation = recommendPhoto(data.skinCare,null,{asOf:REVIEW_DATE,strategy});
  const guidance = buildPhotoGuidance(guidanceFromReference(data.skinCare.observation),data,REVIEW_DATE,strategy);
  const plan = buildSkinPlan(data,REVIEW_DATE,strategy);
  const focus = recommendation?.focused ?? [];
  const events = recommendation?.events.filter(event=>['graduated','returned','transition'].includes(event.action))??[];
  const contradictions = [];
  if(plan?.paused&&plan.morning.length+plan.evening.length)contradictions.push('불편함 중 루틴 제안');
  if(plan?.paused&&guidance.product)contradictions.push('불편함 중 제품 제안');
  if(data.skinCare.profile.feel==='unsure'&&/당신은 .*피부 타입/.test(guidance.action))contradictions.push('피부 타입 단정');
  const displayed=[guidance.title,guidance.action,guidance.product,guidance.praise,guidance.graduationLine,guidance.returnLine,...guidance.entries.flatMap(entry=>[entry.action,entry.tip?.action,entry.tip?.product]),...plan.morning.map(step=>step.text),...plan.evening.map(step=>step.text)].filter(Boolean).join(' ');
  const unsafe = /완치|진단했|치료해요|치료됩니다|나쁜 피부|피부가 악화됐|피부가 좋아졌/.test(displayed) ? ['진단·치료 표현'] : [];
  return {recommendation,guidance,plan,focus,events,contradictions,unsafe};
}

export const EXPECTED_EVENTS = Object.freeze({
  '22':['graduated','transition'],
  '23':['transition'],
  '26':['graduated','transition'],
  '27':['graduated','returned','transition'],
  '28':['graduated','transition'],
});

export function compareRecommendationScenarios(scenarios) {
  return scenarios.map(scenario => ({
    scenario,
    A:evaluateRecommendationScenario(scenario,'A'),
    B:evaluateRecommendationScenario(scenario,'B'),
  }));
}

export function recommendationMetrics(comparisons, strategy) {
  const results=comparisons.map(row=>row[strategy]);
  const focusCounts=new Map();
  for(const result of results)for(const type of result.focus)focusCounts.set(type,(focusCounts.get(type)??0)+1);
  const mostCommon=[...focusCounts].sort((first,second)=>second[1]-first[1])[0]??null;
  const actions=results.map(result=>[result.guidance.action,result.guidance.product].filter(Boolean).join(' / '));
  const topicMismatches=results.filter(result=>{
    if(result.plan.paused||!result.focus.length)return false;
    const first=result.focus[0],entry=result.guidance.entries.find(item=>item.type===first);
    return result.guidance.actionType!==first||entry?.tip?.type!==first||result.guidance.action!==entry.tip.action||result.guidance.product!==entry.tip.product;
  }).length;
  const expected=comparisons.filter(row=>EXPECTED_EVENTS[row.scenario.id]);
  const recognized=expected.filter(row=>EXPECTED_EVENTS[row.scenario.id].every(action=>row[strategy].events.some(event=>event.action===action)));
  return {
    total:comparisons.length,
    mostCommon,
    concentrated:mostCommon?.[1]??0,
    noFocus:results.filter(result=>!result.focus.length&&!result.plan.paused).length,
    allGood:results.filter(result=>!result.plan.paused&&!result.focus.length&&result.recommendation.items.length>0&&result.recommendation.items.every(item=>item.band==='좋음')).length,
    allClearCopy:actions.filter(action=>/전부 (괜찮|좋)/.test(action)).length,
    duplicatedCopy:actions.length-new Set(actions).size,
    topicMismatches,
    expectedEvents:expected.length,
    recognizedEvents:recognized.length,
    safetyViolations:results.reduce((total,result)=>total+result.unsafe.length,0),
    contradictions:results.reduce((total,result)=>total+result.contradictions.length,0),
  };
}
