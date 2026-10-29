import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { lookupSkinCosts, PreparationError, readJson } from './유캠조회.js';
import { PHOTO_LABELS, DEFAULT_PHOTO_ACTIONS, PHOTO_CONSENT_VERSION, validatePhotoActions, photoPriceBand } from '../화면/사진항목.js';
import { SKIN_TYPE_REGIONS, SKIN_TYPE_LABELS, validateSkinTypes } from '../화면/피부타입.js';
import { normalizePhotoSummary } from '../화면/사진요약.js';

const API = 'https://yce-api-01.makeupar.com';
const TASK = '/s2s/v2.1/task/skin-analysis';
export const ACTIONS = DEFAULT_PHOTO_ACTIONS;
export const MAX_PHOTO_BYTES = 10000000;
export const PHOTO_CONSENT = PHOTO_CONSENT_VERSION;
const error = (code, message, status = 400) => new PreparationError(code, message, status);
const PHOTO_TASK_ERRORS = {
  error_below_min_image_size: '사진 해상도가 낮아요. 짧은 변 480px 이상인 선명한 사진을 올려 주세요.',
  error_exceed_max_image_size: '사진 해상도가 너무 커요. 크기를 줄인 사진을 다시 올려 주세요.',
  error_src_face_too_small: '사진에서 얼굴이 너무 작아요. 얼굴이 사진 가로폭의 60%보다 크게 보이도록 정면에서 다시 찍어 주세요.',
  error_src_face_out_of_bound: '사진에서 얼굴이 잘렸어요. 얼굴 전체가 사진 안에 보이도록 다시 올려 주세요.',
  error_lighting_dark: '사진이 어두워요. 얼굴에 그늘이 지지 않는 밝은 곳에서 다시 찍어 주세요.',
  exceed_max_filesize: '사진 용량이 너무 커요. 10MB 미만 사진을 올려 주세요.',
  error_decode_image: '사진 파일을 읽지 못했어요. JPG 또는 PNG로 다시 저장해 올려 주세요.',
  error_no_face: '얼굴을 찾지 못했어요. 얼굴이 선명하게 보이는 정면 사진을 올려 주세요.',
  error_pose: '얼굴 방향을 확인하지 못했어요. 고개를 바로 하고 정면 사진을 올려 주세요.',
  error_face_parsing: '얼굴 부분을 구분하지 못했어요. 앞머리나 손이 얼굴을 가리지 않는 사진을 올려 주세요.',
  error_multiple_people: '여러 사람이 보여요. 본인 한 명만 나온 사진을 올려 주세요.',
  error_large_face_angle: '얼굴이 옆으로 돌아가 있어요. 카메라를 똑바로 보는 사진을 올려 주세요.',
  error_unsupport_ratio: '사진 비율을 사용할 수 없어요. 일반적인 세로 사진을 올려 주세요.',
  error_nsfw_content_detected: '이 사진은 분석에 사용할 수 없어요. 얼굴이 잘 보이는 다른 정면 사진을 올려 주세요.',
};
const SERVICE_TASK_ERRORS = {
  exceed_nsfw_retry_limits: '이 사진으로는 더 시도할 수 없어요. 같은 사진을 반복해서 올리지 말아 주세요.',
  error_download_image: '사진을 불러오는 중 문제가 생겼어요. 새 분석 전에 사용 내역을 확인해 주세요.',
  error_download_mask: '결과 파일을 불러오지 못했어요. 새 분석 전에 사용 내역을 확인해 주세요.',
  error_decode_mask: '결과 파일을 읽지 못했어요. 새 분석 전에 사용 내역을 확인해 주세요.',
  error_upload: '분석 결과를 저장하지 못했어요. 새 분석 전에 사용 내역을 확인해 주세요.',
  error_inference: '분석 처리 중 문제가 생겼어요. 새 분석 전에 사용 내역을 확인해 주세요.',
  invalid_parameter: '분석 설정을 확인하지 못했어요. 사진을 다시 보내지 말고 연결 상태를 확인해 주세요.',
  unknown_internal_error: '분석 서비스에 문제가 생겼어요. 새 분석 전에 사용 내역을 확인해 주세요.',
};

export function inspectPhoto(bytes, type) {
  let width = 0, height = 0;
  if (type === 'image/png' && bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (type === 'image/jpeg' && bytes.length > 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { offset += 1; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); break;
      }
      offset += 2 + length;
    }
  }
  if (!bytes.length || bytes.length >= MAX_PHOTO_BYTES || Math.min(width, height) < 480 || Math.max(width, height) > 2560) {
    throw error('INVALID_PHOTO', 'JPEG/PNG, 10MB 미만, 짧은 변 480px 이상·긴 변 2560px 이하 사진만 받습니다.');
  }
  return { width, height };
}

export function storageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw error('UNSAFE_URL', '유캠 파일 주소 형식이 예상과 다릅니다.', 502); }
  if (url.protocol !== 'https:' || url.hostname !== 'yce-us.s3-accelerate.amazonaws.com' || url.port || url.username || url.password || url.hash || url.href.length > 8192) {
    throw error('UNSAFE_URL', '확인되지 않은 파일 서버로는 사진을 보내거나 결과를 열지 않습니다.', 502);
  }
  return url.href;
}

export function validateAnalysisSelection(actions,maximum=4){
  try{return validatePhotoActions(actions,maximum);}
  catch(issue){throw error('SELECTION_DENIED',issue.message,400);}
}

export function selectTrialCost(result,actions=ACTIONS) {
  const selected=validateAnalysisSelection(actions,16),band=photoPriceBand(selected.length);
  const pattern=new RegExp(`^AI Skin Analysis V2\\.1 SD \\(${band.min}[-~–]${band.max} concerns\\)$`,'i');
  const matches = result.items.filter(item => item.version === 'v2.1' && pattern.test(item.description));
  if (matches.length !== 1 || matches[0].unit !== 'result_image' || matches[0].quantity !== 1 || !Number.isFinite(matches[0].credits) || matches[0].credits < 0 || matches[0].credits > band.cap) {
    throw error('PRICE_UNCONFIRMED', `V2.1 SD ${band.min}–${band.max} 항목 가격을 ${band.cap}크레딧 이하로 확인하지 못해 분석을 차단했습니다.`, 409);
  }
  return matches[0].credits;
}

export function normalizeAnalysis(payload, now = Date.now, actions=ACTIONS) {
  const output = payload?.data?.results?.output;
  if (payload?.status !== 200 || payload.data.task_status !== 'success' || payload.data.error || !Array.isArray(output)) throw error('INVALID_RESULT', '완료된 분석 결과 형식을 확인하지 못했습니다.', 502);
  const selected=validateAnalysisSelection(actions,16);
  const items = selected.map(type => {
    const matches = output.filter(item => item?.type === type);
    if(type==='skin_type'){
      const warnings=[];
      const regions=SKIN_TYPE_REGIONS.map(({key})=>{
        const regional=matches.filter(item=>item.region===key);
        const match=regional.length===1?regional[0]:null;
        if(!match)warnings.push(regional.length?'같은 영역의 결과가 중복됐어요':`${key} 영역의 결과가 없어요`);
        const skinType=match&&Object.hasOwn(SKIN_TYPE_LABELS,match.skin_type)?match.skin_type:null;
        if(match&&!skinType)warnings.push(`${key} 영역의 분류를 확인하지 못했어요`);
        const images=[];
        if(match){
          if(!Array.isArray(match.mask_urls))warnings.push(`${key} 영역의 이미지 목록을 확인하지 못했어요`);
          else for(const address of match.mask_urls){
            try{const safe=storageUrl(address);if(!images.includes(safe))images.push(safe);}
            catch{warnings.push('확인되지 않은 이미지 주소는 표시하지 않아요');}
          }
        }
        return {region:key,skinType,images};
      });
      if(matches.length!==SKIN_TYPE_REGIONS.length)warnings.push(matches.length?'피부 타입 영역 결과를 확인해 주세요':'선택 항목 누락');
      let skinTypes=null;
      if(matches.length===SKIN_TYPE_REGIONS.length&&regions.every(region=>region.skinType))skinTypes=validateSkinTypes(Object.fromEntries(regions.map(region=>[region.region,region.skinType])));
      const images=[...new Set(regions.flatMap(region=>region.images))];
      if(!images.length)warnings.push('표시할 결과 이미지 없음');
      return {type,rawScore:null,skinTypes,regions,image:images[0]??null,images,warnings:[...new Set(warnings)],verified:skinTypes!==null};
    }
    const item = matches.length===1?matches[0]:null;
    const warnings=[];
    if(!item)warnings.push(matches.length?'동일 항목 중복 · 점수 확인 필요':'선택 항목 누락');
    const rawScore=type!=='skin_type'&&Number.isFinite(item?.raw_score)&&item.raw_score>=1&&item.raw_score<=100?item.raw_score:null;
    if(type!=='skin_type'&&rawScore===null)warnings.push('원점수 확인 필요');
    const images=[];
    for(const match of matches){
      if(!Array.isArray(match.mask_urls)){warnings.push('결과 이미지 목록 확인 필요');continue;}
      for(const address of match.mask_urls){
        try{const safe=storageUrl(address);if(!images.includes(safe))images.push(safe);}
        catch{warnings.push('확인되지 않은 이미지 주소는 표시하지 않아요');}
      }
    }
    if(!images.length)warnings.push('표시할 결과 이미지 없음');
    return { type, rawScore, image:images[0]??null, images, warnings:[...new Set(warnings)], verified:item!==null&&rawScore!==null };
  });
  const summary=normalizePhotoSummary(output);
  return { provider: 'youcam', version: 'v2.1', completedAt: new Date(now()).toISOString(), actions:selected, items,...(summary?{summary}:{}) };
}

async function apiJson(path, apiKey, fetchImpl, signal, body) {
  signal.throwIfAborted();
  const response = await fetchImpl(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw error('ANALYSIS_PROVIDER_ERROR', '유캠 요청이 실패했습니다. 키·권한·잔액·사진 조건을 콘솔에서 확인해 주세요. 자동 재시도하지 않습니다.', 502);
  }
  const result = await readJson(response);
  if (result?.status !== 200) throw error('ANALYSIS_PROVIDER_ERROR', '유캠이 요청을 승인하지 않았습니다. 자동 재시도하지 않습니다.', 502);
  return result;
}

async function copyResultImages(result,fetchImpl){
  const addresses=[...new Set(result.items.flatMap(item=>[
    ...(item.images??[]),...(item.regions??[]).flatMap(region=>region.images??[]),
  ]))];
  const copies=new Map();
  let total=0;
  for(const address of addresses){
    try{
      const response=await fetchImpl(storageUrl(address),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok||Number(response.headers.get('content-length'))>2_000_000){await response.body?.cancel();continue;}
      const reader=response.body?.getReader();if(!reader)continue;
      const chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw Error('IMAGE_TOO_LARGE');}chunks.push(value);}}
      finally{reader.releaseLock();}
      if(!size||total+size>12_000_000)continue;
      const bytes=Buffer.concat(chunks);
      const type=bytes.length>=2&&bytes.readUInt16BE(0)===0xffd8?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
      if(!type)continue;
      total+=size;copies.set(address,`data:${type};base64,${bytes.toString('base64')}`);
    }catch{copies.set(address,null);}
  }
  const replace=images=>images.map(address=>copies.get(address)).filter(Boolean);
  return {...result,items:result.items.map(item=>{
    const images=replace(item.images??[]);
    const regions=item.regions?.map(region=>({...region,images:replace(region.images??[])}));
    return {...item,images,image:images[0]??null,...(regions?{regions}:{}),warnings:images.length===(item.images??[]).length?item.warnings:[...new Set([...(item.warnings??[]),'일부 결과 이미지를 보관하지 못했어요'])]};
  })};
}

async function deleteTaskFiles(taskId,apiKey,fetchImpl){
  try{await apiJson('/s2s/v2.0/task/delete',apiKey,fetchImpl,AbortSignal.timeout(15000),{task_id:taskId});}
  catch{console.warn('유캠 작업·파일 삭제 요청 실패: 운영 콘솔에서 확인 필요');}
}

export async function runSkinAnalysis({ bytes, type, apiKey, quotedCredits, actions=ACTIONS, fetchImpl = fetch, signal, now = Date.now, sleep = delay }) {
  inspectPhoto(bytes, type);
  try {
    const selected=validateAnalysisSelection(actions,16);
    const price = selectTrialCost(await lookupSkinCosts({ apiKey, fetchImpl, signal }),selected);
    if (price !== quotedCredits) throw error('PRICE_CHANGED', '조회 후 가격이 바뀌어 사진을 보내지 않았습니다.', 409);
    const metadata = await apiJson('/s2s/v2.0/file', apiKey, fetchImpl, signal, {
      files: [{ content_type: type, file_name: `skin-trial.${type === 'image/png' ? 'png' : 'jpg'}`, file_size: bytes.length }],
    });
    const files = metadata.data?.files;
    const file = files?.[0], upload = file?.requests?.[0];
    if (!Array.isArray(files) || files.length !== 1 || !/^[A-Za-z0-9+/_=-]{1,1024}$/.test(file?.file_id ?? '') || !Array.isArray(file.requests) || file.requests.length !== 1 || upload?.method !== 'PUT') throw error('INVALID_UPLOAD', '유캠 업로드 형식이 예상과 다릅니다.', 502);
    const url = storageUrl(upload.url);
    const headers = {};
    if (!upload.headers || typeof upload.headers !== 'object' || Array.isArray(upload.headers)) throw error('INVALID_UPLOAD', '업로드 헤더를 확인하지 못했습니다.', 502);
    for (const [name, value] of Object.entries(upload.headers)) {
      const lower = name.toLowerCase();
      if (lower === 'content-type' && value === type) headers['Content-Type'] = value;
      else if (lower === 'content-length' && String(value) === String(bytes.length)) headers['Content-Length'] = String(value);
      else throw error('INVALID_UPLOAD', '예상하지 못한 업로드 헤더가 있어 전송하지 않았습니다.', 502);
    }
    if (!headers['Content-Type'] || !headers['Content-Length']) throw error('INVALID_UPLOAD', '업로드 크기·형식을 확인하지 못했습니다.', 502);
    signal.throwIfAborted();
    const uploaded = await fetchImpl(url, { method: 'PUT', headers, body: bytes, redirect: 'error', signal });
    await uploaded.body?.cancel();
    if (!uploaded.ok) throw error('UPLOAD_FAILED', '사진 전송에 실패해 분석 요청을 만들지 않았습니다.', 502);
    const started = await apiJson(TASK, apiKey, fetchImpl, signal, {
      src_file_id: file.file_id, dst_actions: selected, format: 'json', pf_camera_kit: false,
      miniserver_args: { enable_mask_overlay: true },
    });
    const taskId = started.data?.task_id;
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(taskId)) throw error('TASK_UNCONFIRMED', '작업 생성 여부가 불확실합니다. 재실행 전에 유캠 사용 내역을 확인해 주세요.', 502);
    try{
      for (let poll = 0; poll < 18; poll += 1) {
        await sleep(10000, undefined, { signal });
        const result = await apiJson(`${TASK}/${encodeURIComponent(taskId)}`, apiKey, fetchImpl, signal);
        if (result.data?.task_status === 'success') {
          const normalized = normalizeAnalysis(result, now, selected);
          if (JSON.stringify(normalized).includes(apiKey)) throw error('INVALID_RESULT', '결과에 노출할 수 없는 정보가 있어 표시하지 않습니다.', 502);
          return await copyResultImages(normalized,fetchImpl);
        }
        if (result.data?.task_status === 'error') {
          const reason = result.data.error;
          const photoReason = typeof reason === 'string' && Object.hasOwn(PHOTO_TASK_ERRORS, reason);
          const serviceReason = typeof reason === 'string' && Object.hasOwn(SERVICE_TASK_ERRORS, reason);
          console.warn('유캠 분석 실패:', photoReason || serviceReason ? reason : '원인 미확인');
          throw error(photoReason ? 'PHOTO_RETRY' : 'TASK_FAILED', photoReason ? PHOTO_TASK_ERRORS[reason] : serviceReason ? SERVICE_TASK_ERRORS[reason] : '유캠이 분석을 완료하지 못했어요. 새 분석 전에 사용 내역을 확인해 주세요.', 502);
        }
        if (result.data?.task_status !== 'running') throw error('TASK_STATUS_UNCONFIRMED', '유캠 결과 상태를 확인하지 못했어요. 다시 분석하지 말고 사용 내역을 확인해 주세요.', 502);
      }
      throw error('ANALYSIS_TIMEOUT', '결과 확인 시간이 지났습니다. 유캠에서는 작업이 계속될 수 있으므로 다시 분석하지 말고 콘솔을 확인해 주세요.', 504);
    }finally{await deleteTaskFiles(taskId,apiKey,fetchImpl);}
  } finally { bytes.fill(0); }
}

export function createVolatilePhotoState(){
  let state={used:false,job:null};
  return {
    get:async()=>state,
    async reserve(){if(state.used)throw error('ANALYSIS_USED','이미 분석 요청을 받았습니다. 기존 결과를 확인해 주세요.',409);state={used:true,job:{state:'receiving'}};},
    async update(job){state={...state,job};},
    async release(job){state={used:false,job};},
    async clear(){state={...state,job:null};},
  };
}

export function createAnalysisSession({ apiKey, enabled, fetchImpl, now = Date.now, sleep = delay, stateStore=createVolatilePhotoState(),onFailure=()=>{} }) {
  let quote = null, quoteBusy = false, quoteAttempts = 0, quoteAfter = 0;
  let activeController = null, generation=0;
  const ensureEnabled = () => { if (!enabled) throw error('ANALYSIS_DISABLED', '지금은 사진 분석을 이용할 수 없어요.', 403); };
  const publicState = async () => ({ enabled, ...await stateStore.get() });
  return {
    status: publicState,
    selection:()=>quote?[...quote.actions]:[],
    async quote(actions=ACTIONS,maximum=4) {
      ensureEnabled();
      const selected=validateAnalysisSelection(actions,maximum);
      if ((await stateStore.get()).used) throw error('ANALYSIS_USED', '이미 분석 요청을 받았습니다. 결과를 다시 확인해 주세요.', 409);
      if (quoteBusy || quoteAttempts >= 5 || now() < quoteAfter) throw error('QUOTE_LIMIT', '가격 확인은 30초 간격, 서버 실행당 5회까지 가능합니다.', 429);
      quoteBusy = true; quoteAttempts += 1; quoteAfter = now() + 30000; quote = null;
      try {
        const credits = selectTrialCost(await lookupSkinCosts({ apiKey, fetchImpl }),selected);
        quote = { id: randomUUID(), credits, expiresAt: now() + 600000, actions:selected };
        return { ...quote, actions:[...selected],version: 'v2.1', consentVersion: PHOTO_CONSENT };
      } finally { quoteBusy = false; }
    },
    async reserve(quoteId, consent, overseasConsent, maximum=4) {
      ensureEnabled();
      if ((await stateStore.get()).used) throw error('ANALYSIS_USED', '이미 분석 요청을 받았습니다. 재전송하지 않고 기존 결과를 확인해 주세요.', 409);
      if (consent !== PHOTO_CONSENT) throw error('PHOTO_CONSENT_REQUIRED', '사진 외부 전송·보관·비용에 동의해 주세요.');
      if (overseasConsent !== PHOTO_CONSENT) throw error('OVERSEAS_CONSENT_REQUIRED', '국외 이전 안내를 확인하고 별도로 동의해 주세요.');
      if (!quote || quote.id !== quoteId || now() >= quote.expiresAt) throw error('QUOTE_EXPIRED', '먼저 가격을 확인해 주세요. 가격 확인은 10분 동안 유효합니다.', 409);
      validateAnalysisSelection(quote.actions,maximum);
      try{await stateStore.reserve(quoteId,quote.actions.length);}
      catch(issue){if(issue.code==='ANALYSIS_USED')throw error('ANALYSIS_USED','이미 분석 요청을 받았습니다. 기존 결과를 확인해 주세요.',409);throw issue;}
    },
    async rejectUpload(issue) {
      const photoError=issue instanceof PreparationError&&['INVALID_PHOTO','PHOTO_TOO_LARGE'].includes(issue.code);
      await stateStore.release({state:'failed',code:photoError?'PHOTO_RETRY':'UPLOAD_FAILED',message:photoError?issue.message:'사진 전송을 완료하지 못했어요. 새 분석 전에 연결 상태를 확인해 주세요.'});
    },
    async start(bytes, type) {
      const state=await stateStore.get();
      if (!state.used || state.job?.state !== 'receiving') throw error('INVALID_STATE', '사진 수신 상태가 아닙니다.', 409);
      inspectPhoto(bytes, type);
      await stateStore.update({state:'running'});
      activeController = new AbortController();
      const startedGeneration=generation;
      const timer = setTimeout(() => activeController?.abort(), 180000);
      void (async()=>{
        let result;
        try{result=await runSkinAnalysis({ bytes, type, apiKey, quotedCredits: quote.credits, actions:quote.actions, fetchImpl, signal: activeController.signal, now, sleep });}
        catch(issue){
          onFailure();
          if(startedGeneration===generation){
            const confirmedFailure=issue instanceof PreparationError&&['INVALID_PHOTO','PRICE_CHANGED','PRICE_UNCONFIRMED','INVALID_UPLOAD','UPLOAD_FAILED','PHOTO_RETRY','TASK_FAILED'].includes(issue.code);
            try{await stateStore.update({ state:confirmedFailure?'failed':'uncertain', code:issue instanceof PreparationError?issue.code:'ANALYSIS_CONNECTION',message:issue instanceof PreparationError?issue.message:'통신이 중단되었거나 시간이 초과됐습니다. 작업·차감 여부는 유캠 콘솔에서 확인하세요. 자동 재실행하지 않습니다.' });}
            catch{console.warn('분석 실패 상태 저장을 확인해 주세요.');}
          }
          return;
        }
        if(startedGeneration===generation){
          try{await stateStore.update({state:'success',result});}
          catch{console.warn('분석 결과 저장을 확인해 주세요. 자동 재실행하지 않습니다.');}
        }
      })().finally(() => {
          clearTimeout(timer);
          if(startedGeneration!==generation)return;
          activeController = null;
        });
    },
    async clear() {
      if (['running', 'receiving'].includes((await stateStore.get()).job?.state)) throw error('ANALYSIS_BUSY', '진행 중에는 지울 수 없습니다. 창을 닫아도 유캠 작업이 취소되지는 않습니다.', 409);
      await stateStore.clear();quote = null;
    },
    purge(){generation++;activeController?.abort();quote=null;},
    close() { activeController?.abort(); },
  };
}
