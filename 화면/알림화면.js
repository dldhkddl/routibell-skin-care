import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createReminderService } from './체크인알림.js';
import { copyDetails } from './화면정리.js';
import { buildSkinPlan } from './피부계산.js';

const esc=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const firstOfferKey=accountId=>`routibell-reminder-first-offer:${accountId}`;
export const shouldOfferFirstReminder=({native,firstCheckin,alreadyAsked,enabled})=>Boolean(native&&firstCheckin&&!alreadyAsked&&!enabled);

export function createReminderUI(ctx,{platform=()=>Capacitor.getPlatform(),storage=Preferences,notifications=LocalNotifications}={}) {
  const service=createReminderService({native:platform()==='android',notifications,storage,onChange:()=>{const host=document.getElementById('reminder-panel');if(host)host.innerHTML=content();},onTap:()=>ctx.navigate('checkin')});
  const snapshot=()=>{const state=ctx.state();const plan=state.ready?buildSkinPlan(state.data):null;return {accountId:state.ready?state.user?.id:null,identity:state.ready?state.identity:null,profile:state.ready&&Boolean(state.data.skinCare.profile),focusType:plan&&!plan.paused?plan.focused[0]??null:null,completedDates:state.ready?state.data.skinCare.checkins.map(entry=>entry.date):[]};};
  async function offerFirstCheckin() {
    const state=ctx.state();
    if(platform()!=='android'||!state.ready||!state.user?.id||service.state().enabled)return;
    const key=firstOfferKey(state.user.id);
    try{
      const stored=await storage.get({key});
      if(!shouldOfferFirstReminder({native:true,firstCheckin:true,alreadyAsked:Boolean(stored.value),enabled:service.state().enabled}))return;
      await storage.set({key,value:'asked'});
      ctx.dialog('내일 아침에도 챙겨드릴까요?',`<div class="modal-actions"><button type="button" class="btn secondary" data-reminder-offer="later">괜찮아요</button><button type="button" class="btn primary" data-reminder-offer="enable">알림 켜기</button></div>`);
    }catch{ctx.toast('알림 안내를 열지 못했어요. 마이에서 설정할 수 있어요.');}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-reminder-offer]');
    if(!button)return;
    document.getElementById('editor')?.close();
    if(button.dataset.reminderOffer!=='enable')return;
    try{
      await service.sync(snapshot());
      await service.configure({enabled:true,time:'20:00',morningEnabled:true,eveningEnabled:true,morningTime:'08:00',eveningTime:'20:00'});
      ctx.toast(service.state().error||'내일부터 알림으로 챙겨드릴게요.');
    }catch{ctx.toast('알림을 켜지 못했어요. 마이에서 다시 설정해 주세요.');}
  });
  function content() {
    const status=service.state(),state=ctx.state();
    if(!status.supported)return `<h2>오늘의 체크인 알림</h2>${copyDetails('알림은 Android 앱에서 설정해요.','<p>설치한 Android 앱에서 원하는 시간에 알림을 받을 수 있어요. 현재 환경에서는 알림을 예약하지 않아요.</p>')}`;
    const disabled=status.busy||!state.ready||!state.data.skinCare.profile;
    return `<h2>오늘의 체크인 알림</h2><p>아침·저녁 중 원하는 시간만 골라요.</p><form id="reminder-form"><label class="checkbox"><input type="checkbox" name="enabled" ${status.enabled?'checked':''} ${disabled?'disabled':''}> 체크인 알림 받기</label><label class="checkbox"><input type="checkbox" name="morningEnabled" ${status.morningEnabled?'checked':''} ${disabled?'disabled':''}> 아침</label><label>아침 시간<input type="time" name="morningTime" required value="${esc(status.morningTime)}" ${disabled?'disabled':''}></label><label class="checkbox"><input type="checkbox" name="eveningEnabled" ${status.eveningEnabled?'checked':''} ${disabled?'disabled':''}> 저녁</label><label>저녁 시간<input type="time" name="eveningTime" required value="${esc(status.eveningTime)}" ${disabled?'disabled':''}></label><p class="field-help">오늘 기록을 마치면 오늘 알림은 건너뛰어요. 이 기기의 현재 계정에만 적용하며, 기기 상태에 따라 조금 늦게 도착할 수 있어요.</p><details><summary>알림 예약 안내</summary><p>앞으로 30일을 예약하고 앱을 다시 열면 연장해요. 로그아웃하면 예약을 취소해요. 알림을 눌러도 답변이 자동 저장되지는 않아요.</p></details>${!state.data.skinCare.profile?'<p>관리 계획에서 피부 상태를 먼저 저장해 주세요.</p>':''}<p role="status" class="${status.error?'form-error':'field-help'}">${esc(status.error|| (status.busy?'알림을 확인하고 있어요.':status.enabled?'알림이 켜져 있어요.':'알림이 꺼져 있어요.'))}</p><button type="submit" class="btn secondary full-width" ${disabled?'disabled':''}>${status.busy?'설정 중…':'알림 설정 저장'}</button></form>`;
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='reminder-form')return;
    event.preventDefault();if(service.state().busy)return;
    const fields=new FormData(event.target);
    try{await service.configure({enabled:fields.get('enabled')==='on',morningEnabled:fields.get('morningEnabled')==='on',eveningEnabled:fields.get('eveningEnabled')==='on',morningTime:fields.get('morningTime'),eveningTime:fields.get('eveningTime')});if(!service.state().error)ctx.toast('알림 설정을 저장했어요.');}
    catch(issue){ctx.toast(issue.message);}
  });
  return {panel:()=>ctx.state().demo?'':`<section id="reminder-panel" class="panel reminder-panel">${content()}</section>`,sync:force=>service.sync(snapshot(),force&&!service.state().busy).catch(()=>{}),offerFirstCheckin,initialize:()=>service.initialize().catch(()=>ctx.toast('알림 연결을 확인하지 못했어요. 앱을 다시 열어 주세요.')),clear:()=>service.clear()};
}
