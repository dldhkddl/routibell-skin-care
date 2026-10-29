const nativeOrigins=new Set(['https://localhost','capacitor://localhost']);
const failure=()=>Object.assign(Error('허용되지 않은 앱 연결입니다.'),{status:403,code:'ORIGIN_DENIED'});
export function connectionOrigins(origins,env={}){
  const values=[...origins,...(env.APP_ALLOWED_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean),...(env.APP_PUBLIC_URL?[env.APP_PUBLIC_URL]:[])];
  for(const value of values){
    let parsed;try{parsed=new URL(value);}catch{throw Error('앱 허용 주소 형식을 확인해 주세요.');}
    if(nativeOrigins.has(value))continue;
    if(parsed.origin!==value||parsed.username||parsed.password||!(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname))))throw Error('앱 연결에는 HTTPS 주소 또는 로컬 개발 주소만 사용할 수 있습니다.');
  }
  return [...new Set(values)];
}
export const isNativeOrigin=origin=>nativeOrigins.has(origin);
export function createAccessPolicy(origins){
  const allowed=new Set(connectionOrigins(origins));
  const hosts=new Set([...allowed].filter(value=>!nativeOrigins.has(value)).map(value=>new URL(value).host));
  return function check(request,response,{methods=['GET','POST','PUT'],headers=['content-type','x-beauty-client','x-account-id','x-session-id','x-csrf-token','authorization','x-session-mode']}={}){
    if(!hosts.has(request.headers.host))throw failure();
    const origin=request.headers.origin;
    if(origin&&!allowed.has(origin))throw failure();
    if(!origin&&(request.method!=='GET'||request.headers['sec-fetch-site']==='cross-site'))throw failure();
    if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');if(!nativeOrigins.has(origin))response.setHeader('Access-Control-Allow-Credentials','true');}
    if(request.method==='OPTIONS'){
      const requested=(request.headers['access-control-request-headers']??'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
      if(!origin||!methods.includes(request.headers['access-control-request-method'])||requested.some(value=>!headers.includes(value)))throw failure();
      response.writeHead(204,{'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':headers.join(', ')});response.end();return false;
    }
    return true;
  };
}
