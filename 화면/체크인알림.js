import { APP } from '../앱설정.js';
import { PHOTO_ACTIONS } from './사진항목.js';
import { focusReminder } from './관리팁.js';
export const REMINDER_KIND='beautylog-checkin';
const CHANNEL='beautylog-checkin-v1';
const PREFIX='beautylog-checkin-reminder-v1:';
const DEFAULTS={enabled:false,time:'20:00',morningEnabled:true,eveningEnabled:true,morningTime:'08:00',eveningTime:'20:00'};
const localDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const owns=notification=>notification.extra?.kind===REMINDER_KIND||(Number.isInteger(notification.id)&&notification.id>=700000&&notification.id<800000);

export function validateReminder(value) {
  const validTime=time=>typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if(!value||typeof value.enabled!=='boolean'||Object.keys(value).some(key=>!['enabled','time','morningEnabled','eveningEnabled','morningTime','eveningTime'].includes(key)))throw Error('알림 시간과 설정을 확인해 주세요.');
  const expanded=Object.hasOwn(value,'morningEnabled')||Object.hasOwn(value,'eveningEnabled');
  const time=value.time??value.eveningTime??'20:00';
  const morningEnabled=expanded?value.morningEnabled:time<'12:00';
  const eveningEnabled=expanded?value.eveningEnabled:time>='12:00';
  const morningTime=value.morningTime??(time<'12:00'?time:'08:00');
  const eveningTime=value.eveningTime??(time>='12:00'?time:'20:00');
  if(!validTime(time)||typeof morningEnabled!=='boolean'||typeof eveningEnabled!=='boolean'||!validTime(morningTime)||!validTime(eveningTime)||morningTime>='12:00'||eveningTime<'12:00'||value.enabled&&!morningEnabled&&!eveningEnabled)throw Error('알림 시간과 설정을 확인해 주세요.');
  return {enabled:value.enabled,time,morningEnabled,eveningEnabled,morningTime,eveningTime};
}

export function reminderSchedule({accountId,time='20:00',morningEnabled,eveningEnabled,morningTime,eveningTime,focusType=null,completedDates=[],now=new Date()}) {
  const schedule=validateReminder({enabled:true,time,...(morningEnabled===undefined?{}:{morningEnabled}),...(eveningEnabled===undefined?{}:{eveningEnabled}),...(morningTime===undefined?{}:{morningTime}),...(eveningTime===undefined?{}:{eveningTime})});
  const completed=new Set(completedDates),notifications=[];
  for(let offset=0;offset<30;offset++) {
    for(const [index,period] of ['morning','evening'].entries()) {
      if(!schedule[`${period}Enabled`])continue;
      const [hour,minute]=schedule[`${period}Time`].split(':').map(Number);
      const at=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,hour,minute);
      const date=localDate(at);
      if(at<=now||completed.has(date))continue;
      notifications.push({id:700000+Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000)*2+index,title:APP.name,body:PHOTO_ACTIONS.includes(focusType)&&focusType!=='skin_type'?focusReminder(focusType,period):'오늘의 짧은 체크인을 남겨볼까요?',channelId:CHANNEL,smallIcon:'checkin_notification',isExactNotification:false,schedule:{at,allowWhileIdle:false},extra:{kind:REMINDER_KIND,accountId,date,period}});
    }
  }
  return notifications;
}

export function createReminderService({native,notifications,storage,now=()=>new Date(),onChange=()=>{},onTap=()=>{}}) {
  let current={accountId:null,identity:null,profile:false,focusType:null,completedDates:[]},signature='',revision=0,queue=Promise.resolve(),listener=null,pendingTap=null;
  let status={...DEFAULTS,supported:native,busy:false,error:'',permission:'prompt',scheduled:0,accountId:null};
  const publish=changes=>{status={...status,...changes};onChange({...status});};
  const enqueue=operation=>{const task=queue.then(operation);queue=task.catch(()=>{});return task;};
  async function clearScheduled() {
    const pending=await notifications.getPending();
    const owned=pending.notifications.filter(owns).map(({id})=>({id}));
    if(owned.length)await notifications.cancel({notifications:owned});
    const delivered=await notifications.getDeliveredNotifications();
    const visible=delivered.notifications.filter(owns);
    if(visible.length)await notifications.removeDeliveredNotifications({notifications:visible});
  }
  function deliverTap() {
    if(!pendingTap||!current.accountId||status.busy)return;
    const tap=pendingTap;pendingTap=null;
    if(tap.accountId===current.accountId&&current.profile)onTap();
  }
  async function reconcile(stamp,settings=null,requestPermission=false) {
    if(stamp!==revision)return;
    const account=current.accountId;
    publish({busy:true,error:'',scheduled:0,accountId:account});
    try {
      await clearScheduled();
      if(stamp!==revision)return;
      if(!account||!current.profile){publish({...DEFAULTS,busy:false});return;}
      const saved=settings??await storage.get({key:PREFIX+account}).then(result=>result.value?validateReminder(JSON.parse(result.value)):{...DEFAULTS});
      if(stamp!==revision)return;
      const permission=saved.enabled?(requestPermission?await notifications.requestPermissions():await notifications.checkPermissions()):{display:'prompt'};
      if(stamp!==revision)return;
      if(saved.enabled&&permission.display!=='granted') {
        if(settings)await storage.set({key:PREFIX+account,value:JSON.stringify({...saved,enabled:false})});
        publish({...saved,enabled:false,permission:permission.display,busy:false,error:'알림 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 켜 주세요.'});return;
      }
      if(saved.enabled) {
        await notifications.createChannel({id:CHANNEL,name:`${APP.managerName} 체크인`,description:'내가 고른 아침·저녁 체크인',importance:3,visibility:0});
        if(stamp!==revision)return;
        const list=reminderSchedule({accountId:account,...saved,focusType:current.focusType,completedDates:current.completedDates,now:now()});
        const scheduled=list.length?await notifications.schedule({notifications:list}):{notifications:[]};
        if(stamp!==revision){await clearScheduled();return;}
        if(scheduled.notifications.length!==list.length)throw Error('예약 확인 실패');
        publish({scheduled:list.length});
      }
      if(settings)await storage.set({key:PREFIX+account,value:JSON.stringify(saved)});
      if(stamp!==revision){await clearScheduled();return;}
      publish({...saved,permission:permission.display,busy:false,error:''});deliverTap();
    } catch {
      let cleared=true;
      try{await clearScheduled();}catch{cleared=false;}
      if(stamp===revision)publish({enabled:false,busy:false,scheduled:0,error:cleared?'알림 설정을 완료하지 못했어요. 다시 저장해 주세요.':`예약 알림을 취소하지 못했어요. 기기 설정에서 ${APP.name} 알림을 끄고 다시 시도해 주세요.`});
      throw Error('알림 설정·예약 취소를 완료하지 못했어요. 다시 시도해 주세요.');
    }
  }
  async function initialize() {
    if(!native||listener)return;
    listener=await notifications.addListener('localNotificationActionPerformed',event=>{
      const extra=event.notification?.extra;
      if(extra?.kind!==REMINDER_KIND||typeof extra.accountId!=='string')return;
      pendingTap=extra;deliverTap();
    });
  }
  function sync(snapshot,force=false) {
    if(!native)return Promise.resolve();
    const next={accountId:snapshot.accountId??null,identity:snapshot.identity??null,profile:Boolean(snapshot.profile),focusType:PHOTO_ACTIONS.includes(snapshot.focusType)&&snapshot.focusType!=='skin_type'?snapshot.focusType:null,completedDates:[...(snapshot.completedDates??[])]};
    const nextSignature=JSON.stringify([next,localDate(now()),now().getTimezoneOffset()]);
    current=next;
    if(!force&&signature===nextSignature)return queue;
    signature=nextSignature;const stamp=++revision;
    return enqueue(()=>reconcile(stamp));
  }
  function configure(value) {
    const settings=validateReminder(value);
    if(!native||!current.accountId||!current.profile)return Promise.reject(Error('로그인한 앱에서 피부 상태를 저장한 뒤 설정해 주세요.'));
    const stamp=++revision;
    return enqueue(()=>reconcile(stamp,settings,settings.enabled));
  }
  function clear() {
    current={accountId:null,identity:null,profile:false,focusType:null,completedDates:[]};signature='';pendingTap=null;++revision;
    return native?enqueue(async()=>{await clearScheduled();publish({...DEFAULTS,accountId:null,busy:false,scheduled:0,error:''});}):Promise.resolve();
  }
  return {initialize,sync,configure,clear,state:()=>({...status}),settled:()=>queue};
}
