import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const serverKeys=['YOUCAM_API_KEY','YOUCAM_ALLOW_LOOKUP','YOUCAM_ALLOW_ANALYSIS'];
const optionalKeys=['APP_PUBLIC_URL','APP_ALLOWED_ORIGINS','KAKAO_REST_API_KEY','KAKAO_CLIENT_SECRET','KAKAO_REDIRECT_URI','KAKAO_APP_ID','KAKAO_NATIVE_APP_KEY','DATABASE_URL','ACCOUNT_ENCRYPTION_KEY','DATABASE_CA_CERT_PATH','SUBSCRIPTION_MONTHLY_ANALYSES','SUBSCRIPTION_PRICE_KRW','ANALYSIS_PASS_PRODUCT_ID','ANALYSIS_PASS_PRICE_KRW','FREE_TRIAL_CHECKIN_DAYS','FREE_TRIAL_BYPASS_ACCOUNT_IDS','PAYMENTS_ENABLED','ANALYSIS_DAILY_CAP','ANALYSIS_TOTAL_CAP','ALERT_WEBHOOK_URL','YOUCAM_LOW_CREDIT_THRESHOLD','REVENUECAT_API_KEY','REVENUECAT_WEBHOOK_SECRET'];

export function readServerEnvironment({root=process.cwd(),mode='development',env=process.env}={}){
  let values={};
  for(const name of ['.env','.env.local',`.env.${mode}`,`.env.${mode}.local`]){
    try{values={...values,...parseEnv(readFileSync(join(root,name),'utf8'))};}
    catch(issue){if(issue.code!=='ENOENT')throw Error('서버 환경 설정 파일을 읽지 못했습니다. 파일 형식과 읽기 권한을 확인해 주세요.');}
  }
  values={...values,...env};
  if(Object.keys(values).some(name=>name.startsWith('VITE_YOUCAM_')))throw Error('유캠 설정에는 VITE_ 접두사를 사용하지 마세요. 서버 전용 YOUCAM_ 이름으로 설정해 주세요.');
  if(Object.keys(values).some(name=>name.startsWith('VITE_KAKAO_')))throw Error('카카오 키는 서버 전용 KAKAO_ 이름으로 설정해 주세요.');
  if(Object.keys(values).some(name=>name.startsWith('VITE_DATABASE_')||name.startsWith('VITE_ACCOUNT_ENCRYPTION_')))throw Error('계정 DB와 저장키는 서버 전용 환경변수로 설정해 주세요.');
  return Object.fromEntries([...serverKeys,...optionalKeys.filter(name=>values[name]!==undefined)].map(name=>[name,values[name]??'']));
}

export function isPrivateServerPath(address){
  let path;
  try{path=decodeURIComponent(address??'');}catch{return true;}
  return /(?:^|[\\/])\.env[^\\/]*|(?:^|[\\/])\.git(?:[\\/]|$|\?)|\.계정자료|\.검증자료|(?:^|[\\/])보관[\\/]제품사진|저장키|\.sqlite(?:-|$|\?)/i.test(path);
}
