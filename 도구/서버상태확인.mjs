import { checkServerHealth, createOperationalAlerts } from '../서버/운영알림.js';
import { readServerEnvironment } from '../서버/환경설정.js';

const env=readServerEnvironment();
const alerts=createOperationalAlerts({env});
try{
  if(!await checkServerHealth({env,alerts}))process.exitCode=1;
}catch{
  console.error('서버 상태 점검 설정을 확인해 주세요.');
  process.exitCode=1;
}finally{alerts.close();}
