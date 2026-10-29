import { APP } from '../앱설정.js';

const labels={
  server:'서버 요청 처리 오류',
  'server-down':'서버 상태 확인 실패',
  analysis:'사진 분석 실패 또는 완료 미확인',
  database:'계정 DB 연결 오류',
  credit:'유캠 잔액 부족',
  'credit-check':'유캠 잔액 확인 실패',
  'analysis-cap-80':'사진 분석 전체 상한 80% 도달',
};

export function createOperationalAlerts({env={},fetchImpl=fetch,now=Date.now}={}){
  const address=env.ALERT_WEBHOOK_URL??'';
  let webhook=null;
  if(address){
    try{webhook=new URL(address);}catch{throw Error('알림 웹훅 주소 형식을 확인해 주세요.');}
    if(webhook.protocol!=='https:'||webhook.username||webhook.password||webhook.hash)throw Error('알림 웹훅은 HTTPS 주소만 사용할 수 있어요.');
  }
  const threshold=env.YOUCAM_LOW_CREDIT_THRESHOLD===undefined?null:Number(env.YOUCAM_LOW_CREDIT_THRESHOLD);
  if(threshold!==null&&(!Number.isFinite(threshold)||threshold<0||threshold>1_000_000))throw Error('유캠 잔액 알림 기준을 확인해 주세요.');
  const last=new Map();
  let timer=null,closed=false;
  async function notify(kind){
    if(!webhook||!Object.hasOwn(labels,kind)||closed)return false;
    if(now()-(last.get(kind)??-Infinity)<10*60*1000)return false;
    last.set(kind,now());
    const message=`[${APP.name}] ${labels[kind]} · ${new Date(now()).toISOString()}`;
    try{
      const response=await fetchImpl(webhook.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({text:message,content:message})});
      await response.body?.cancel();
      if(!response.ok)throw Error('WEBHOOK_FAILED');
      return true;
    }catch{console.warn('운영 알림 전송 실패: 웹훅 설정을 확인해 주세요.');return false;}
  }
  async function checkCredits(){
    if(!webhook||threshold===null||!env.YOUCAM_API_KEY||closed)return null;
    try{
      const response=await fetchImpl('https://yce-api-01.makeupar.com/s2s/v1.0/client/credit',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.YOUCAM_API_KEY}`,Accept:'application/json'}});
      if(!response.ok){await response.body?.cancel();throw Error('CREDIT_RESPONSE');}
      const payload=await response.json();
      if(payload?.status!==200||!Array.isArray(payload.results)||payload.results.some(item=>!Number.isFinite(item?.amount)||item.amount<0||!Number.isFinite(item?.expiry)))throw Error('CREDIT_FORMAT');
      const amount=payload.results.filter(item=>item.expiry>now()).reduce((sum,item)=>sum+item.amount,0);
      if(amount<=threshold)await notify('credit');
      return amount;
    }catch{await notify('credit-check');return null;}
  }
  function schedule(){
    if(!webhook||threshold===null||!env.YOUCAM_API_KEY)return;
    const tick=async()=>{
      if(closed)return;
      await checkCredits();
      if(!closed){timer=setTimeout(tick,6*60*60*1000);timer.unref?.();}
    };
    timer=setTimeout(tick,5*60*1000);
    timer.unref?.();
  }
  return {notify,checkCredits,schedule,close(){closed=true;clearTimeout(timer);}};
}

export async function checkServerHealth({env={},fetchImpl=fetch,alerts=createOperationalAlerts({env,fetchImpl})}={}){
  let address;
  try{address=new URL('/api/health',env.APP_PUBLIC_URL);}
  catch{throw Error('공개 서버 주소를 먼저 설정해 주세요.');}
  if(address.protocol!=='https:'||address.username||address.password)throw Error('상태 점검은 HTTPS 공개 서버만 확인할 수 있어요.');
  try{
    const response=await fetchImpl(address.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
    if(!response.ok){await response.body?.cancel();throw Error('HEALTH_RESPONSE');}
    const result=await response.json();
    if(result?.ok!==true)throw Error('HEALTH_FORMAT');
    return true;
  }catch{await alerts.notify('server-down');return false;}
}
