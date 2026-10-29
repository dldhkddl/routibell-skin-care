import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderSchedule, createReminderService, validateReminder, REMINDER_KIND } from '../화면/체크인알림.js';

const snapshot=(extra={})=>({accountId:'account-one',identity:'account-one:session',profile:true,completedDates:[],...extra});
function harness(options={}) {
  const store=new Map(),calls=[],listeners=new Map();
  let pending=[],delivered=[],permission='prompt',requests=0,taps=0,clock=new Date(2026,8,28,10);
  const notifications={
    async getPending(){return {notifications:[...pending]};},
    async getDeliveredNotifications(){return {notifications:[...delivered]};},
    async cancel({notifications}){if(options.cancelFail?.())throw Error('cancel');const ids=notifications.map(item=>item.id);pending=pending.filter(item=>!ids.includes(item.id));calls.push(['cancel',ids]);},
    async removeDeliveredNotifications({notifications}){const ids=notifications.map(item=>item.id);delivered=delivered.filter(item=>!ids.includes(item.id));},
    async checkPermissions(){return {display:permission};},
    async requestPermissions(){requests++;if(options.permissionWait)await options.permissionWait();permission=options.deny?'denied':'granted';return {display:permission};},
    async createChannel(channel){calls.push(['channel',channel]);},
    async schedule({notifications}){if(options.scheduleFail?.())throw Error('schedule');pending=structuredClone(notifications);calls.push(['schedule',notifications]);return {notifications:notifications.map(({id})=>({id}))};},
    async addListener(name,callback){listeners.set(name,callback);return {remove(){listeners.delete(name);}};}
  };
  const storage={async get({key}){return {value:store.get(key)??null};},async set({key,value}){if(options.storageFail?.())throw Error('storage');store.set(key,value);}};
  const service=createReminderService({native:options.native??true,notifications,storage,now:()=>clock,onTap:()=>{taps++;}});
  return {service,store,calls,notifications,storage,listeners,requests:()=>requests,taps:()=>taps,pending:()=>pending,setPending:value=>{pending=value;},setDelivered:value=>{delivered=value;},delivered:()=>delivered,setPermission:value=>{permission=value;},setClock:value=>{clock=value;}};
}

test('알림은 로컬 달력의 30일·하루 1회이며 지난 시간·완료한 날을 제외한다',()=>{
  const list=reminderSchedule({accountId:'one',time:'20:30',completedDates:['2026-09-28'],now:new Date(2026,8,28,10)});
  assert.equal(list.length,29);assert.equal(new Set(list.map(item=>item.id)).size,29);
  assert.equal(list[0].extra.date,'2026-09-29');assert.equal(list[0].schedule.at.getHours(),20);assert.equal(list[0].schedule.at.getMinutes(),30);
  assert.ok(list.every(item=>item.isExactNotification===false&&!item.schedule.repeats&&item.extra.kind===REMINDER_KIND));
  assert.equal(reminderSchedule({accountId:'one',time:'09:00',now:new Date(2026,8,28,10)}).length,29);
  const boundary=reminderSchedule({accountId:'one',time:'20:00',now:new Date(2028,1,28,10)});
  assert.equal(boundary[1].extra.date,'2028-02-29');assert.equal(boundary[2].extra.date,'2028-03-01');
  for(const time of ['25:00','12:60','9:00','<script>'])assert.throws(()=>validateReminder({enabled:true,time}));
});

test('아침·저녁을 직접 선택하면 집중 항목별 팁을 각 시간에 한 번씩 예약한다',()=>{
  const list=reminderSchedule({accountId:'one',morningEnabled:true,eveningEnabled:true,morningTime:'08:00',eveningTime:'20:00',focusType:'age_spot',now:new Date(2026,8,28,7)});
  assert.equal(list.length,60);
  assert.equal(new Set(list.map(item=>item.id)).size,60);
  assert.match(list[0].body,/선크림/);
  assert.match(list[1].body,/세안/);
  assert.equal(list[0].extra.period,'morning');
  assert.equal(list[1].extra.period,'evening');
  assert.equal(reminderSchedule({accountId:'one',time:'20:00',now:new Date(2026,8,28,7)}).length,30);
  assert.throws(()=>validateReminder({enabled:true,morningEnabled:false,eveningEnabled:false,morningTime:'08:00',eveningTime:'20:00'}));
});

test('자동 시작·브라우저에서는 권한을 요청하지 않고 사용자가 켜야 예약한다',async()=>{
  const check=harness();await check.service.initialize();await check.service.sync(snapshot());
  assert.equal(check.requests(),0);assert.equal(check.pending().length,0);
  await check.service.configure({enabled:true,time:'20:00'});
  assert.equal(check.requests(),1);assert.equal(check.pending().length,30);assert.equal(check.service.state().enabled,true);
  const browser=harness({native:false});await browser.service.initialize();await browser.service.sync(snapshot());
  await assert.rejects(browser.service.configure({enabled:true,time:'20:00'}));
  assert.equal(browser.requests(),0);assert.equal(browser.pending().length,0);
});

test('같은 날 반복 동기화는 중복 예약하지 않으며 완료·시간 변경·끄기를 반영한다',async()=>{
  const check=harness();await check.service.sync(snapshot());await check.service.configure({enabled:true,time:'20:00'});
  const scheduled=check.calls.filter(call=>call[0]==='schedule').length;
  await check.service.sync(snapshot());assert.equal(check.calls.filter(call=>call[0]==='schedule').length,scheduled);
  await check.service.sync(snapshot({completedDates:['2026-09-28']}));
  assert.equal(check.pending().length,29);assert.ok(check.pending().every(item=>item.extra.date!=='2026-09-28'));
  await check.service.configure({enabled:true,time:'19:10'});assert.ok(check.pending().every(item=>item.schedule.at.getHours()===19));
  await check.service.configure({enabled:false,time:'19:10'});assert.equal(check.pending().length,0);assert.equal(check.service.state().enabled,false);
});

test('다음 날·재로그인에도 계정별 설정을 복원하고 다른 계정·로그아웃은 예약을 비운다',async()=>{
  const check=harness();await check.service.sync(snapshot());await check.service.configure({enabled:true,time:'19:15'});
  await check.service.clear();assert.equal(check.pending().length,0);
  await check.service.sync(snapshot({accountId:'another',identity:'another:session'}));assert.equal(check.service.state().enabled,false);
  await check.service.sync(snapshot());assert.equal(check.service.state().time,'19:15');assert.equal(check.pending().length,30);
  check.setClock(new Date(2026,8,29,10));await check.service.sync(snapshot());assert.equal(check.pending()[0].extra.date,'2026-09-29');
  await check.service.sync(snapshot({profile:false}));assert.equal(check.pending().length,0);
});

test('권한 거절·설정 저장 실패·예약 실패를 성공으로 표시하지 않는다',async()=>{
  const denied=harness({deny:true});await denied.service.sync(snapshot());await denied.service.configure({enabled:true,time:'20:00'});
  assert.equal(denied.pending().length,0);assert.equal(denied.service.state().enabled,false);assert.match(denied.service.state().error,/권한/);
  for(const options of [{storageFail:()=>true},{scheduleFail:()=>true}]) {
    const check=harness(options);await check.service.sync(snapshot());
    await assert.rejects(check.service.configure({enabled:true,time:'20:00'}));
    assert.equal(check.pending().length,0);assert.equal(check.service.state().enabled,false);assert.ok(check.service.state().error);
  }
});

test('권한 응답을 기다리는 중 계정이 바뀌어도 이전 계정 알림이 예약되지 않는다',async()=>{
  let release,started;
  const wait=new Promise(resolve=>{release=resolve;});
  const began=new Promise(resolve=>{started=resolve;});
  const check=harness({permissionWait:()=>{started();return wait;}});
  await check.service.sync(snapshot());const saving=check.service.configure({enabled:true,time:'20:00'});await began;
  const switched=check.service.sync(snapshot({accountId:'another',identity:'another:session'}));
  release();await saving;await switched;
  assert.equal(check.pending().length,0);assert.equal(check.service.state().accountId,'another');assert.equal(check.store.size,0);
});

test('예약 정리는 우리 알림만 취소하고 취소 실패는 호출자에게 알린다',async()=>{
  let fail=false;const check=harness({cancelFail:()=>fail});
  await check.service.sync(snapshot());await check.service.configure({enabled:true,time:'20:00'});
  check.setPending([...check.pending(),{id:10,extra:{kind:'other'}}]);
  check.setDelivered([{id:700100,extra:{kind:REMINDER_KIND}},{id:11}]);
  fail=true;await assert.rejects(check.service.clear());fail=false;await check.service.clear();
  assert.deepEqual(check.pending(),[{id:10,extra:{kind:'other'}}]);assert.deepEqual(check.delivered(),[{id:11}]);
});

test('알림을 누르면 같은 계정의 체크인만 열며 로그인 전에는 기록을 쓰지 않는다',async()=>{
  const check=harness();await check.service.initialize();
  const tap=check.listeners.get('localNotificationActionPerformed');
  tap({notification:{extra:{kind:REMINDER_KIND,accountId:'account-one'}}});assert.equal(check.taps(),0);
  await check.service.sync(snapshot());assert.equal(check.taps(),1);
  tap({notification:{extra:{kind:REMINDER_KIND,accountId:'another'}}});assert.equal(check.taps(),1);
  tap({notification:{extra:{kind:REMINDER_KIND,accountId:'account-one'}}});assert.equal(check.taps(),2);
});

test('앱을 다시 시작하면 저장한 시간을 복원하고 권한이 철회됐으면 조용히 예약을 취소한다',async()=>{
  const check=harness();await check.service.sync(snapshot());await check.service.configure({enabled:true,time:'18:35'});
  const restarted=createReminderService({native:true,notifications:check.notifications,storage:check.storage,now:()=>new Date(2026,8,28,10)});
  await restarted.sync(snapshot());assert.equal(restarted.state().time,'18:35');assert.equal(restarted.state().enabled,true);
  assert.equal(check.requests(),1);
  check.setPermission('denied');await restarted.sync(snapshot(),true);
  assert.equal(check.requests(),1);assert.equal(check.pending().length,0);assert.equal(restarted.state().enabled,false);
  assert.match(restarted.state().error,/권한/);
});
