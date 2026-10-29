import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalAlerts, checkServerHealth } from '../서버/운영알림.js';

const at=Date.parse('2026-09-29T10:00:00Z');
const env={ALERT_WEBHOOK_URL:'https://hooks.example.com/secret-path',YOUCAM_API_KEY:'fake-test-key',YOUCAM_LOW_CREDIT_THRESHOLD:'32'};

test('서버·분석 실패 알림은 개인정보 없이 보내고 같은 종류는 반복 전송하지 않는다',async()=>{
  const calls=[],alerts=createOperationalAlerts({env,now:()=>at,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({ok:true});}});
  assert.equal(await alerts.notify('server'),true);
  assert.equal(await alerts.notify('server'),false);
  assert.equal(await alerts.notify('analysis'),true);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.options.method,'POST');
    assert.doesNotMatch(call.options.body,/fake-test-key|secret-path|사진 원본|accountId/);
  }
  alerts.close();
});

test('유캠 잔액 조회는 무료 GET만 쓰고 만료된 유닛을 제외해 기준 이하일 때 알린다',async()=>{
  const calls=[],alerts=createOperationalAlerts({env,now:()=>at,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/client/credit'))return Response.json({status:200,results:[{amount:20,expiry:at+10000},{amount:100,expiry:at-1000}]});
    return Response.json({ok:true});
  }});
  assert.equal(await alerts.checkCredits(),20);
  assert.deepEqual(calls.map(call=>call.options.method),['GET','POST']);
  assert.equal(calls[0].url,'https://yce-api-01.makeupar.com/s2s/v1.0/client/credit');
  assert.match(calls[1].options.body,/잔액 부족/);
  alerts.close();
});

test('설정이 없으면 조회하지 않고 잘못된 응답도 잔액 0으로 단정하지 않는다',async()=>{
  let calls=0;
  const disabled=createOperationalAlerts({env:{},fetchImpl:async()=>{calls++;throw Error('외부 호출 금지');}});
  assert.equal(await disabled.checkCredits(),null);
  assert.equal(calls,0);
  const alerts=createOperationalAlerts({env,now:()=>at,fetchImpl:async url=>{
    calls++;
    return url.includes('/client/credit')?Response.json({status:200,results:[{amount:'?'}]}):Response.json({ok:true});
  }});
  assert.equal(await alerts.checkCredits(),null);
  assert.equal(calls,2);
  alerts.close();
});

test('별도 상태 점검은 공개 HTTPS 서버를 읽고 다운 시 웹훅만 보낸다',async()=>{
  const events=[];
  const configured={...env,APP_PUBLIC_URL:'https://app.example.com'};
  const fetchImpl=async(url,options)=>{
    events.push({url,method:options.method});
    return url.endsWith('/api/health')?Response.json({ok:false},{status:503}):Response.json({ok:true});
  };
  const alerts=createOperationalAlerts({env:configured,fetchImpl,now:()=>at});
  assert.equal(await checkServerHealth({env:configured,fetchImpl,alerts}),false);
  assert.deepEqual(events.map(event=>event.method),['GET','POST']);
  assert.equal(events[0].url,'https://app.example.com/api/health');
  assert.equal(await checkServerHealth({env:{...configured,APP_PUBLIC_URL:'http://localhost:4173'},fetchImpl,alerts}).catch(()=>false),false);
  assert.equal(events.length,2);
  alerts.close();
});

test('정상 상태 점검은 알림을 보내지 않는다',async()=>{
  const events=[];
  const configured={...env,APP_PUBLIC_URL:'https://app.example.com'};
  const alerts=createOperationalAlerts({env:configured,fetchImpl:async(url,options)=>{events.push(options.method);return Response.json({ok:true});}});
  assert.equal(await checkServerHealth({env:configured,fetchImpl:async(url,options)=>{events.push(options.method);return Response.json({ok:true});},alerts}),true);
  assert.deepEqual(events,['GET']);
  alerts.close();
});
