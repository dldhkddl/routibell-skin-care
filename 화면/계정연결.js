import { validateData } from './계산.js';
import { createConnection, nativeSessionStore } from './연결설정.js';

const issue=(code,message)=>Object.assign(Error(message),{code,name:code==='DATA_CONFLICT'?'DataConflict':'AccountError'});
export function createAccountClient({fetchImpl=(...args)=>fetch(...args),onLost=()=>{},connection=createConnection(),tokenStore=nativeSessionStore}={}){
  let session=null,revision=null,snapshot=null,generation=0,ticket=null;
  let accessToken='',restored=false,storage=Promise.resolve();
  const store=operation=>{storage=storage.catch(()=>{}).then(operation);return storage;};
  const identity=()=>session?`${session.user.id}:${session.sessionId}`:null;
  function clear(){session=null;revision=null;snapshot=null;ticket=null;accessToken='';generation++;if(connection.native)void store(()=>tokenStore.remove()).catch(()=>{});}
  async function request(path,{method='GET',body,bound=false}={}){
    const stamp=generation;
    if(bound&&!session)throw issue('AUTH_REQUIRED','먼저 로그인해 주세요.');
    let response;
    try{
      response=await fetchImpl(connection.url(`/api/account/${path}`),{method,credentials:connection.native?'omit':'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'X-Beauty-Client':'account-v1',...(connection.native?{'X-Session-Mode':'token',...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})}:{}),...(method!=='GET'?{'Content-Type':'application/json'}:{}),...(bound?{'X-Account-ID':session.user.id,'X-Session-ID':session.sessionId,'X-CSRF-Token':session.csrfToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    }catch{throw issue('NETWORK','연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요. 저장 여부는 다시 연결한 뒤 확인해 주세요.');}
    if(stamp!==generation)throw issue('SESSION_CHANGED','로그인 상태가 바뀌어 이전 요청을 반영하지 않았어요.');
    let payload;try{payload=await response.json();}catch{throw issue('SERVER_UNAVAILABLE','지금은 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');}
    if(stamp!==generation)throw issue('SESSION_CHANGED','이전 로그인 요청의 응답을 반영하지 않았어요.');
    if(!response.ok){
      const failure=issue(payload.error?.code??'SERVER_ERROR',payload.error?.message??'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      if(bound&&['AUTH_REQUIRED','SESSION_CHANGED'].includes(failure.code)){clear();onLost(failure);}
      throw failure;
    }
    return payload;
  }
  async function acceptSession(value){
    const stamp=generation;
    if(!value.user){clear();return null;}
    if(typeof value.user.id!=='string'||typeof value.user.username!=='string'||typeof value.sessionId!=='string'||typeof value.csrfToken!=='string')throw issue('BAD_RESPONSE','로그인 응답을 확인하지 못했어요.');
    if(connection.native&&value.accessToken){
      if(!/^[a-f0-9]{64}$/.test(value.accessToken))throw issue('BAD_RESPONSE','로그인 응답을 확인하지 못했어요.');
      accessToken=value.accessToken;
      try{await store(()=>tokenStore.set(value.accessToken));}catch{clear();throw issue('SESSION_STORAGE','안전한 로그인 저장에 실패했어요. 다시 로그인해 주세요.');}
    }
    if(stamp!==generation)throw issue('SESSION_CHANGED','이전 로그인 요청의 응답을 반영하지 않았어요.');
    session={user:value.user,sessionId:value.sessionId,csrfToken:value.csrfToken,expiresAt:value.expiresAt};return session.user;
  }
  function acceptDocument(value){
    if(!session||value.userId!==session.user.id||!Number.isSafeInteger(value.revision)||value.revision<0)throw issue('BAD_RESPONSE','계정 기록의 소유자를 확인하지 못했어요.');
    const data=validateData(value.data);revision=value.revision;snapshot=JSON.stringify(data);return data;
  }
  return {
    async kakaoConfig(){return request('kakao-config');},
    async kakaoNative(body){
      const value=await request('kakao-native',{method:'POST',body,bound:body.purpose!=='login'});
      if(value.user){clear();await acceptSession(value);}
      if(value.deleted)clear();
      return value;
    },
    async kakaoStart(body){return request('kakao-start',{method:'POST',body,bound:body.purpose!=='login'});},
    async kakaoComplete(body,purpose){
      const value=await request('kakao-complete',{method:'POST',body,bound:purpose!=='login'});
      if(value.user){clear();await acceptSession(value);}
      if(value.deleted)clear();
      return value;
    },
    state:()=>({user:session?.user??null,identity:identity(),revision}),
    clear,
    async refresh(){
      if(connection.native&&!restored){
        restored=true;const stamp=generation;
        let saved;try{saved=await store(()=>tokenStore.get());}catch{throw issue('SESSION_STORAGE','로그인 정보를 안전하게 불러오지 못했어요.');}
        if(stamp!==generation)throw issue('SESSION_CHANGED','로그인 상태가 바뀌었어요.');
        accessToken=typeof saved==='string'&&/^[a-f0-9]{64}$/.test(saved)?saved:'';
      }
      const before=identity(),value=await request('session');
      const after=value.user?`${value.user.id}:${value.sessionId}`:null;
      if(before&&before!==after){clear();const failure=issue('SESSION_CHANGED','다른 창에서 로그인 상태가 바뀌었어요.');onLost(failure);throw failure;}
      return acceptSession(value);
    },
    async authenticate(mode,body){
      if(!['login','register','recover'].includes(mode))throw issue('INVALID_ACTION','로그인 방식을 확인해 주세요.');
      const value=await request(mode,{method:'POST',body});clear();
      if(mode!=='recover')await acceptSession(value);
      return {user:session?.user??null,recoveryCode:value.recoveryCode??null};
    },
    async read(){return acceptDocument(await request('data',{bound:true}));},
    async subscription(){return request('subscription',{bound:true});},
    async paymentInterest(product){return request('payment-interest',{method:'POST',body:{product},bound:true});},
    async subscriptionAction(action,body={}){
      if(!['purchase','cancel','restore'].includes(action))throw issue('INVALID_ACTION','이용권 요청을 확인해 주세요.');
      return request(`subscription-${action}`,{method:'POST',body,bound:true});
    },
    async photoConnection(){
      const value=await request('photo-connection',{bound:true});
      if(value.path==='/api/youcam')return {path:value.path};
      throw issue('PHOTO_UNAVAILABLE','사진 분석 연결을 업데이트한 뒤 다시 열어 주세요.');
    },
    async write(data,expected){
      if(revision===null||!session)throw issue('AUTH_REQUIRED','계정 기록을 먼저 불러와 주세요.');
      if(expected!==undefined&&JSON.stringify(validateData(expected))!==snapshot)throw issue('DATA_CONFLICT','현재 기록이 바뀌었어요. 다시 확인한 뒤 저장해 주세요.');
      return acceptDocument(await request('data',{method:'PUT',bound:true,body:{revision,data:validateData(data)}}));
    },
    async importLegacy(data,{consent,backupConfirmed}){
      if(revision!==0)throw issue('IMPORT_NOT_EMPTY','기록이 없는 새 계정에서만 이전할 수 있어요.');
      return acceptDocument(await request('import',{method:'PUT',bound:true,body:{data:validateData(data),revision,consent,backupConfirmed}}));
    },
    async logout(){await request('logout',{method:'POST',bound:true,body:{}});clear();},
    async deleteAccount(password){await request('delete',{method:'POST',bound:true,body:{password,confirm:true}});clear();},
    async photoFetch(address,options){
      if(!/^\/api\/youcam\/(status|analysis\/(result|quote|start|clear))$/.test(address))throw issue('INVALID_PHOTO_SERVER','사진 분석 연결을 확인하지 못했어요.');
      const stamp=generation;
      if(!ticket||ticket.expiresAt<Date.now()+15_000)ticket=await request('photo-ticket',{method:'POST',bound:true,body:{}});
      if(!session||stamp!==generation)throw issue('SESSION_CHANGED','로그인 상태를 다시 확인해 주세요.');
      const response=await fetchImpl(connection.url(address),{...options,credentials:connection.native?'omit':options?.credentials,headers:{...options?.headers,'X-Photo-Account':ticket.ticket}});
      if(stamp!==generation)throw issue('SESSION_CHANGED','이전 계정의 사진 결과는 표시하지 않아요.');
      return response;
    },
  };
}
