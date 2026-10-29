import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createAccountService } from '../서버/계정서버.js';
import { createAccountStore } from '../서버/계정저장소.js';
import { readServerEnvironment } from '../서버/환경설정.js';
import { createAnalysisSession, PHOTO_CONSENT } from '../서버/유캠분석.js';

const verificationKey='local-verification-only-no-real-key';
const storage='https://yce-us.s3-accelerate.amazonaws.com';
const actions=['redness','pore','texture'];
const photo=()=>{
  const bytes=Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.write('IHDR',12);bytes.writeUInt32BE(640,16);bytes.writeUInt32BE(800,20);
  return bytes;
};
function fakeProvider(){
  let created=0;
  return {
    created:()=>created,
    async fetch(address,options={}){
      const url=new URL(address);
      if(url.pathname.endsWith('feature-cost'))return Response.json({status:200,result:{skus:[{description:'AI Skin Analysis V2.1 SD (1-4 concerns)',amount:9,unit:'result_image',proc_unit:1,run_task_url:'https://yce-api-01.makeupar.com/s2s/v2.1/task/skin-analysis'}],next_token:null}});
      if(url.pathname==='/s2s/v2.0/file'){
        const file=JSON.parse(options.body).files[0];
        return Response.json({status:200,data:{files:[{file_id:'verification-file',requests:[{method:'PUT',url:`${storage}/verification/upload`,headers:{'Content-Type':file.content_type,'Content-Length':String(file.file_size)}}]}]}});
      }
      if(url.hostname==='yce-us.s3-accelerate.amazonaws.com'&&options.method==='PUT')return new Response(null,{status:200});
      if(url.pathname==='/s2s/v2.1/task/skin-analysis'&&options.method==='POST'){created++;return Response.json({status:200,data:{task_id:'verification-task'}});}
      if(url.pathname==='/s2s/v2.1/task/skin-analysis/verification-task')return Response.json({status:200,data:{task_status:'success',error:null,results:{output:actions.map((type,index)=>({type,raw_score:[80,60,70][index],mask_urls:[`${storage}/verification/${type}.jpg`]}))}}});
      if(url.pathname==='/s2s/v2.0/task/delete')return Response.json({status:200});
      if(url.hostname==='yce-us.s3-accelerate.amazonaws.com')return new Response(Buffer.from([0xff,0xd8,0xff,0xd9]),{status:200,headers:{'Content-Type':'image/jpeg'}});
      throw Error('모의 공급자가 예상하지 못한 요청입니다.');
    },
  };
}

export async function verifyConcurrentAccounts({env=readServerEnvironment()}={}){
  if(!env.DATABASE_URL||!env.ACCOUNT_ENCRYPTION_KEY)throw Error('DB 주소와 저장키 설정이 필요합니다.');
  const usernames=[randomBytes(8).toString('hex'),randomBytes(8).toString('hex')].map(value=>`verification_${value}`);
  const password=randomBytes(24).toString('hex');
  const userIds=[];
  let attemptedRegistration=false;
  let account;
  const server=createServer((request,response)=>account.handle(request,response));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const mock=fakeProvider();
  try{
    account=createAccountService({env,origins:[origin]});
    for(const username of usernames){
      attemptedRegistration=true;
      const response=await fetch(`${origin}/api/account/register`,{method:'POST',headers:{Origin:origin,'X-Beauty-Client':'account-v1','Content-Type':'application/json'},body:JSON.stringify({username,password,consent:true,ageConfirmed:true})});
      if(response.status!==201){
        const code=(await response.json().catch(()=>({})))?.error?.code??'UNKNOWN';
        throw Error(`검증용 계정 생성 실패 (${response.status} / ${code})`);
      }
      userIds.push((await response.json()).user.id);
    }
    const sessions=userIds.map(userId=>createAnalysisSession({apiKey:verificationKey,enabled:true,fetchImpl:mock.fetch, sleep:async()=>{},stateStore:account.photoState(userId)}));
    const quotes=await Promise.all(sessions.map(session=>session.quote(actions)));
    await Promise.all(sessions.map((session,index)=>session.reserve(quotes[index].id,PHOTO_CONSENT,PHOTO_CONSENT)));
    try{await account.photoState(userIds[0]).reserve();throw Error('중복 분석 요청이 허용됐습니다.');}
    catch(issue){if(issue.code!=='ANALYSIS_USED')throw issue;}
    await Promise.all(sessions.map(session=>session.start(photo(),'image/png')));
    for(const session of sessions){
      let completed=false;
      for(let attempt=0;attempt<100;attempt++){
        const state=await session.status();
        if(state.job?.state==='failed')throw Error('모의 분석이 실패했습니다.');
        if(state.job?.state==='success'){completed=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      if(!completed)throw Error('모의 분석 완료 상태를 확인하지 못했습니다.');
    }
    if(mock.created()!==2)throw Error('두 계정의 분석 요청 수가 다릅니다.');
    await account.close();account=null;
    const restarted=createAccountService({env,origins:[origin]});
    account=restarted;
    try{
      for(const [index,userId] of userIds.entries()){
        const state=await restarted.photoState(userId).get();
        if(!state.used||state.job?.state!=='success')throw Error('재시작 후 계정별 결과가 유지되지 않았습니다.');
        const login=await fetch(`${origin}/api/account/login`,{method:'POST',headers:{Origin:origin,'X-Beauty-Client':'account-v1','Content-Type':'application/json'},body:JSON.stringify({username:usernames[index],password})});
        if(login.status!==200)throw Error('재시작 후 계정 로그인을 확인하지 못했습니다.');
        const session=await login.json();
        const cookie=login.headers.get('set-cookie')?.split(';')[0];
        const document=await fetch(`${origin}/api/account/data`,{headers:{Origin:origin,Cookie:cookie,'X-Account-Id':userId,'X-Session-Id':session.sessionId}});
        if(document.status!==200||(await document.json()).userId!==userId)throw Error('재시작 후 계정별 기록을 읽지 못했습니다.');
      }
    }finally{await restarted.close();account=null;}
    return {accounts:2,requests:mock.created()};
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    if(account)await account.close();
    if(attemptedRegistration){
      const store=createAccountStore({databaseUrl:env.DATABASE_URL,caPath:env.DATABASE_CA_CERT_PATH});
      try{
        await store.ready();
        for(const username of usernames)await store.prepare('DELETE FROM users WHERE username=?').run(username);
      }finally{await store.close();}
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await verifyConcurrentAccounts();
    console.log(`모의 분석 ${result.requests}건, 계정 ${result.accounts}개 동시 처리·중복 차단·재시작 후 로그인과 기록 복원 확인 완료. 실제 유캠 호출 없음.`);
  }catch{
    console.error('계정 동시 분석·재시작 검증을 완료하지 못했습니다. 설정과 DB 상태를 확인해 주세요. 실제 유캠 호출은 하지 않았습니다.');
    process.exitCode=1;
  }
}
