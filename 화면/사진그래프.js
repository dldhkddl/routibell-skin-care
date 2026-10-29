import { PHOTO_ACTIONS, PHOTO_GROUPS, PHOTO_LABELS } from './사진항목.js';
import { photoHistory } from './사진이력.js';
import { photoResultUrl } from './사진계산.js';
import { renderPhotoItemGuidance } from './사진설명.js';
import { today } from './계산.js';
import { SKIN_TYPE_REGIONS, SKIN_TYPE_LABELS } from './피부타입.js';
import { renderPhotoSummary } from './사진요약.js';
import { RECOMMENDATION_SETTINGS } from './추천전략설정.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const numeric=value=>Number.isFinite(value)&&value>=1&&value<=100;
const localDate=value=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};

export function photoTimeline(care,result=null,asOf=today()){
  const entries=photoHistory(care).filter(entry=>entry.reference.date<=asOf).map(entry=>({...entry,live:false}));
  if(result){
    const date=localDate(result.completedAt);
    const existing=entries.find(entry=>entry.completedAt===result.completedAt);
    const skinTypeItem=result.items?.find(item=>item.type==='skin_type');
    const reference={date,provider:result.provider,version:result.version,scores:Object.fromEntries((result.items??[]).map(item=>[item.type,item.verified===false?null:item.rawScore])),...(skinTypeItem?.verified!==false&&skinTypeItem?.skinTypes?{skinTypes:skinTypeItem.skinTypes}:{})};
    if(result.summary)reference.summary=result.summary;
    if(date&&date<=asOf){
      if(existing){
        const unchanged=existing.reference.provider===reference.provider&&existing.reference.version===reference.version&&JSON.stringify(Object.entries(existing.reference.scores).sort())===JSON.stringify(Object.entries(reference.scores).sort())&&JSON.stringify(existing.reference.skinTypes??null)===JSON.stringify(reference.skinTypes??null);
        existing.reference=reference;existing.live=true;
        if(!unchanged){existing.condition='unknown';existing.baselineId=null;}
      }
      else entries.push({id:'current-result',completedAt:result.completedAt,reference,condition:'unknown',baselineId:null,live:true});
    }
  }
  return entries.sort((first,second)=>first.reference.date.localeCompare(second.reference.date)||(first.completedAt??'').localeCompare(second.completedAt??'')||first.id.localeCompare(second.id));
}

export function buildPhotoTrend(entries,type){
  const categorical=type==='skin_type';
  const points=entries.map(entry=>({id:entry.id,date:entry.reference.date,time:Date.parse(entry.completedAt??`${entry.reference.date}T12:00:00`),value:!categorical&&numeric(entry.reference.scores[type])?entry.reference.scores[type]:null,selected:Object.hasOwn(entry.reference.scores,type),hollow:true}));
  const segments=[];
  for(let index=1;index<entries.length;index++){
    const previous=entries[index-1],current=entries[index];
    const compatible=points[index-1].value!==null&&points[index].value!==null&&current.condition==='matched'&&current.baselineId===previous.id&&previous.reference.date!==current.reference.date&&previous.reference.provider===current.reference.provider&&previous.reference.version===current.reference.version;
    if(compatible){segments.push([index-1,index]);points[index-1].hollow=false;points[index].hollow=false;}
  }
  const recorded=points.filter(point=>point.value!==null);
  const latest=points.at(-1)??null,previous=points.at(-2)??null;
  const compared=segments.some(segment=>segment[1]===points.length-1);
  let note='아직 표시할 숫자 기록이 없어요.';
  if(categorical)note='피부 타입은 분류형 참고값이에요. 전체·T존·U존을 숫자 그래프에서 제외해요.';
  else if(latest?.value===null)note=latest.selected?'이번 점수 해석 확인 필요 · 점을 임의로 만들지 않아요.':'이번 기록은 미분석 · 이전 점수를 이번 값으로 대신하지 않아요.';
  else if(points.length===1||points.slice(0,-1).every(point=>!point.selected)){note='첫 기준점이에요. 같은 조건의 기록이 쌓이면 점수 추이를 보여드려요.';latest.hollow=false;}
  else if(compared)note=`지난 기록 ${previous.value.toFixed(1)} → 이번 ${latest.value.toFixed(1)}`;
  else if(latest){
    const before=entries.at(-2),current=entries.at(-1);
    const reason=before.reference.provider!==current.reference.provider||before.reference.version!==current.reference.version?'분석 버전·제공자 다름':before.reference.date===current.reference.date?'같은 날의 촬영':previous.value===null?'직전 항목 미분석·해석 미확인':'직전 기록과 촬영 조건 미확인';
    note=`비교 조건 미확인 · ${reason}`;
  }
  return {type,categorical,points,segments,note,latest,recorded:recorded.length,hasUnmatched:points.length>1&&recorded.some(point=>point.hollow)};
}

export function photoComparison(entries){
  if(entries.length<2)return null;
  const previous=entries.at(-2),latest=entries.at(-1);
  const matched=latest.condition==='matched'&&latest.baselineId===previous.id&&previous.reference.date!==latest.reference.date&&previous.reference.provider===latest.reference.provider&&previous.reference.version===latest.reference.version;
  const items=PHOTO_ACTIONS.filter(type=>type!=='skin_type'&&numeric(latest.reference.scores[type])&&numeric(previous.reference.scores[type])).map(type=>({
    type,previous:previous.reference.scores[type],current:latest.reference.scores[type],difference:matched?Math.round((latest.reference.scores[type]-previous.reference.scores[type])*10)/10:null,
  }));
  if(matched)items.sort((first,second)=>second.difference-first.difference||PHOTO_ACTIONS.indexOf(first.type)-PHOTO_ACTIONS.indexOf(second.type));
  return {matched,items,previousDate:previous.reference.date,currentDate:latest.reference.date};
}

export function renderPhotoComparison(entries){
  const comparison=photoComparison(entries);
  if(!comparison)return '';
  const description=comparison.matched?'점수 차이는 사진 관찰 참고값이에요.': '비교 조건 미확인 · 촬영 조건과 분석 버전을 확인해 주세요.';
  return `<section class="photo-comparison" aria-labelledby="photo-comparison-title"><h3 id="photo-comparison-title">지난번보다 이렇게 달라졌어요</h3><p class="${comparison.matched?'field-help':'trend-warning'}">${description}</p>${comparison.items.length?`<ul>${comparison.items.map(item=>`<li><span>${esc(PHOTO_LABELS[item.type])}</span><strong>${comparison.matched?`${item.previous.toFixed(1)} <span aria-hidden="true">→</span> ${item.current.toFixed(1)}`:`이전 ${item.previous.toFixed(1)} · 이번 ${item.current.toFixed(1)}`}</strong>${comparison.matched?`<small>${Math.abs(item.difference)<=RECOMMENDATION_SETTINGS.changeMargin?'비슷해요':`차이 ${item.difference>0?'+':''}${item.difference.toFixed(1)}`}</small>`:''}</li>`).join('')}</ul>`:'<p>두 사진에서 함께 살펴본 숫자 항목이 없어요.</p>'}<details><summary>비교 기준 보기</summary><p>${esc(comparison.previousDate)}와 ${esc(comparison.currentDate)}의 같은 항목을 봐요. 촬영 조건과 분석 버전이 같을 때만 차이를 표시해요. 숫자 차이만으로 피부 변화나 제품 효과를 판단하지 않아요.</p></details></section>`;
}

export function renderTrendSvg(trend,compact=false){
  if(trend.categorical||!trend.recorded)return '';
  const width=360,height=compact?52:180,left=compact?5:35,right=compact?355:345,top=compact?5:15,bottom=compact?47:145;
  const times=trend.points.map(point=>point.time),start=Math.min(...times),end=Math.max(...times);
  const position=point=>({horizontal:end===start?(left+right)/2:left+(point.time-start)/(end-start)*(right-left),vertical:bottom-point.value/100*(bottom-top)});
  const lines=trend.segments.map(([from,to])=>{const first=position(trend.points[from]),second=position(trend.points[to]);return `<line class="trend-segment" x1="${first.horizontal}" y1="${first.vertical}" x2="${second.horizontal}" y2="${second.vertical}"/>`;}).join('');
  const dots=trend.points.filter(point=>point.value!==null).map(point=>{const at=position(point);return `<circle class="trend-point ${point.hollow?'hollow':''}" cx="${at.horizontal}" cy="${at.vertical}" r="${compact?3:4}"><title>${esc(point.date)} · ${point.value.toFixed(1)}${point.hollow?' · 비교 조건 미확인':''}</title></circle>`;}).join('');
  const axis=compact?'':[0,50,100].map(value=>{const vertical=bottom-value/100*(bottom-top);return `<line class="trend-grid" x1="${left}" y1="${vertical}" x2="${right}" y2="${vertical}"/><text x="25" y="${vertical+4}" text-anchor="end">${value}</text>`;}).join('')+`<text x="${left}" y="170">${esc(trend.points[0].date)}</text>${trend.points.length>1?`<text x="${right}" y="170" text-anchor="end">${esc(trend.latest.date)}</text>`:''}`;
  return `<svg class="${compact?'trend-mini':'trend-chart'}" viewBox="0 0 ${width} ${height}" ${compact?'aria-hidden="true"':`role="img" aria-label="${esc(PHOTO_LABELS[trend.type])} 기록 추이. 세로축 0부터 100. ${esc(trend.note)}"`} focusable="false">${axis}${lines}${dots}</svg>`;
}

function imageDisclosure(item){
  const addresses=[];
  const sources=item?.type==='skin_type'&&Array.isArray(item.regions)?item.regions.flatMap(region=>(region.images??[]).map(value=>({value,label:SKIN_TYPE_REGIONS.find(entry=>entry.key===region.region)?.label??'피부 타입'}))):(item?.images??(item?.image?[item.image]:[])).map(value=>({value,label:PHOTO_LABELS[item.type]}));
  for(const source of sources){
    try{const address=photoResultUrl(source.value);if(!addresses.some(entry=>entry.address===address))addresses.push({address,label:source.label});}catch{}
  }
  if(!addresses.length)return '<p class="field-help">표시할 임시 분석 이미지가 없어요. 저장 기록에는 원본 사진과 이미지 주소를 보관하지 않아요.</p>';
  return `<details class="trend-images" data-trend-images><summary>이미지로 확인하기 · ${addresses.length}장</summary><div data-trend-images-content></div><template>${addresses.map(({address,label})=>`<figure><a href="${esc(address)}" target="_blank" rel="noopener noreferrer"><img src="${esc(address)}" alt="${esc(label)} 분석 표시" referrerpolicy="no-referrer" loading="lazy"></a><figcaption>${esc(label)} · 누르면 크게 보기</figcaption></figure>`).join('')}</template></details>`;
}

export function revealTrendImages(event){
  const details=event.target;
  if(!details?.matches?.('details[data-trend-images]')||!details.open)return;
  const template=details.querySelector('template'),content=details.querySelector('[data-trend-images-content]');
  if(template&&content){content.append(template.content.cloneNode(true));template.remove();}
}

function renderSkinTypes(timeline,failed=false){
  const latest=timeline.at(-1)?.reference;
  if(!latest||!Object.hasOwn(latest.scores,'skin_type'))return '<p class="field-help">이번 관찰에서는 피부 타입을 분석하지 않았어요.</p>';
  if(failed)return '<p class="field-help">전체·T존·U존 분류를 모두 확인하지 못했어요. 이번 분류는 기록으로 저장하지 않아요.</p>';
  if(!latest.skinTypes)return '<p class="field-help">이 관찰에는 영역별 분류가 저장되지 않았어요.</p>';
  return `<dl class="skin-type-regions">${SKIN_TYPE_REGIONS.map(({key,label})=>`<div><dt>${label}</dt><dd>${esc(SKIN_TYPE_LABELS[latest.skinTypes[key]])}</dd></div>`).join('')}</dl><details class="trend-values"><summary>날짜별 분류 보기</summary><ul>${timeline.filter(item=>Object.hasOwn(item.reference.scores,'skin_type')).map(item=>`<li>${esc(item.reference.date)} · ${item.reference.skinTypes?SKIN_TYPE_REGIONS.map(({key,label})=>`${label} ${esc(SKIN_TYPE_LABELS[item.reference.skinTypes[key]])}`).join(' · '):'영역별 분류 기록 없음'}</li>`).join('')}</ul></details>`;
}

export function renderPhotoTrends({care,result=null,guidance,asOf=today(),hideComparison=false}){
  const timeline=photoTimeline(care,result,asOf);
  const actions=PHOTO_ACTIONS.filter(type=>timeline.some(entry=>Object.hasOwn(entry.reference.scores,type)));
  const focused=actions.filter(type=>guidance.focused.includes(type));
  const card=type=>{
    const trend=buildPhotoTrend(timeline,type),entry=guidance.entries.find(item=>item.type===type),item=result?.items.find(value=>value.type===type);
    const score=trend.categorical?(item?.verified===false?'확인 필요':timeline.at(-1)?.reference.skinTypes?SKIN_TYPE_LABELS[timeline.at(-1).reference.skinTypes.whole]:trend.latest?.selected?'분류형':'미분석'):trend.latest?.value!=null?trend.latest.value.toFixed(1):trend.latest?.selected?'확인 필요':'미분석';
    const warning=trend.categorical?(item?.verified===false?'영역별 분류 결과 확인 필요':null):trend.latest?.value==null?trend.note:trend.hasUnmatched?'비교 조건 미확인 기록 포함':null;
    return `<details class="photo-trend-card" data-trend="${type}" ${focused.includes(type)?'open':''}><summary><span class="trend-label">${esc(PHOTO_LABELS[type])}${focused.includes(type)?'<small>이번 집중 항목</small>':''}</span><strong class="trend-score">${esc(score)}</strong>${renderTrendSvg(trend,true)}<span class="trend-expand" aria-hidden="true">＋</span>${warning?`<span class="trend-warning">${esc(warning)}</span>`:''}</summary><div class="trend-body">${trend.categorical?renderSkinTypes(timeline,item?.verified===false):renderTrendSvg(trend)}<p class="trend-note">${esc(trend.note)}</p>${trend.hasUnmatched?'<details class="card-details"><summary>자세히 보기 · 비교 조건</summary><p>속 빈 점은 비교 조건 미확인 기록이에요. 선은 같은 항목·버전·서로 다른 날짜의 직전 기록을 비교 기준으로 확인한 구간만 이어요.</p></details>':''}${entry?renderPhotoItemGuidance(entry):'<p class="field-help">이 항목은 과거 관찰만 있어요. 현재 행동은 직접 입력한 상태를 기준으로 확인해요.</p>'}${imageDisclosure(item)}${trend.categorical?'':`<details class="trend-values"><summary>날짜별 수치 보기</summary><ul>${trend.points.map(point=>`<li>${esc(point.date)} · ${point.value===null?(point.selected?'해석 확인 필요':'미분석'):point.value.toFixed(1)}${point.value!==null&&point.hollow?' · 비교 조건 미확인':''}</li>`).join('')}</ul></details>`}</div></details>`;
  };
  return `<div class="photo-trends">${renderPhotoSummary(timeline.at(-1)?.reference.summary)}${hideComparison?'':renderPhotoComparison(timeline)}<p class="card-copy">같은 항목의 기록만 비교해요.</p><details class="card-details"><summary>자세히 보기 · 그래프 읽기</summary><p>모든 숫자 그래프는 0~100 기준이에요.</p>${timeline.length===1&&Object.entries(timeline[0].reference.scores).some(([type,value])=>type!=='skin_type'&&numeric(value))?'<p class="trend-first">첫 기준점이에요. 같은 조건의 기록이 쌓이면 점수 추이를 보여드려요.</p>':''}<p>점수 차이는 관찰값의 차이예요. 건강 상태나 제품 효과를 판정하지 않아요.</p></details>${focused.length?`<section class="trend-group"><h3>이번 집중 항목</h3>${focused.map(card).join('')}</section>`:''}${PHOTO_GROUPS.map(group=>{const others=group.actions.filter(type=>actions.includes(type)&&!focused.includes(type));return others.length?`<section class="trend-group"><h3>${esc(group.label)}</h3>${others.map(card).join('')}</section>`:'';}).join('')}</div>`;
}
