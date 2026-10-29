import { createHash } from 'node:crypto';

const failure=(code,message,status=409)=>Object.assign(Error(message),{code,status});
const requestPattern=/^[a-f0-9-]{16,80}$/i;

export function createEntitlementService({database,now=Date.now,monthlyLimit=2,trialDays=3,getCheckinDates=async()=>[],trialBypassAccountIds=[],dailyCap=10,totalCap=100,onCapThreshold=()=>{}}){
  if(!Number.isSafeInteger(monthlyLimit)||monthlyLimit<1||monthlyLimit>12)throw Error('월 분석 횟수 설정을 확인해 주세요.');
  if(![dailyCap,totalCap].every(value=>Number.isSafeInteger(value)&&value>=1&&value<=1_000_000))throw Error('전체 분석 상한 설정을 확인해 주세요.');
  const query=sql=>database.prepare(sql);
  const capacityId=(userId,requestId)=>createHash('sha256').update(`${userId}:${requestId}`).digest('hex');
  const dayStart=()=>Math.floor((now()+9*60*60*1000)/86_400_000)*86_400_000-9*60*60*1000;
  async function capacity(){
    const daily=await query("SELECT COUNT(*) AS total FROM analysis_capacity WHERE created_at>=? AND state<>'failed'").get(dayStart());
    const total=await query("SELECT COUNT(*) AS total FROM analysis_capacity WHERE state<>'failed'").get();
    return {daily:Number(daily.total),total:Number(total.total),dailyCap,totalCap,closedDaily:Number(daily.total)>=dailyCap,closedTotal:Number(total.total)>=totalCap};
  }
  const bypass=new Set(trialBypassAccountIds);
  const unspentPass=()=>"NOT EXISTS (SELECT 1 FROM analysis_requests WHERE analysis_requests.user_id=analysis_passes.user_id AND analysis_requests.slot='pass:' || analysis_passes.external_id AND analysis_requests.state IN ('receiving','running','success','uncertain'))";
  async function seed(userId){
    await query('INSERT INTO analysis_entitlements(user_id,legacy_free_used) SELECT users.id,COALESCE((SELECT used FROM photo_usage WHERE user_id=users.id),0) FROM users WHERE users.id=? ON CONFLICT DO NOTHING').run(userId);
  }
  async function access(userId){
    await database.ready();
    await seed(userId);
    const saved=await query('SELECT legacy_free_used FROM analysis_entitlements WHERE user_id=?').get(userId);
    if(!saved)throw failure('ACCOUNT_REQUIRED','로그인한 계정을 확인해 주세요.',401);
    const subscription=await query('SELECT provider,status,period_start,period_end,auto_renew FROM subscriptions WHERE user_id=?').get(userId);
    const active=subscription&&['active','canceled'].includes(subscription.status)&&subscription.period_start<=now()&&subscription.period_end>now();
    const periodStart=active?subscription.period_start:null;
    const paidUsed=active?await query("SELECT COUNT(*) AS total FROM analysis_requests WHERE user_id=? AND slot='paid' AND period_start=? AND state IN ('receiving','running','success','uncertain')").get(userId,periodStart):{total:0};
    const freeUsed=await query("SELECT COUNT(*) AS total FROM analysis_requests WHERE user_id=? AND slot='free' AND state IN ('receiving','running','success','uncertain')").get(userId);
    const passes=await query(`SELECT COUNT(*) AS total FROM analysis_passes WHERE user_id=? AND status='active' AND ${unspentPass()}`).get(userId);
    const completedDates=await getCheckinDates(userId);
    const today=new Date(now()+9*60*60*1000).toISOString().slice(0,10);
    const completedCheckinDays=new Set(completedDates.filter(date=>typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&date<=today)).size;
    const trialUnlocked=bypass.has(userId)||completedCheckinDays>=trialDays;
    const subscriptionRemaining=active?Math.max(0,monthlyLimit-Number(paidUsed.total)):0;
    const oneTimeRemaining=Number(passes.total);
    const freeTrialRemaining=Math.max(0,1-Number(freeUsed.total)-Number(saved.legacy_free_used));
    const source=subscriptionRemaining?'subscription':oneTimeRemaining?'pass':freeTrialRemaining&&trialUnlocked?'free':null;
    return {
      accountId:userId,tier:active?'subscription':oneTimeRemaining?'pass':'free',fullAnalysis:source==='subscription'||source==='pass',
      maxActions:source==='subscription'||source==='pass'?16:4,remaining:subscriptionRemaining+oneTimeRemaining+(trialUnlocked?freeTrialRemaining:0),monthlyLimit:active?monthlyLimit:null,
      periodStart,expiresAt:active?subscription.period_end:null,
      autoRenew:active?Boolean(subscription.auto_renew):false,
      subscriptionStatus:subscription?.status??'none',
      subscriptionRemaining,oneTimeRemaining,freeTrialRemaining,trialUnlocked,trialLocked:freeTrialRemaining>0&&!trialUnlocked,
      completedCheckinDays,trialRequiredDays:trialDays,nextAnalysisSource:source,
    };
  }
  async function reserve(userId,requestId,saveJob,isBusy,requiredActions=0){
    if(typeof requestId!=='string'||!requestPattern.test(requestId))throw failure('REQUEST_ID_REQUIRED','분석 요청을 다시 준비해 주세요.',400);
    if(!Number.isSafeInteger(requiredActions)||requiredActions<0||requiredActions>16)throw failure('SELECTION_DENIED','분석 항목 수를 확인해 주세요.',400);
    const reserved=await database.transaction(async()=>{
      const user=await query(`SELECT id FROM users WHERE id=?${database.kind==='postgres'?' FOR UPDATE':''}`).get(userId);
      if(!user)throw failure('ACCOUNT_REQUIRED','로그인한 계정을 확인해 주세요.',401);
      const existing=await query('SELECT state FROM analysis_requests WHERE user_id=? AND request_id=?').get(userId,requestId);
      if(existing)throw failure('ANALYSIS_USED','이미 받은 요청이에요. 결과를 다시 확인해 주세요.');
      if(await isBusy())throw failure('ANALYSIS_USED','진행 중인 분석을 먼저 확인해 주세요.');
      const available=await access(userId);
      if(available.remaining===0)throw available.tier==='subscription'
        ?failure('MONTHLY_LIMIT','이번 결제 기간의 분석 횟수를 모두 사용했어요.',429)
        :available.trialLocked?failure('TRIAL_LOCKED',`${trialDays}일 체크인을 마치면 무료 사진 분석이 열려요.`,403)
        :failure('UPGRADE_REQUIRED','무료 체험을 사용했어요. 이용권을 확인해 주세요.',402);
      if(requiredActions>available.maxActions)throw failure('SELECTION_DENIED','이 이용권에서 선택할 수 있는 항목 수를 확인해 주세요.',400);
      await query(`SELECT id FROM analysis_capacity_lock WHERE id=1${database.kind==='postgres'?' FOR UPDATE':''}`).get();
      const before=await capacity();
      if(before.closedTotal)throw failure('ANALYSIS_TOTAL_CAP','사진 분석이 잠시 마감됐어요. 다시 열리면 알려드릴게요.',429);
      if(before.closedDaily)throw failure('ANALYSIS_DAILY_CAP','오늘 분석은 마감됐어요. 내일 다시 열려요.',429);
      const pass=available.nextAnalysisSource==='pass'?await query(`SELECT external_id FROM analysis_passes WHERE user_id=? AND status='active' AND ${unspentPass()} ORDER BY purchased_at,external_id LIMIT 1`).get(userId):null;
      if(available.nextAnalysisSource==='pass'&&!pass)throw failure('ANALYSIS_USED','이용권 상태가 바뀌었어요. 다시 확인해 주세요.');
      await query('INSERT INTO analysis_requests(user_id,request_id,slot,period_start,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(userId,requestId,pass?`pass:${pass.external_id}`:available.nextAnalysisSource==='subscription'?'paid':'free',available.nextAnalysisSource==='subscription'?available.periodStart:null,'receiving',now(),now());
      await query('INSERT INTO analysis_capacity(request_id,created_at,state) VALUES(?,?,?)').run(capacityId(userId,requestId),now(),'receiving');
      await saveJob();
      return {available,thresholdReached:(before.daily+1)>=Math.ceil(dailyCap*.8)||(before.total+1)>=Math.ceil(totalCap*.8)};
    });
    if(reserved.thresholdReached)void Promise.resolve().then(onCapThreshold).catch(()=>{});
    return reserved.available;
  }
  async function transition(userId,requestId,state,saveJob){
    if(!['running','success','failed','uncertain'].includes(state))throw failure('INVALID_STATE','분석 상태를 확인해 주세요.');
    return database.transaction(async()=>{
      const changed=await query("UPDATE analysis_requests SET state=?,updated_at=? WHERE user_id=? AND request_id=? AND state IN ('receiving','running')")
        .run(state,now(),userId,requestId);
      if(changed.changes!==1)throw failure('INVALID_STATE','분석 상태를 다시 확인해 주세요.');
      await query('UPDATE analysis_capacity SET state=? WHERE request_id=?').run(state,capacityId(userId,requestId));
      await saveJob();
    });
  }
  return {access,reserve,transition,capacity,monthlyLimit};
}
