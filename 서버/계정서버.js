import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { EMPTY, validateData } from '../화면/계산.js';
import { readPhotoConnection } from './사진연결.js';
import { createAccessPolicy, isNativeOrigin } from './접근정책.js';
import { createKakaoLogin } from './카카오로그인.js';
import { createKakaoWebhook } from './카카오웹훅.js';
import { createAccountStore } from './계정저장소.js';
import { createEntitlementService } from './이용권.js';
import { createPaymentGateway } from './결제창구.js';
import { readProductSettings } from './상품설정.js';

const derive=promisify(scrypt);
const digest=value=>createHash('sha256').update(value).digest('hex');
const empty=()=>validateData(EMPTY());
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const same=(first,second)=>typeof first==='string'&&typeof second==='string'&&Buffer.byteLength(first)===Buffer.byteLength(second)&&timingSafeEqual(Buffer.from(first),Buffer.from(second));
const fault=(status,code,message)=>Object.assign(Error(message),{status,code});
const fields=(body,keys)=>{if(!object(body)||Object.keys(body).some(key=>!keys.includes(key)))throw fault(400,'INVALID_BODY','요청 형식을 확인해 주세요.');};
const checkPassword=password=>{if(typeof password!=='string'||password.length===0)throw fault(400,'PASSWORD_REQUIRED','비밀번호를 입력해 주세요.');if(password.length>128||Buffer.byteLength(password)>512)throw fault(400,'PASSWORD_LENGTH','비밀번호는 128자까지 입력할 수 있어요.');};
const accountName=value=>{if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{4,32}$/.test(value))throw fault(400,'USERNAME_FORMAT','아이디는 영문·숫자·밑줄·하이픈 4~32자로 입력해 주세요.');return value.toLowerCase();};

async function hashPassword(password,salt=randomBytes(16).toString('hex')){
  const hash=await derive(password,salt,64,{N:131072,r:8,p:1,maxmem:192*1024*1024});
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password,stored){
  const salt=stored?.split(':')[0]??'00000000000000000000000000000000';
  return same(await hashPassword(password,salt),stored??'');
}
async function readBody(request,maxBytes=5_000_000){
  if(request.headers['content-type']?.split(';')[0].trim()!=='application/json')throw fault(415,'JSON_REQUIRED','JSON 요청만 허용합니다.');
  const chunks=await new Promise((resolve,reject)=>{
    const parts=[];let size=0,failed=false;
    request.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>maxBytes){failed=true;parts.length=0;reject(fault(413,'BODY_TOO_LARGE','저장 내용이 너무 커요. 최대 5MB까지 처리합니다.'));}else parts.push(chunk);});
    request.on('end',()=>resolve(parts));request.on('error',reject);request.on('aborted',()=>reject(fault(400,'REQUEST_ABORTED','요청이 중단됐어요.')));
  });
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fault(400,'INVALID_JSON','요청 내용의 형식을 확인해 주세요.');}
}

export function createAccountService({dbPath=resolve('.계정자료/뷰티로그.sqlite'),origins=['http://127.0.0.1:4173','http://localhost:4173'],env={},fetchImpl=fetch,now=Date.now,sessionLifetime=8*60*60*1000,idleLifetime=60*60*1000,photoConnection=readPhotoConnection,onDelete=()=>{},paymentProvider,onOperationalError=()=>{}}={}){
  const access=createAccessPolicy(origins);
  const databaseUrl=dbPath===':memory:'?'':env.DATABASE_URL;
  let encryptionKey;
  if(databaseUrl){
    const encoded=env.ACCOUNT_ENCRYPTION_KEY;
    if(typeof encoded!=='string'||!(/^[a-f0-9]{64}$/i.test(encoded)||/^[A-Za-z0-9+/]{43}=$/.test(encoded)))throw Error('ACCOUNT_ENCRYPTION_KEY에 32바이트 저장키를 설정해 주세요.');
    encryptionKey=Buffer.from(encoded,/^[a-f0-9]{64}$/i.test(encoded)?'hex':'base64');
  }else if(dbPath===':memory:')encryptionKey=randomBytes(32);
  else{
    mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
    const keyPath=resolve(dirname(dbPath),'저장키');
    try{encryptionKey=readFileSync(keyPath);}catch(issue){
      if(issue.code!=='ENOENT')throw issue;
      try{readFileSync(dbPath);throw Error('기존 계정 DB의 저장키가 없습니다. 새 키로 덮어쓰지 않습니다.');}catch(missing){if(missing.code!=='ENOENT')throw missing;}
      encryptionKey=randomBytes(32);writeFileSync(keyPath,encryptionKey,{flag:'wx',mode:0o600});
    }
    if(encryptionKey.length!==32)throw Error('계정 저장키를 확인해 주세요.');
  }
  const database=createAccountStore({dbPath,databaseUrl,caPath:env.DATABASE_CA_CERT_PATH,onConnectionError:()=>onOperationalError('database')});
  const products=readProductSettings(env);
  const paymentsEnabled=env.PAYMENTS_ENABLED==='true';
  const entitlements=createEntitlementService({database,now,monthlyLimit:Number(env.SUBSCRIPTION_MONTHLY_ANALYSES??2),trialDays:products.freeTrialCheckinDays,trialBypassAccountIds:products.trialBypassAccountIds,
    dailyCap:Number(env.ANALYSIS_DAILY_CAP??10),totalCap:Number(env.ANALYSIS_TOTAL_CAP??100),onCapThreshold:()=>onOperationalError('analysis-cap-80'),
    getCheckinDates:async accountId=>(await database.prepare('SELECT received_date FROM trial_checkin_days WHERE user_id=?').all(accountId)).map(row=>row.received_date),
  });
  const payment=createPaymentGateway({database,provider:paymentProvider,now,price:products.subscriptionPriceKrw,analysisPassPrice:products.analysisPassPriceKrw,analysisPassProductId:products.analysisPassProductId,entitlements});
  const serviceStartedAt=now();
  let hashing=0,closed=false;
  const cookieName=`beauty_account_${new URL(origins[0]).port}`;
  const secureCookies=origins.some(origin=>origin.startsWith('https:')&&!isNativeOrigin(origin));
  const cookie=(token,age)=>`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api/account; Max-Age=${age}${secureCookies?'; Secure':''}`;
  const nativeRequest=request=>isNativeOrigin(request.headers.origin);
  const tokenFrom=request=>request.headers.authorization!==undefined?(request.headers.authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??''):nativeRequest(request)?'':(request.headers.cookie??'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';
  const csrf=token=>createHmac('sha256',token).update('beauty-account-csrf-v1').digest('hex');
  const transaction=operation=>database.transaction(operation);
  function seal(data,associatedData){
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,nonce);
    cipher.setAAD(Buffer.from(associatedData));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
    return [nonce,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64')).join('.');
  }
  function open(payload,associatedData){
    const [nonce,tag,contents]=payload.split('.').map(part=>Buffer.from(part,'base64'));
    const cipher=createDecipheriv('aes-256-gcm',encryptionKey,nonce);cipher.setAuthTag(tag);cipher.setAAD(Buffer.from(associatedData));
    return JSON.parse(Buffer.concat([cipher.update(contents),cipher.final()]).toString('utf8'));
  }
  const encrypt=(data,userId,revision)=>seal(data,`${userId}:${revision}`);
  const decrypt=row=>validateData(open(row.payload,`${row.user_id}:${row.revision}`));
  async function clean(){
    await database.prepare('DELETE FROM sessions WHERE expires_at<=? OR idle_until<=?').run(now(),now());
    await database.prepare('DELETE FROM photo_tickets WHERE expires_at<=?').run(now());
    await database.prepare('DELETE FROM limits WHERE until<=?').run(now());
  }
  async function rate(key,maximum,window=15*60*1000){
    const hashed=digest(key),entry=await database.prepare('SELECT count,until FROM limits WHERE key=?').get(hashed);
    if(entry&&entry.until>now()&&entry.count>=maximum)throw fault(429,'RATE_LIMIT','시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
    await database.prepare('INSERT INTO limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN limits.until<=? THEN 1 ELSE limits.count+1 END,until=CASE WHEN limits.until<=? THEN excluded.until ELSE limits.until END').run(hashed,now()+window,now(),now());
  }
  async function passwordWork(operation){if(hashing>=2)throw fault(429,'BUSY','로그인 처리 중이에요. 잠시 후 다시 시도해 주세요.');hashing++;try{return await operation();}finally{hashing--;}}
  async function session(request,required=true,bound=false){
    const token=tokenFrom(request);
    const found=/^[a-f0-9]{64}$/.test(token)?await database.prepare('SELECT sessions.*,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND idle_until>?').get(digest(token),now(),now()):null;
    if(!found){if(required)throw fault(401,'AUTH_REQUIRED','로그인이 만료됐어요. 다시 로그인해 주세요.');return null;}
    if(bound&&(request.headers['x-account-id']!==found.user_id||request.headers['x-session-id']!==found.id))throw fault(409,'SESSION_CHANGED','다른 창에서 로그인 계정이 바뀌었어요. 화면을 다시 열어 주세요.');
    return {...found,token};
  }
  async function protect(request){const current=await session(request,true,true);if(!same(request.headers['x-csrf-token'],csrf(current.token)))throw fault(403,'CSRF_REQUIRED','로그인 상태를 다시 확인해 주세요.');return current;}
  const info=async current=>current?{user:{id:current.user_id,username:current.username,hasPassword:Boolean((await database.prepare('SELECT password FROM users WHERE id=?').get(current.user_id))?.password),kakaoLinked:Boolean(await database.prepare('SELECT user_id FROM kakao_identities WHERE user_id=?').get(current.user_id))},sessionId:current.id,csrfToken:csrf(current.token),expiresAt:current.expires_at}:{user:null};
  async function issueSession(user,request,response){
    const token=randomBytes(32).toString('hex'),identifier=randomUUID(),expires=now()+sessionLifetime;
    await database.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(tokenFrom(request)));
    await database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(identifier,digest(token),user.id,expires,Math.min(expires,now()+idleLifetime));
    if(!nativeRequest(request))response.setHeader('Set-Cookie',cookie(token,Math.floor(sessionLifetime/1000)));
    return {...await info({id:identifier,user_id:user.id,username:user.username,token,expires_at:expires}),...(nativeRequest(request)?{accessToken:token}:{})};
  }
  function send(response,status,body){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(body));}
  const kakao=createKakaoLogin({database,env,origins,fetchImpl,now,encryptionKey,protect,rate,transaction,issueSession,
    async createUser(){
      const user={id:randomUUID(),username:`kakao_${randomBytes(8).toString('hex')}`};
      await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,user.username,'','',now());
      await database.prepare('INSERT INTO documents VALUES(?,0,?)').run(user.id,encrypt(empty(),user.id,0));return user;
    },
    async deleteUser(userId){await database.prepare('DELETE FROM users WHERE id=?').run(userId);},
  });
  const kakaoWebhook=createKakaoWebhook({database,env,fetchImpl,now,encryptionKey,onDelete});
  async function verifyPhotoTicket(ticket){
    if(closed)throw fault(503,'SERVER_CLOSED','계정 연결을 다시 확인해 주세요.');
    await database.ready();
    if(typeof ticket!=='string'||! /^[a-f0-9]{64}$/.test(ticket))throw fault(401,'PHOTO_AUTH_REQUIRED','사진 분석에 로그인 확인이 필요해요.');
    const found=await database.prepare('SELECT sessions.user_id FROM photo_tickets JOIN sessions ON sessions.id=photo_tickets.session_id WHERE photo_tickets.token_hash=? AND photo_tickets.expires_at>? AND sessions.expires_at>? AND sessions.idle_until>?').get(digest(ticket),now(),now(),now());
    if(!found)throw fault(401,'PHOTO_AUTH_REQUIRED','로그인 후 사진 분석을 다시 열어 주세요.');
    return found.user_id;
  }
  async function analysisAccess(accountId){
    const result=await entitlements.access(accountId);
    const stored=await database.prepare('SELECT job FROM photo_usage WHERE user_id=?').get(accountId);
    if(stored?.job){
      const job=open(stored.job,`photo:${accountId}`);
      if(job?.state==='failed'&&!job.requestId){
        await database.prepare('UPDATE analysis_entitlements SET legacy_free_used=0 WHERE user_id=?').run(accountId);
        return entitlements.access(accountId);
      }
    }
    return {...result,capacity:await entitlements.capacity()};
  }
  function photoState(accountId){
    const encode=job=>job===null?null:seal(job,`photo:${accountId}`);
    const decode=payload=>payload===null?null:open(payload,`photo:${accountId}`);
    const row=()=>database.prepare('SELECT used,job,updated_at FROM photo_usage WHERE user_id=?').get(accountId);
    return {
      async get(){
        await database.ready();
        const stored=await row();
        let job=stored?.job?decode(stored.job):null;
        if(job&&['receiving','running'].includes(job.state)&&stored.updated_at<serviceStartedAt){
          job={state:'uncertain',message:'이전 분석의 완료 여부를 유캠 사용 내역에서 확인해 주세요. 자동 재실행하지 않습니다.'};
          const previous=decode(stored.job);
          if(previous.requestId)await entitlements.transition(accountId,previous.requestId,'uncertain',()=>database.prepare('UPDATE photo_usage SET job=?,updated_at=? WHERE user_id=? AND updated_at=?').run(encode({...job,requestId:previous.requestId}),now(),accountId,stored.updated_at));
          else await database.prepare('UPDATE photo_usage SET job=?,updated_at=? WHERE user_id=? AND updated_at=?').run(encode(job),now(),accountId,stored.updated_at);
        }
        const access=await analysisAccess(accountId);
        return {used:access.remaining===0&&!(access.tier==='free'&&access.trialLocked)||['receiving','running','uncertain'].includes(job?.state),job};
      },
      async reserve(requestId,requiredActions){
        await database.ready();
        await entitlements.reserve(accountId,requestId,async()=>{
          await database.prepare('INSERT INTO photo_usage(user_id,used,job,updated_at) VALUES(?,0,NULL,?) ON CONFLICT DO NOTHING').run(accountId,now());
          await database.prepare('UPDATE photo_usage SET used=1,job=?,updated_at=? WHERE user_id=?').run(encode({state:'receiving',requestId}),now(),accountId);
        },async()=>['receiving','running','uncertain'].includes(decode((await row())?.job??null)?.state),requiredActions);
      },
      async update(job){
        const previous=decode((await row())?.job??null);
        if(!previous?.requestId)throw fault(409,'INVALID_STATE','분석 기록을 다시 확인해 주세요.');
        const requestState=job.state==='failed'?'failed':job.state==='success'?'success':job.state==='uncertain'?'uncertain':'running';
        await entitlements.transition(accountId,previous.requestId,requestState,async()=>{
          const changed=await database.prepare('UPDATE photo_usage SET used=?,job=?,updated_at=? WHERE user_id=?').run(requestState==='failed'?0:1,encode({...job,requestId:previous.requestId}),now(),accountId);
          if(changed.changes!==1)throw fault(409,'INVALID_STATE','분석 기록을 다시 확인해 주세요.');
        });
      },
      async release(job){
        const previous=decode((await row())?.job??null);
        if(!previous?.requestId)return;
        await entitlements.transition(accountId,previous.requestId,'failed',()=>database.prepare('UPDATE photo_usage SET used=0,job=?,updated_at=? WHERE user_id=?').run(encode(job),now(),accountId));
      },
      async clear(){await database.prepare('UPDATE photo_usage SET job=NULL,updated_at=? WHERE user_id=?').run(now(),accountId);},
    };
  }
  async function handle(request,response){
    response.setHeader('Cache-Control','no-store, private');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
    try{
      if(closed)throw fault(503,'SERVER_CLOSED','계정 서버를 다시 실행해 주세요.');
      await database.ready();
      if(request.url?.split('?')[0]==='/api/account/kakao-user-unlinked'){await kakaoWebhook.handle(request,response);return;}
      if(request.url?.split('?')[0]==='/api/account/kakao-callback'){await kakao.callback(request,response);return;}
      if(!access(request,response))return;
      const path=request.url;
      if(!/^\/api\/account\/[a-z-]+$/.test(path))throw fault(404,'NOT_FOUND','요청 경로를 확인해 주세요.');
      if(!['GET','POST','PUT'].includes(request.method))throw fault(405,'METHOD_DENIED','지원하지 않는 요청입니다.');
      if(request.method!=='GET'&&request.headers['x-beauty-client']!=='account-v1')throw fault(403,'ORIGIN_REQUIRED','앱에서 다시 요청해 주세요.');
      if(nativeRequest(request)&&request.headers['x-session-mode']!=='token')throw fault(403,'TOKEN_REQUIRED','앱 로그인 연결을 다시 확인해 주세요.');
      await clean();
      if(path==='/api/account/kakao-config'&&request.method==='GET'){send(response,200,{enabled:kakao.enabled,nativeEnabled:Boolean(env.KAKAO_NATIVE_APP_KEY&&kakao.enabled)});return;}
      if(path==='/api/account/kakao-native'&&request.method==='POST'){
        const body=await readBody(request,8192);fields(body,['purpose','accessToken','ageConfirmed','consent','confirm']);
        const answer=await kakao.native(request,response,body);
        if(answer.deleted){try{await onDelete(request.headers['x-account-id']);}catch{console.warn('카카오 탈퇴 후 임시 사진 정리 실패');}}
        send(response,200,answer);return;
      }
      if(path==='/api/account/kakao-start'&&request.method==='POST'){
        const body=await readBody(request,4096);fields(body,['purpose','challenge','ageConfirmed','consent','confirm']);
        send(response,200,await kakao.start(request,body));return;
      }
      if(path==='/api/account/kakao-complete'&&request.method==='POST'){
        const body=await readBody(request,4096);fields(body,['flowId','verifier']);
        const answer=await kakao.complete(request,response,body);
        if(answer.deleted){
          try{await database.checkpoint();}catch{console.warn('계정 삭제 후 DB 임시 기록 정리 확인 필요');}
          try{await onDelete(request.headers['x-account-id']);}catch{console.warn('계정 삭제 후 임시 사진 결과 정리 실패');}
          if(!nativeRequest(request))response.setHeader('Set-Cookie',cookie('',0));
        }
        send(response,200,answer);return;
      }
      if(path==='/api/account/session'&&request.method==='GET'){
        const current=await session(request,false);
        if(current)await database.prepare('UPDATE sessions SET idle_until=? WHERE id=?').run(Math.min(current.expires_at,now()+idleLifetime),current.id);
        send(response,200,await info(current));return;
      }
      if(['/api/account/register','/api/account/login','/api/account/recover'].includes(path)&&request.method==='POST'){
        await rate(`auth-ip:${request.socket.remoteAddress}`,30);
        const body=await readBody(request,4096);fields(body,['username','password','consent','ageConfirmed','recoveryCode']);
        const username=accountName(body.username);checkPassword(body.password);await rate(`auth-name:${username}`,10);
        if(path.endsWith('/register')){
          if(body.consent!==true)throw fault(400,'CONSENT_REQUIRED','계정과 기록의 서버 저장에 동의해 주세요.');
          if(body.ageConfirmed!==true)throw fault(400,'AGE_CONFIRMATION_REQUIRED','만 14세 이상인지 확인해 주세요.');
          const password=await passwordWork(()=>hashPassword(body.password)),recoveryCode=randomBytes(20).toString('hex'),user={id:randomUUID(),username};
          let answer;
          try{
            answer=await transaction(async()=>{
              if(await database.prepare('SELECT id FROM users WHERE username=?').get(username))throw fault(409,'USERNAME_TAKEN','사용할 수 없는 아이디예요. 다른 아이디를 선택해 주세요.');
              await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,username,password,digest(recoveryCode),now());
              await database.prepare('INSERT INTO documents VALUES(?,0,?)').run(user.id,encrypt(empty(),user.id,0));
              return await issueSession(user,request,response);
            });
          }catch(issue){
            if(issue.code==='23505'&&issue.constraint==='users_username_key')throw fault(409,'USERNAME_TAKEN','사용할 수 없는 아이디예요. 다른 아이디를 선택해 주세요.');
            throw issue;
          }
          send(response,201,{...answer,recoveryCode});return;
        }
        const user=await database.prepare('SELECT * FROM users WHERE username=?').get(username);
        if(path.endsWith('/recover')){
          if(typeof body.recoveryCode!=='string'||!user||!same(digest(body.recoveryCode),user.recovery))throw fault(401,'BAD_CREDENTIALS','아이디 또는 복구 코드를 확인해 주세요.');
          const password=await passwordWork(()=>hashPassword(body.password)),recoveryCode=randomBytes(20).toString('hex');
          const recoveringOwnSession=(await session(request,false))?.user_id===user.id;
          await transaction(async()=>{
            const changed=await database.prepare('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?').run(password,digest(recoveryCode),user.id,user.recovery);
            if(changed.changes!==1)throw fault(409,'RECOVERY_USED','이미 사용한 복구 코드예요.');
            await database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          });
          if(recoveringOwnSession)response.setHeader('Set-Cookie',cookie('',0));
          send(response,200,{recoveryCode});return;
        }
        if(!await passwordWork(()=>verifyPassword(body.password,user?.password)))throw fault(401,'BAD_CREDENTIALS','아이디 또는 비밀번호를 확인해 주세요.');
        const latest=await database.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        if(!latest||latest.password!==user.password)throw fault(401,'BAD_CREDENTIALS','로그인 정보를 다시 확인해 주세요.');
        send(response,200,await transaction(()=>issueSession(latest,request,response)));return;
      }
      if(path==='/api/account/photo-verify'&&request.method==='POST'){
        const body=await readBody(request,1024);fields(body,['ticket']);
        send(response,200,{userId:await verifyPhotoTicket(body.ticket)});return;
      }
      const current=await (request.method==='GET'?session(request,true,true):protect(request));
      if(path==='/api/account/subscription'&&request.method==='GET'){send(response,200,{...await payment.status(current.user_id),paymentsEnabled:paymentsEnabled&&Boolean(paymentProvider&&paymentProvider.kind!=='fake')});return;}
      if(path==='/api/account/payment-interest'&&request.method==='POST'){
        const body=await readBody(request,1024);fields(body,['product']);
        if(!['pass','subscription'].includes(body.product))throw fault(400,'INVALID_PRODUCT','상품을 다시 선택해 주세요.');
        await database.prepare('INSERT INTO payment_interest(user_id,product,requested_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(current.user_id,body.product,now());
        send(response,200,{ok:true});return;
      }
      if(path.startsWith('/api/account/subscription-')&&request.method==='POST'){
        if(!paymentsEnabled)throw fault(503,'PAYMENTS_CLOSED','결제는 아직 열리지 않았어요.');
        await rate(`billing:${current.user_id}`,12,60_000);
        const action=path.slice('/api/account/subscription-'.length);
        const body=await readBody(request,2048);
        fields(body,action==='purchase'?['receipt','productId']:action==='restore'||action==='refund'?['productId','purchaseId']:[]);
        if(action==='purchase')send(response,200,await payment.purchase(current.user_id,body.receipt,body.productId));
        else if(action==='cancel')send(response,200,await payment.cancel(current.user_id));
        else if(action==='restore')send(response,200,await payment.restore(current.user_id,body.productId,body.purchaseId));
        else if(action==='refund'&&paymentProvider?.kind==='fake')send(response,200,await payment.refund(current.user_id,body.productId,body.purchaseId));
        else throw fault(404,'NOT_FOUND','결제 요청을 확인해 주세요.');
        return;
      }
      if(path==='/api/account/photo-connection'&&request.method==='GET'){
        try{send(response,200,photoConnection());}catch{throw fault(503,'PHOTO_UNAVAILABLE','지금은 사진 분석을 이용할 수 없어요. 연결을 다시 확인해 주세요.');}return;
      }
      if(path==='/api/account/data'&&request.method==='GET'){
        const row=await database.prepare('SELECT * FROM documents WHERE user_id=?').get(current.user_id);
        send(response,200,{userId:current.user_id,revision:row.revision,data:decrypt(row)});return;
      }
      if(['/api/account/data','/api/account/import'].includes(path)&&request.method==='PUT'){
        const body=await readBody(request);fields(body,['data','revision','consent','backupConfirmed']);
        if(!Number.isSafeInteger(body.revision)||body.revision<0)throw fault(400,'REVISION_REQUIRED','기록 버전을 확인해 주세요.');
        let data;try{data=validateData(body.data);}catch(issue){throw fault(400,'INVALID_DATA',issue.message);}
        if(Buffer.byteLength(JSON.stringify(data))>5_000_000)throw fault(413,'BODY_TOO_LARGE','기록은 최대 5MB까지 저장할 수 있어요.');
        const importer=path.endsWith('/import');
        if(importer&&(body.consent!==true||body.backupConfirmed!==true))throw fault(400,'IMPORT_CONSENT','원본 백업과 선택한 자료의 이전 동의를 확인해 주세요.');
        const answer=await transaction(async()=>{
          const active=await protect(request);if(active.id!==current.id)throw fault(409,'SESSION_CHANGED','로그인 상태가 바뀌었어요.');
          const row=await database.prepare('SELECT * FROM documents WHERE user_id=?').get(active.user_id);
          if(row.revision!==body.revision)throw fault(409,'DATA_CONFLICT','다른 창에서 기록이 바뀌었어요. 입력을 보관하고 새로고침해 주세요.');
          if(importer&&(row.revision!==0||JSON.stringify(decrypt(row))!==JSON.stringify(empty())))throw fault(409,'IMPORT_NOT_EMPTY','기록이 없는 새 계정에서만 이전할 수 있어요. 기존 기록은 덮어쓰지 않았어요.');
          const revision=row.revision+1;
          const changed=await database.prepare('UPDATE documents SET revision=?,payload=? WHERE user_id=? AND revision=?').run(revision,encrypt(data,active.user_id,revision),active.user_id,row.revision);
          if(changed.changes!==1)throw fault(409,'DATA_CONFLICT','다른 창에서 기록이 바뀌었어요. 입력을 보관하고 새로고침해 주세요.');
          if(!importer){
            const receivedDate=new Date(now()+9*60*60*1000).toISOString().slice(0,10);
            const checked=data.skinCare.checkins.some(entry=>entry.date===receivedDate)||data.skinCare.days.some(day=>day.date===receivedDate&&(day.morning||day.evening));
            if(checked)await database.prepare('INSERT INTO trial_checkin_days(user_id,received_date,received_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(active.user_id,receivedDate,now());
            else if(!data.skinCare.profile)await database.prepare('DELETE FROM trial_checkin_days WHERE user_id=?').run(active.user_id);
          }
          return {userId:active.user_id,revision,data};
        });
        send(response,200,answer);return;
      }
      if(path==='/api/account/photo-ticket'&&request.method==='POST'){
        await rate(`photo-ticket:${current.id}`,60,60_000);
        const ticket=randomBytes(32).toString('hex'),expiresAt=Math.min(current.expires_at,current.idle_until,now()+5*60*1000);
        await database.prepare('INSERT INTO photo_tickets VALUES(?,?,?)').run(digest(ticket),current.id,expiresAt);
        send(response,200,{ticket,expiresAt});return;
      }
      if(path==='/api/account/logout'&&request.method==='POST'){
        await database.prepare('DELETE FROM sessions WHERE id=?').run(current.id);response.setHeader('Set-Cookie',cookie('',0));send(response,200,{ok:true});return;
      }
      if(path==='/api/account/delete'&&request.method==='POST'){
        const body=await readBody(request,4096);fields(body,['password','confirm']);
        if(body.confirm!==true)throw fault(400,'DELETE_CONFIRMATION_REQUIRED','탈퇴 전 모든 기록 삭제를 확인해 주세요.');
        checkPassword(body.password);
        const user=await database.prepare('SELECT password FROM users WHERE id=?').get(current.user_id);
        if(!user||!await passwordWork(()=>verifyPassword(body.password,user.password)))throw fault(401,'BAD_CREDENTIALS','비밀번호를 확인해 주세요.');
        await transaction(async()=>{
          const active=await protect(request);
          const deleted=await database.prepare('DELETE FROM users WHERE id=? AND password=?').run(active.user_id,user.password);
          if(deleted.changes!==1)throw fault(409,'SESSION_CHANGED','계정 상태가 바뀌었어요. 다시 확인해 주세요.');
        });
        try{await database.checkpoint();}catch{console.warn('계정 삭제 후 DB 임시 기록 정리 확인 필요');}
        try{await onDelete(current.user_id);}catch{console.warn('계정 삭제 후 임시 사진 결과 정리 실패');}
        response.setHeader('Set-Cookie',cookie('',0));send(response,200,{ok:true});return;
      }
      throw fault(404,'NOT_FOUND','요청 경로를 확인해 주세요.');
    }catch(issue){
      request.resume();
      if(!issue.status||issue.status>=500)onOperationalError('server');
      if(!response.headersSent)send(response,issue.status??500,{error:{code:issue.status?issue.code??'SERVER_ERROR':'SERVER_ERROR',message:issue.status?issue.message:'계정 서버에서 처리하지 못했어요. 기존 기록을 유지했습니다.'}});
    }
  }
  return {handle,verifyPhotoTicket,photoState,analysisAccess,payment,
    async health(){
      if(closed)return false;
      try{await database.ready();await database.prepare('SELECT 1 AS ok').get();return true;}
      catch{onOperationalError('database');return false;}
    },
    async close(){if(!closed){closed=true;await database.close();encryptionKey.fill(0);}}
  };
}
