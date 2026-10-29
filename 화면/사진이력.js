import { photoReference, validatePhotoReference } from './사진계산.js';

const sameAnalysis = (first, second) => first.provider === second.provider && first.version === second.version && first.date === second.date && Object.keys(first.scores).sort().join(',')===Object.keys(second.scores).sort().join(',') && Object.keys(first.scores).every(key => first.scores[key] === second.scores[key]) && JSON.stringify(first.skinTypes??null)===JSON.stringify(second.skinTypes??null);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
const order = (first, second) => first.reference.date.localeCompare(second.reference.date) || (first.completedAt ?? '').localeCompare(second.completedAt ?? '') || first.id.localeCompare(second.id);

export function validatePhotoHistory(value) {
  if (!Array.isArray(value) || value.length > 240) throw Error('사진 관찰 이력은 최대 240건까지 보관할 수 있어요.');
  const entries = value.map(entry => {
    if (!entry || Object.keys(entry).sort().join(',') !== 'baselineId,completedAt,condition,id,reference' || !identifier(entry.id)) throw Error('사진 관찰 이력 형식을 확인해 주세요.');
    if (entry.completedAt !== null && (typeof entry.completedAt !== 'string' || !Number.isFinite(Date.parse(entry.completedAt)) || new Date(entry.completedAt).toISOString() !== entry.completedAt || Date.parse(entry.completedAt) > Date.now())) throw Error('사진 관찰 완료 시각을 확인해 주세요.');
    if (!['unknown','matched'].includes(entry.condition) || (entry.baselineId !== null && !identifier(entry.baselineId)) || (entry.condition === 'matched') !== (entry.baselineId !== null)) throw Error('촬영 조건 확인과 비교 기준을 확인해 주세요.');
    return {id:entry.id,completedAt:entry.completedAt,reference:validatePhotoReference(entry.reference),condition:entry.condition,baselineId:entry.baselineId};
  }).sort(order);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || new Set(entries.filter(entry => entry.completedAt).map(entry => entry.completedAt)).size !== entries.filter(entry => entry.completedAt).length) throw Error('중복된 사진 관찰 이력이 있어요.');
  entries.forEach((entry, index) => {
    if (entry.baselineId && !entries.slice(0,index).some(previous => previous.id === entry.baselineId)) throw Error('사진 관찰의 이전 비교 기준을 찾을 수 없어요.');
  });
  return entries;
}

export function photoHistory(care) {
  const entries = [...(care?.observations ?? [])];
  if (care?.observation && !entries.some(entry => sameAnalysis(entry.reference, care.observation))) {
    const base = `legacy-${care.observation.date}`;
    let identifier = base;
    let suffix = 1;
    while (entries.some(entry => entry.id === identifier)) identifier = `${base}-${suffix++}`;
    entries.push({id:identifier,completedAt:null,reference:care.observation,condition:'unknown',baselineId:null});
  }
  return entries.sort(order);
}

export function savePhotoObservation(data, result, focus, baselineId = null) {
  if (!data.skinCare?.profile) throw Error('피부 느낌과 불편함을 먼저 저장해 주세요.');
  const reference = photoReference(result, focus);
  const completedAt = new Date(result.completedAt).toISOString();
  const previous = photoHistory(data.skinCare);
  const existing = previous.find(entry => entry.completedAt === completedAt);
  if (existing && !sameAnalysis(existing.reference, reference)) throw Error('같은 분석 시각의 결과가 달라 저장하지 않았어요.');
  if(existing?.reference.summary&&reference.summary&&JSON.stringify(existing.reference.summary)!==JSON.stringify(reference.summary))throw Error('같은 분석의 종합 참고값이 달라 저장하지 않았어요.');
  if(existing?.reference.summary&&!reference.summary)reference.summary=existing.reference.summary;
  const entry = {id:existing?.id ?? crypto.randomUUID(),completedAt,reference,condition:baselineId ? 'matched' : 'unknown',baselineId};
  const observations = validatePhotoHistory([...previous.filter(item => item.id !== entry.id),entry]);
  return {...data,skinCare:{...data.skinCare,observation:reference,observations}};
}

export function removePhotoObservation(data, id) {
  const existing = photoHistory(data.skinCare).find(entry => entry.id === id);
  if (!existing) throw Error('삭제할 관찰 기록을 찾지 못했어요. 다시 확인해 주세요.');
  const observations = photoHistory(data.skinCare).filter(entry => entry.id !== id).map(entry => entry.baselineId === id ? {...entry,condition:'unknown',baselineId:null} : entry);
  const observation = data.skinCare.observation && sameAnalysis(data.skinCare.observation, existing.reference) ? null : data.skinCare.observation;
  return {...data,skinCare:{...data.skinCare,observation,observations}};
}
