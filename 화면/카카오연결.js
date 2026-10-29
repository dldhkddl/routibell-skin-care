import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

const pendingKey='account-kakao-flow';
const nativeKakao=registerPlugin('KakaoNative');
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
export function createKakaoFlow({client,onComplete,onError}){
  let completing=false;
  async function complete(address){
    let flowId;
    try{
      const parsed=new URL(address);
      if(Capacitor.isNativePlatform()){
        if(parsed.protocol!=='com.dldhkddl.skincare:'||parsed.hostname!=='kakao'||parsed.pathname!=='')return false;
        flowId=parsed.searchParams.get('flow');
      }else{
        if(parsed.origin!==location.origin)return false;
        flowId=parsed.hash.match(/^#kakao\/([a-f0-9-]{36})$/)?.[1];
      }
    }catch{return false;}
    if(!flowId||completing)return false;
    completing=true;
    try{
      const pending=JSON.parse(sessionStorage.getItem(pendingKey)??'null');
      if(!pending||pending.flowId!==flowId||Date.now()-pending.createdAt>10*60*1000)throw Error('카카오 로그인을 시작한 화면에서 다시 시도해 주세요.');
      if(pending.purpose!=='login')await client.refresh();
      const result=await client.kakaoComplete({flowId,verifier:pending.verifier},pending.purpose);
      sessionStorage.removeItem(pendingKey);
      if(!Capacitor.isNativePlatform())history.replaceState(null,'',result.deleted?'#login':pending.purpose==='link'?'#settings':'#home');
      await onComplete(result);
    }catch(failure){sessionStorage.removeItem(pendingKey);if(!Capacitor.isNativePlatform())history.replaceState(null,'','#login');onError(failure.message);}
    finally{completing=false;}
    return true;
  }
  return {
    async start(purpose,consent={}){
      if(Capacitor.isNativePlatform()&&(await client.kakaoConfig()).nativeEnabled){
        if(purpose!=='login')await client.refresh();
        const {accessToken}=await nativeKakao.login();
        try{const result=await client.kakaoNative({purpose,accessToken,...consent});await onComplete(result);}catch(issue){onError(issue.message);}
        return;
      }
      const verifier=hex(crypto.getRandomValues(new Uint8Array(32)));
      const challenge=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      const flow=await client.kakaoStart({purpose,challenge,...consent});
      const address=new URL(flow.authorizeUrl);
      if(address.origin!=='https://kauth.kakao.com'||address.pathname!=='/oauth/authorize')throw Error('카카오 연결 주소를 확인하지 못했어요.');
      sessionStorage.setItem(pendingKey,JSON.stringify({flowId:flow.flowId,verifier,purpose,createdAt:Date.now()}));
      if(Capacitor.isNativePlatform())await Browser.open({url:address.href});
      else location.assign(address.href);
    },
    async initialize(){
      if(Capacitor.isNativePlatform()){
        await App.addListener('appUrlOpen',({url})=>{void complete(url);});
        const launch=await App.getLaunchUrl();if(launch?.url)await complete(launch.url);
      }else await complete(location.href);
    },
  };
}
