import { Capacitor, registerPlugin } from '@capacitor/core';

const secureSession=registerPlugin('SecureSession');
export function createConnection({native=Capacitor.isNativePlatform(),base=import.meta.env?.VITE_API_BASE_URL??''}={}){
  const address=base.trim().replace(/\/$/,'');
  if(address){
    let parsed;try{parsed=new URL(address);}catch{throw Error('서버 주소 설정을 확인해 주세요.');}
    if(parsed.origin!==address||parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('서버에는 HTTPS 주소만 설정할 수 있어요.');
  }
  return {native,url(path){if(native&&!address)throw Error('앱의 서버 주소가 아직 설정되지 않았어요.');return `${native?address:''}${path}`;}};
}
export const nativeSessionStore={
  async get(){return (await secureSession.read()).value??'';},
  async set(value){await secureSession.write({value});},
  async remove(){await secureSession.clear();},
};
