import { createServer } from 'node:http';
import { registerPhotoConnection } from './사진연결.js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { lookupSkinCosts, PreparationError, validApiKey } from './유캠조회.js';
import { createAnalysisSession, createVolatilePhotoState, inspectPhoto, MAX_PHOTO_BYTES, ACTIONS, validateAnalysisSelection } from './유캠분석.js';
import { createAccessPolicy } from './접근정책.js';
import { APP } from '../앱설정.js';

const APP_ORIGINS = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);

async function readPhoto(request) {
  const parts = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size >= MAX_PHOTO_BYTES) throw new PreparationError('PHOTO_TOO_LARGE', '사진은 10MB 미만이어야 합니다.', 413);
      parts.push(chunk);
    }
    const bytes = Buffer.concat(parts);
    try { inspectPhoto(bytes, request.headers['content-type']); }
    catch (error) { bytes.fill(0); throw error; }
    return bytes;
  } finally { for (const part of parts) part.fill(0); }
}

const ASSETS = new Map([
  ['/', ['준비화면.html', 'text/html; charset=utf-8']],
  ['/ready.js', ['준비화면.js', 'text/javascript; charset=utf-8']],
  ['/ready.css', ['준비화면.css', 'text/css; charset=utf-8']],
].map(([path, [file, type]]) => [path, { body: readFileSync(new URL(file, import.meta.url),'utf8').replaceAll('__APP_NAME__',APP.name), type }]));

async function readConsent(request,fields=['consent']) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new PreparationError('INVALID_CONTENT_TYPE', 'JSON 요청만 허용합니다.', 415);
  }
  const chunks = await new Promise((resolve, reject) => {
    let size = 0;
    let rejected = false;
    const parts = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 1024) {
        rejected = true;
        reject(new PreparationError('BODY_TOO_LARGE', '사진이나 큰 데이터는 받지 않습니다.', 413));
      } else if (!rejected) parts.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolve(parts); });
    request.on('error', reject);
    request.on('aborted', () => reject(new PreparationError('REQUEST_ABORTED', '요청이 취소되었습니다.', 400)));
  });
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PreparationError('INVALID_JSON', '요청 형식이 올바르지 않습니다.', 400); }
  if (body?.consent !== true || Object.keys(body).some(name=>!fields.includes(name))) {
    throw new PreparationError('CONSENT_REQUIRED', '인증·가격 조회에 먼저 동의해 주세요. 사진은 전송하지 않습니다.', 400);
  }
  return body;
}

export async function verifyPhotoAccount(ticket,origin) {
  if(!APP_ORIGINS.has(origin)||typeof ticket!=='string'||! /^[a-f0-9]{64}$/.test(ticket))throw new PreparationError('ACCOUNT_REQUIRED','로그인 후 사진 서버를 다시 연결해 주세요.',401);
  let response;
  try{response=await fetch(`${origin}/api/account/photo-verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Beauty-Client':'account-v1'},body:JSON.stringify({ticket}),redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw new PreparationError('ACCOUNT_UNAVAILABLE','계정 서버를 확인하지 못했어요. 사진은 전송하지 않았어요.',503);}
  if(!response.ok)throw new PreparationError('ACCOUNT_REQUIRED','로그인 후 사진 서버를 다시 연결해 주세요.',401);
  const result=await response.json();
  if(typeof result.userId!=='string'||! /^[a-zA-Z0-9-]{1,64}$/.test(result.userId))throw new PreparationError('ACCOUNT_REQUIRED','계정 확인에 실패했어요.',401);
  return result.userId;
}

export function createPreparationService({ env = process.env, fetchImpl = fetch, now = Date.now, sleep, verifyAccount=verifyPhotoAccount, integrated=false, origins=APP_ORIGINS, getPort=()=>4174, resolveAnalysisAccess=async()=>null, photoState,onOperationalError=()=>{} } = {}) {
  const allowedOrigins = new Set(origins);
  const accessPolicy=integrated?createAccessPolicy([...origins]):null;
  const apiKey = env.YOUCAM_API_KEY ?? '';
  const lookupAllowed = env.YOUCAM_ALLOW_LOOKUP === '1';
  const localToken = randomBytes(32).toString('hex');
  let attempts = 0;
  let nextLookupAt = 0;
  let busy = false;
  const analysisEnabled=env.YOUCAM_ALLOW_ANALYSIS === '1' && lookupAllowed && validApiKey(apiKey);
  const analyses=new Map();
  function analysisFor(accountId){
    if(!analyses.has(accountId))analyses.set(accountId,createAnalysisSession({apiKey,enabled:analysisEnabled,fetchImpl,now,sleep,stateStore:photoState?.(accountId)??createVolatilePhotoState(),onFailure:()=>onOperationalError('analysis')}));
    return analyses.get(accountId);
  }

  async function accessFor(accountId){
    const access=accountId?await resolveAnalysisAccess(accountId):null;
    const verified=access?.accountId===accountId;
    const fullAnalysis=Boolean(verified&&access.fullAnalysis===true&&access.maxActions===16);
    return {maxActions:fullAnalysis?16:4,fullAnalysis,remaining:verified?access.remaining:1,tier:verified?access.tier:'free',periodEnd:verified?access.expiresAt:null,oneTimeRemaining:verified?access.oneTimeRemaining:0,freeTrialRemaining:verified?access.freeTrialRemaining:1,trialLocked:verified?access.trialLocked:false,completedCheckinDays:verified?access.completedCheckinDays:0,trialRequiredDays:verified?access.trialRequiredDays:3,billingAvailable:false,capacity:verified?access.capacity:null};
  }

  function requireAnalysisAccess(access){
    if(access.capacity?.closedTotal)throw new PreparationError('ANALYSIS_TOTAL_CAP','사진 분석이 잠시 마감됐어요. 다시 열리면 알려드릴게요.',429);
    if(access.capacity?.closedDaily)throw new PreparationError('ANALYSIS_DAILY_CAP','오늘 분석은 마감됐어요. 내일 다시 열려요.',429);
    if(access.remaining>0)return;
    if(access.tier==='subscription')throw new PreparationError('MONTHLY_LIMIT','이번 결제 기간의 분석 횟수를 모두 사용했어요.',429);
    if(access.trialLocked)throw new PreparationError('TRIAL_LOCKED',`${access.trialRequiredDays}일 체크인을 마치면 무료 사진 분석이 열려요.`,403);
    throw new PreparationError('UPGRADE_REQUIRED','무료 체험을 사용했어요. 이용권을 확인해 주세요.',402);
  }

  function send(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  }

  async function handle(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    try {
      const port = getPort();
      const host = request.headers.host;
      const origin = `http://${host}`;
      if(integrated){
        try{if(!accessPolicy(request,response,{methods:['GET','POST'],headers:['content-type','x-local-token','x-photo-consent','x-overseas-consent','x-quote-id','x-photo-account']}))return;}
        catch{throw new PreparationError('ORIGIN_DENIED','허용되지 않은 앱 연결입니다.',403);}
      }
      if (!integrated && host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new PreparationError('HOST_DENIED', '이 PC의 앱에서 접근해 주세요.', 403);
      const path = integrated ? (request.url?.startsWith('/api/youcam/') ? `/api/${request.url.slice('/api/youcam/'.length)}` : '') : request.url;
      const accountOrigin = integrated ? (request.headers.origin??origin) : request.headers.origin;
      const appAccess = (integrated||allowedOrigins.has(accountOrigin)) && (path === '/api/status' || path.startsWith('/api/analysis/'));
      if (integrated && !appAccess) throw new PreparationError('NOT_FOUND', '지원하지 않는 사진 분석 요청입니다.', 404);
      if (((request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') && !appAccess) throw new PreparationError('ORIGIN_DENIED', '다른 사이트에서의 접근은 허용하지 않습니다.', 403);
      if (appAccess && !integrated) {
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
        response.setHeader('Vary', 'Origin');
        if (request.method === 'OPTIONS') {
          const headers = (request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(name => name.trim()).filter(Boolean);
          if (!['GET', 'POST'].includes(request.headers['access-control-request-method']) || headers.some(name => !['content-type','x-local-token','x-photo-consent','x-overseas-consent','x-quote-id','x-photo-account'].includes(name))) throw new PreparationError('PREFLIGHT_DENIED', '허용되지 않은 앱 요청입니다.', 403);
          response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token, X-Photo-Consent, X-Overseas-Consent, X-Quote-Id, X-Photo-Account' });
          response.end(); return;
        }
      }
      let accountId=null;
      if(appAccess){
        accountId=await verifyAccount(request.headers['x-photo-account'],accountOrigin);
      }
      if (request.method === 'GET' && ASSETS.has(path)) {
        const asset = ASSETS.get(path);
        response.writeHead(200, { 'Content-Type': asset.type });
        response.end(asset.body);
        return;
      }
      if (request.method === 'GET' && path === '/api/status') {
        const current=await analysisFor(accountId).status();
        send(response, 200, {
          accountScoped: true,
          keyConfigured: validApiKey(apiKey), lookupAllowed, analysisEnabled: current.enabled, analysisUsed: current.used,
          remainingLookups: Math.max(0, 5 - attempts),
          retryAfterSeconds: Math.max(0, Math.ceil((nextLookupAt - now()) / 1000)),
          busy, localToken,
          access:await accessFor(accountId),
        });
        return;
      }
      if (path.startsWith('/api/analysis/')) {
        if (!appAccess || !accountId || request.headers['x-local-token'] !== localToken) throw new PreparationError('LOCAL_AUTH_REQUIRED', '로그인한 앱에서 서버 연결을 다시 확인해 주세요.', 403);
        const analysis=analysisFor(accountId);
        if (request.method === 'GET' && path === '/api/analysis/result') { send(response, 200, {...await analysis.status(),access:await accessFor(accountId)}); return; }
        if (request.method === 'POST' && path === '/api/analysis/quote') {
          const body=await readConsent(request,['consent','actions']);
          const access=await accessFor(accountId);
          requireAnalysisAccess(access);
          const selected=validateAnalysisSelection(body.actions??ACTIONS,access.maxActions);
          send(response,200,await analysis.quote(selected,access.maxActions));return;
        }
        if (request.method === 'POST' && path === '/api/analysis/clear') { await readConsent(request); await analysis.clear(); send(response, 200, await analysis.status()); return; }
        if (request.method === 'POST' && path === '/api/analysis/start') {
          if (!['image/jpeg', 'image/png'].includes(request.headers['content-type'])) throw new PreparationError('PHOTO_TYPE', 'JPEG 또는 PNG 사진만 받습니다.', 415);
          const access=await accessFor(accountId);
          requireAnalysisAccess(access);
          await analysis.reserve(request.headers['x-quote-id'], request.headers['x-photo-consent'],request.headers['x-overseas-consent'],access.maxActions);
          try { const bytes=await readPhoto(request);try{await verifyAccount(request.headers['x-photo-account'],accountOrigin);await analysis.start(bytes,request.headers['content-type']);}catch(error){bytes.fill(0);throw error;} }
          catch (error) { await analysis.rejectUpload(error); throw error; }
          send(response, 202, await analysis.status()); return;
        }
        throw new PreparationError('NOT_FOUND', '지원하지 않는 분석 요청입니다.', 404);
      }
      if (request.method !== 'POST' || path !== '/api/feature-cost') throw new PreparationError('NOT_FOUND', '지원하지 않는 요청입니다. 사진 업로드·분석은 연결하지 않았습니다.', 404);
      if (request.headers.origin !== origin || request.headers['x-local-token'] !== localToken) throw new PreparationError('LOCAL_AUTH_REQUIRED', '준비 화면을 새로고침한 뒤 다시 시도해 주세요.', 403);
      if (!lookupAllowed) throw new PreparationError('LOOKUP_DISABLED', '외부 조회가 꺼져 있습니다. 시작 창에서 가격 조회를 허용한 뒤 다시 실행해 주세요.', 403);
      if (!validApiKey(apiKey)) throw new PreparationError('KEY_REQUIRED', '서버에 API 키가 설정되지 않았습니다.', 503);
      await readConsent(request);
      if (busy) throw new PreparationError('LOOKUP_BUSY', '가격 조회가 이미 진행 중입니다.', 409);
      if (attempts >= 5 || now() < nextLookupAt) throw new PreparationError('LOCAL_LIMIT', '가격 조회는 30초 간격, 서버 실행당 최대 5회까지 가능합니다.', 429);
      busy = true;
      attempts += 1;
      nextLookupAt = now() + 30000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const cancel = () => { if (!response.writableEnded) controller.abort(); };
      response.on('close', cancel);
      try {
        const result = await lookupSkinCosts({ apiKey, fetchImpl, signal: controller.signal });
        if (!response.destroyed) send(response, 200, result);
      } finally {
        clearTimeout(timer);
        response.off('close', cancel);
        busy = false;
      }
    } catch (error) {
      request.resume();
      if (response.destroyed || response.writableEnded) return;
      const known = error instanceof PreparationError;
      if(!known||error.status>=500)onOperationalError('server');
      send(response, known ? error.status : 500, {
        error: { code: known ? error.code : 'SERVER_ERROR', message: known ? error.message : '요청을 처리하지 못했습니다.' },
      });
    }
  }
  return {handle,clearOwner(accountId){analyses.get(accountId)?.purge();analyses.delete(accountId);},close(){for(const analysis of analyses.values())analysis.close();analyses.clear();}};
}

export function createPreparationServer(options = {}) {
  const server = createServer();
  const service = createPreparationService({...options,getPort:()=>server.address()?.port});
  server.on('request',service.handle);
  server.on('close',service.close);
  server.requestTimeout = 30000;
  server.headersTimeout = 5000;
  server.setTimeout(45000, socket => socket.destroy());
  return server;
}

export async function listenPreparationServer(server, preferredPort = 4174) {
  function listen(port) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        server.off('error', failed);
        server.off('listening', ready);
      };
      const failed = error => { cleanup(); reject(error); };
      const ready = () => { cleanup(); resolve(); };
      server.once('error', failed);
      server.once('listening', ready);
      try { server.listen(port, '127.0.0.1'); }
      catch (error) { failed(error); }
    });
  }
  let switchedPort = false;
  try { await listen(preferredPort); }
  catch (error) {
    if (error.code !== 'EADDRINUSE' || preferredPort === 0) throw error;
    await listen(0);
    switchedPort = true;
  }
  return { url: `http://127.0.0.1:${server.address().port}`, switchedPort };
}

export function startupErrorMessage(error) {
  if (error.code === 'EACCES' || error.code === 'EPERM') return '로컬 서버를 열 권한이 없습니다. 보안 설정을 확인해 주세요. API 키 인증 전 단계의 오류입니다.';
  if (error.code === 'EADDRINUSE') return '사용 가능한 로컬 포트를 확보하지 못했습니다. 기존 실행 창을 확인해 주세요. API 키 인증 전 단계의 오류입니다.';
  return '로컬 서버를 시작하지 못했습니다. Node.js와 실행 환경을 확인해 주세요. API 키 인증 전 단계의 오류입니다.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPreparationServer();
  try {
    const started = await listenPreparationServer(server);
    registerPhotoConnection(server);
    if (started.switchedPort) console.log('4174 포트가 사용 중이라 기존 프로그램을 종료하지 않고 빈 포트를 선택했습니다.');
    console.log(`유캠 연결 준비: ${started.url}`);
    console.log(process.env.YOUCAM_ALLOW_ANALYSIS === '1' ? '사진 분석 허용: 앱에서 별도 동의 후 3항목·1회만 실행합니다. 앱이 연결 주소를 자동으로 확인합니다.' : '사진 분석은 꺼져 있습니다. 가격 조회만 사용할 수 있습니다.');
    console.log('API 키는 화면이나 로그에 출력하지 않습니다. 앱 주소: http://127.0.0.1:4173/#care');
    console.log('위에 표시된 주소를 여세요. 서버 종료는 Ctrl+C입니다.');
    const shutdown = () => {
      server.close();
      server.closeAllConnections();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    server.close();
    server.closeAllConnections();
    console.error(startupErrorMessage(error));
    process.exitCode = 1;
  }
}
