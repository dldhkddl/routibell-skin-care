import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { isNativeOrigin } from './접근정책.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const fault=(status,code,message)=>Object.assign(Error(message),{status,code});
const nativeReturn='com.dldhkddl.skincare://kakao';
export function createKakaoLogin({database,env,origins,fetchImpl,now,encryptionKey,protect,rate,transaction,createUser,issueSession,deleteUser}){
  let redirect;
  try{redirect=new URL(env.KAKAO_REDIRECT_URI);}catch{}
  const enabled=Boolean(env.KAKAO_REST_API_KEY&&/^\d+$/.test(env.KAKAO_APP_ID??'')&&redirect&&redirect.pathname==='/api/account/kakao-callback'&&origins.includes(redirect.origin)&&!redirect.search&&!redirect.hash);
  const subject=value=>createHmac('sha256',encryptionKey).update(`kakao:${value}`).digest('hex');
  const clean=async()=>await database.prepare('DELETE FROM kakao_flows WHERE expires_at<=?').run(now());
  const requireEnabled=()=>{if(!enabled)throw fault(503,'KAKAO_DISABLED','카카오 로그인을 아직 이용할 수 없어요. 아이디로 로그인해 주세요.');};
  async function providerJson(address,options){
    try{
      const response=await fetchImpl(address,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error();
      return await response.json();
    }catch{throw fault(502,'KAKAO_UNAVAILABLE','카카오 로그인 확인을 마치지 못했어요. 다시 시도해 주세요.');}
  }
  async function start(request,body){
    requireEnabled();await clean();await rate(`kakao:${request.socket.remoteAddress}`,20);
    if(!['login','link','delete'].includes(body.purpose)||! /^[a-f0-9]{64}$/.test(body.challenge??''))throw fault(400,'KAKAO_REQUEST','로그인 요청을 다시 시작해 주세요.');
    const current=body.purpose==='login'?null:await protect(request);
    if(body.purpose==='login'&&(body.ageConfirmed!==true||body.consent!==true))throw fault(400,'KAKAO_CONSENT','만 14세 이상 확인과 계정 저장 동의가 필요해요.');
    if(body.purpose==='delete'&&body.confirm!==true)throw fault(400,'DELETE_CONFIRMATION_REQUIRED','계정과 모든 기록 삭제를 확인해 주세요.');
    const state=randomBytes(32).toString('hex'),identifier=randomUUID();
    await database.prepare('INSERT INTO kakao_flows VALUES(?,?,?,?,?,?,?,\'waiting\',NULL)').run(identifier,digest(state),body.challenge,request.headers.origin,body.purpose,current?.id??null,now()+10*60*1000);
    const address=new URL('https://kauth.kakao.com/oauth/authorize');
    address.search=new URLSearchParams({client_id:env.KAKAO_REST_API_KEY,redirect_uri:redirect.href,response_type:'code',state,...(body.purpose==='delete'?{prompt:'login'}:{})}).toString();
    return {flowId:identifier,authorizeUrl:address.href};
  }
  async function callback(request,response){
    requireEnabled();await clean();
    if(request.headers.host!==redirect.host||request.method!=='GET')throw fault(403,'KAKAO_CALLBACK','로그인 확인 주소가 일치하지 않아요.');
    const parameters=new URL(request.url,redirect.origin).searchParams;
    const state=parameters.get('state');
    if(parameters.getAll('state').length!==1||! /^[a-f0-9]{64}$/.test(state??''))throw fault(400,'KAKAO_STATE','로그인 요청을 다시 시작해 주세요.');
    const flow=await database.prepare('SELECT * FROM kakao_flows WHERE state_hash=? AND status=\'waiting\' AND expires_at>?').get(digest(state),now());
    if(!flow)throw fault(400,'KAKAO_STATE','만료되거나 이미 사용한 로그인 요청이에요.');
    const claimed=await database.prepare('UPDATE kakao_flows SET status=\'checking\' WHERE id=? AND status=\'waiting\'').run(flow.id);
    if(claimed.changes!==1)throw fault(400,'KAKAO_STATE','이미 처리 중인 로그인 요청이에요.');
    try{
      const code=parameters.get('code');
      if(parameters.has('error')||parameters.getAll('code').length!==1||!code||code.length>4096)throw Error();
      const tokens=await providerJson('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:env.KAKAO_REST_API_KEY,redirect_uri:redirect.href,code,...(env.KAKAO_CLIENT_SECRET?{client_secret:env.KAKAO_CLIENT_SECRET}:{})}).toString()});
      if(typeof tokens.access_token!=='string'||!tokens.access_token||tokens.access_token.length>4096)throw Error();
      const verified=await providerJson('https://kapi.kakao.com/v1/user/access_token_info',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
      if(!Number.isSafeInteger(verified.id)||verified.id<=0||String(verified.app_id)!==env.KAKAO_APP_ID||!Number.isFinite(verified.expires_in)||verified.expires_in<=0)throw Error();
      await database.prepare('UPDATE kakao_flows SET status=\'ready\',subject_hash=? WHERE id=?').run(subject(String(verified.id)),flow.id);
    }catch{await database.prepare('UPDATE kakao_flows SET status=\'failed\' WHERE id=?').run(flow.id);}
    const destination=isNativeOrigin(flow.origin)?`${nativeReturn}?flow=${flow.id}`:`${flow.origin}/#kakao/${flow.id}`;
    response.writeHead(303,{Location:destination,'Referrer-Policy':'no-referrer','Cache-Control':'no-store'});response.end();
  }
  async function complete(request,response,body){
    requireEnabled();await clean();
    if(typeof body.flowId!=='string'||! /^[a-f0-9]{64}$/.test(body.verifier??''))throw fault(400,'KAKAO_REQUEST','로그인 요청을 다시 시작해 주세요.');
    await rate(`kakao-complete:${request.socket.remoteAddress}`,30);
    return transaction(async()=>{
      const flow=await database.prepare('SELECT * FROM kakao_flows WHERE id=? AND expires_at>?').get(body.flowId,now());
      if(!flow||flow.challenge!==digest(body.verifier)||flow.origin!==request.headers.origin)throw fault(401,'KAKAO_STATE','로그인을 시작한 화면에서 다시 시도해 주세요.');
      if(flow.status!=='ready')throw fault(409,'KAKAO_INCOMPLETE',flow.status==='failed'?'카카오 로그인이 취소되었거나 확인에 실패했어요.':'아직 완료되지 않았거나 이미 사용한 요청이에요.');
      const linked=await database.prepare('SELECT users.* FROM kakao_identities JOIN users ON users.id=kakao_identities.user_id WHERE subject_hash=?').get(flow.subject_hash);
      let answer;
      if(flow.purpose==='login'){
        let user=linked;
        if(!user){user=await createUser();await database.prepare('INSERT INTO kakao_identities VALUES(?,?)').run(flow.subject_hash,user.id);}
        answer=await issueSession(user,request,response);
      }else{
        const current=await protect(request);
        if(current.id!==flow.session_id)throw fault(409,'SESSION_CHANGED','로그인 계정이 바뀌었어요. 처음부터 다시 연결해 주세요.');
        if(flow.purpose==='link'){
          const existing=await database.prepare('SELECT subject_hash FROM kakao_identities WHERE user_id=?').get(current.user_id);
          if((linked&&linked.id!==current.user_id)||(existing&&existing.subject_hash!==flow.subject_hash))throw fault(409,'KAKAO_ALREADY_LINKED','이미 다른 계정에 연결돼 있어요. 기록은 합치거나 덮어쓰지 않았어요.');
          await database.prepare('INSERT INTO kakao_identities VALUES(?,?) ON CONFLICT DO NOTHING').run(flow.subject_hash,current.user_id);answer={linked:true};
        }else{
          if(linked?.id!==current.user_id)throw fault(403,'KAKAO_ACCOUNT_MISMATCH','현재 계정에 연결된 카카오 계정으로 확인해 주세요.');
          await deleteUser(current.user_id);answer={deleted:true};
        }
      }
      await database.prepare('DELETE FROM kakao_flows WHERE id=?').run(flow.id);
      return answer;
    });
  }
  async function native(request,response,body){
    requireEnabled();
    if(!env.KAKAO_NATIVE_APP_KEY||!isNativeOrigin(request.headers.origin))throw fault(403,'KAKAO_NATIVE_DISABLED','안드로이드 카카오 로그인을 확인해 주세요.');
    if(!['login','link','delete'].includes(body.purpose)||typeof body.accessToken!=='string'||body.accessToken.length<10||body.accessToken.length>4096)throw fault(400,'KAKAO_REQUEST','카카오 로그인을 다시 시작해 주세요.');
    if(body.purpose==='login'&&(body.ageConfirmed!==true||body.consent!==true))throw fault(400,'KAKAO_CONSENT','만 14세 이상 확인과 계정 저장 동의가 필요해요.');
    if(body.purpose==='delete'&&body.confirm!==true)throw fault(400,'DELETE_CONFIRMATION_REQUIRED','계정과 모든 기록 삭제를 확인해 주세요.');
    await rate(`kakao-native:${request.socket.remoteAddress}`,20);
    const verified=await providerJson('https://kapi.kakao.com/v1/user/access_token_info',{headers:{Authorization:`Bearer ${body.accessToken}`}});
    if(!Number.isSafeInteger(verified.id)||verified.id<=0||String(verified.app_id)!==env.KAKAO_APP_ID||!Number.isFinite(verified.expires_in)||verified.expires_in<=0)throw fault(401,'KAKAO_INVALID','카카오 로그인 확인에 실패했어요.');
    return transaction(async()=>{
      const identity=subject(String(verified.id));
      const linked=await database.prepare('SELECT users.* FROM kakao_identities JOIN users ON users.id=kakao_identities.user_id WHERE subject_hash=?').get(identity);
      if(body.purpose==='login'){
        let user=linked;
        if(!user){user=await createUser();await database.prepare('INSERT INTO kakao_identities VALUES(?,?)').run(identity,user.id);}
        return issueSession(user,request,response);
      }
      const current=await protect(request);
      if(body.purpose==='delete'){
        if(linked?.id!==current.user_id)throw fault(403,'KAKAO_ACCOUNT_MISMATCH','현재 계정에 연결된 카카오 계정으로 확인해 주세요.');
        await deleteUser(current.user_id);return {deleted:true};
      }
      const existing=await database.prepare('SELECT subject_hash FROM kakao_identities WHERE user_id=?').get(current.user_id);
      if((linked&&linked.id!==current.user_id)||(existing&&existing.subject_hash!==identity))throw fault(409,'KAKAO_ALREADY_LINKED','이미 다른 계정에 연결돼 있어요.');
      await database.prepare('INSERT INTO kakao_identities VALUES(?,?) ON CONFLICT DO NOTHING').run(identity,current.user_id);
      return {linked:true};
    });
  }
  return {enabled,start,callback,complete,native};
}
