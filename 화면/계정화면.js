import { APP } from '../앱설정.js';
import { currency } from './계산.js';
import { selectLegacyData } from './계정이전.js';
import { renderPrivacyPolicy } from './개인정보방침.js';
import { renderTerms } from './이용약관.js';
import { createKakaoFlow } from './카카오연결.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function createAccountUI(ctx){
  let mode='login',message='',busy=false,recoveryCode=null,recovering=false,legacy=null,backupReady=false,logoutFailed=false;
  let kakaoEnabled=false;
  const rerender=()=>ctx.render();
  const kakao=createKakaoFlow({client:ctx.client,onError:value=>{message=value;busy=false;ctx.toast?.(value);rerender();},onComplete:async result=>{
    ctx.closeDialog?.();
    if(result.deleted){try{await ctx.beforeSignOut?.();}catch{}ctx.hidePrivate();ctx.onSignedOut();return;}
    if(result.linked)ctx.toast('카카오 계정을 연결했어요. 기존 기록은 그대로예요.');
    ctx.announceSession();await ctx.onReady();
  }});
  function gate(){
    if(typeof location!=='undefined'&&location.hash==='#privacy')return `<main class="account-shell">${renderPrivacyPolicy()}</main>`;
    if(typeof location!=='undefined'&&location.hash==='#terms')return `<main class="account-shell">${renderTerms()}</main>`;
    if(recoveryCode)return `<main class="account-shell"><section class="account-card"><span class="account-kicker">ACCOUNT RECOVERY</span><h1>복구 코드를 보관해 주세요</h1><p>비밀번호를 잊었을 때 필요해요. 이메일로 보내지 않으며 이 화면을 닫으면 다시 볼 수 없어요.</p><label>나의 복구 코드<textarea class="account-recovery" readonly>${esc(recoveryCode)}</textarea></label><p>비밀번호와 다른 안전한 곳에 보관하세요. 이 코드가 있으면 계정 비밀번호를 바꿀 수 있어요.</p><button class="btn primary full-width" data-account="recovery-done">안전하게 보관했어요</button></section></main>`;
    if(logoutFailed)return `<main class="account-shell"><section class="account-card"><h1>기록 화면을 잠갔어요</h1><p>로그아웃을 완료하지 못했어요. 완료될 때까지 개인 기록을 표시하지 않아요.</p><p role="alert">${esc(message)}</p><button class="btn primary" data-account="logout">로그아웃 다시 시도</button></section></main>`;
    const registering=mode==='register',recoveringMode=mode==='recover';
    return `<main class="account-shell"><a class="account-brand" href="#login">${APP.name}<small>${APP.englishName}</small></a><section class="account-intro"><h1>매일 먼저 챙겨주는<br>피부 매니저</h1><p>오늘 할 일 하나부터 같이 정해볼까요?</p></section><section class="account-card"><div class="account-tabs"><button data-account-mode="login" aria-pressed="${mode==='login'}">로그인</button><button data-account-mode="register" aria-pressed="${registering}">회원가입</button></div><h2>${registering?'새 계정으로 시작해요':recoveringMode?'복구 코드로 비밀번호 재설정':'내 기록을 만나보세요'}</h2><form id="account-form"><label>아이디<input name="username" autocomplete="username" required pattern="[A-Za-z0-9_-]{4,32}" minlength="4" maxlength="32" placeholder="영문·숫자·밑줄·하이픈 4~32자"></label>${recoveringMode?'<label>복구 코드<input name="recoveryCode" required minlength="40" maxlength="40" autocomplete="off"></label>':''}<label>${recoveringMode?'새 비밀번호':'비밀번호'}<input name="password" type="password" autocomplete="${registering||recoveringMode?'new-password':'current-password'}" required maxlength="128" placeholder="비밀번호를 입력해 주세요"></label>${registering||recoveringMode?'<label>비밀번호 확인<input name="confirmPassword" type="password" autocomplete="new-password" required maxlength="128"></label>':''}${registering?'<label class="checkbox"><input name="consent" type="checkbox" required> 계정 정보와 내가 입력한 뷰티 기록을 저장하는 데 동의해요.</label><label class="checkbox"><input name="ageConfirmed" type="checkbox" required> 만 14세 이상입니다.</label><p class="field-help">사진 원본은 별도 동의 없이 전송하지 않아요. 이전 기기 기록은 자동으로 가져오지 않아요.</p>':''}<p class="form-error" role="alert">${esc(message)}</p><button class="btn primary full-width" type="submit" ${busy?'disabled':''}>${busy?'처리 중…':registering?'계정 만들기':recoveringMode?'새 비밀번호 저장':'로그인하기'}</button></form><button class="text-link" data-account-mode="recover">비밀번호를 잊었나요?</button><a class="text-link" href="#privacy">개인정보 처리방침</a><a class="text-link" href="#terms">이용약관</a></section><details class="account-details"><summary>개인정보·이용 환경 안내</summary><p>계정과 기록은 연결된 서버에 보관해요. 같은 계정으로 로그인하면 내 기록을 이어갈 수 있어요. 사진 분석은 별도 동의 후 유캠에서 처리해요.</p></details>${message?'<button class="text-link" data-account="retry">다시 연결하기</button>':''}</main>`;
  }
  function panel(){
    const {user}=ctx.client.state();if(!user)return '';
    return `<section class="settings-identity"><h1>${esc(user.hasPassword===false?'카카오 회원':user.username)}</h1></section>`;
  }
  function migration(){
    ctx.dialog('이전 기기 기록 확인',`<p class="modal-sub">이 자료가 본인의 기록인지 확인해 주세요. 본인 기록이 아닌 항목은 제외해 주세요. 원본은 삭제하지 않고 <strong>${esc(ctx.client.state().user.username)}</strong> 계정으로 선택한 항목만 복사해요.</p><button class="btn secondary" type="button" data-account="legacy-backup">원본 백업 파일 내려받기</button><p class="field-help" id="legacy-backup-state">${backupReady?'백업 파일 내려받기를 요청했어요. 실제 파일 보관을 확인한 뒤 진행하세요.':'계정 이전 전에 원본을 백업해 주세요.'}</p><form id="legacy-form"><fieldset><legend>가져올 소비 기록 · 기본은 선택 안 함</legend>${legacy.records.map(record=>`<label class="checkbox"><input type="checkbox" name="record" value="${esc(record.id)}"> ${record.date} · ${esc(record.title)} · ${currency(record.amount)}</label>`).join('')||'<p>소비 기록 없음</p>'}</fieldset><fieldset><legend>함께 가져올 항목</legend>${[['care','피부·루틴·사진 관찰 이력·보유 제품'],['budgets','예산·월별 계획'],['goals','뷰티 목표'],['wishes','구매 고민 (연결된 소비도 직접 선택)'],['schedules','관리 일정']].map(([value,label])=>`<label class="checkbox"><input name="section" type="checkbox" value="${value}"> ${label}</label>`).join('')}</fieldset><label class="checkbox"><input type="checkbox" name="backupConfirmed" required> 원본 백업 파일을 안전하게 보관했어요.</label><label class="checkbox"><input type="checkbox" name="consent" required> 선택한 자료는 본인 기록이며 현재 계정에 저장하는 데 동의해요.</label><p class="form-error" role="alert"></p><button class="btn primary full-width" type="submit">선택한 기록만 이전</button></form>`);
  }
  document.addEventListener('click',async event=>{
    const switcher=event.target.closest('[data-account-mode]');
    if(switcher&&!busy){mode=switcher.dataset.accountMode;message='';rerender();return;}
    const button=event.target.closest('[data-account]');if(!button||busy)return;
    const action=button.dataset.account;
    if(action==='kakao-login'||action==='kakao-link'){
      if(!kakaoEnabled)return;
      const linking=action==='kakao-link';
      ctx.dialog(linking?'현재 계정에 카카오 연결':'카카오로 시작하기',`<p class="modal-sub">카카오 회원번호만 확인해요. 이메일·전화번호는 받지 않아요.</p><form id="kakao-form" data-purpose="${linking?'link':'login'}">${linking?'<p>지금 로그인한 계정과 기록을 그대로 사용해요. 다른 계정의 기록과 합치지 않아요.</p>':'<label class="checkbox"><input name="ageConfirmed" type="checkbox" required> 만 14세 이상입니다.</label><label class="checkbox"><input name="consent" type="checkbox" required> 회원번호 연결 정보와 내가 입력한 기록 저장에 동의해요.</label><a class="text-link" href="#privacy" data-action="close">개인정보 처리방침</a>'}<p class="form-error" role="alert"></p><button class="btn kakao-button full-width" type="submit">${linking?'카카오 계정 연결':'동의하고 카카오로 계속'}</button></form>`);return;
    }
    if(action==='recovery-done'){recoveryCode=null;if(recovering){recovering=false;mode='login';message='새 비밀번호로 로그인해 주세요.';rerender();}else await ctx.onReady();return;}
    if(action==='policy-close'){location.hash='#login';rerender();return;}
    if(action==='delete-open'){
      if(ctx.client.state().user?.hasPassword===false){
        ctx.dialog('계정을 삭제할까요?',`<p class="modal-sub">계정과 모든 기록이 삭제돼요. 카카오 계정을 다시 확인한 뒤 탈퇴하며 되돌릴 수 없어요.</p><form id="kakao-form" data-purpose="delete"><label class="checkbox"><input name="confirm" type="checkbox" required> 계정과 모든 기록 삭제를 확인했어요.</label><p class="form-error" role="alert"></p><button class="btn danger" type="submit">카카오 확인 후 계정 삭제</button></form>`);return;
      }
      ctx.dialog('계정을 삭제할까요?',`<p class="modal-sub">${esc(ctx.client.state().user?.username)} 계정과 피부·소비·사진 관찰 기록, 로그인 세션이 삭제돼요. 되돌릴 수 없으며 직접 내려받은 백업 파일은 따로 삭제해야 해요.</p><form id="account-delete-form"><label>현재 비밀번호<input name="password" type="password" autocomplete="current-password" required></label><label class="checkbox"><input name="confirm" type="checkbox" required> 계정과 모든 기록 삭제를 확인했어요.</label><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">취소</button><button type="submit" class="btn danger">계정 삭제</button></div></form>`);return;
    }
    if(action==='retry'){message='';await ctx.onReady();return;}
    if(action==='legacy'){
      const identity=ctx.client.state().identity;
      if(!identity)return;
      try{const original=await ctx.readLegacy();if(identity!==ctx.client.state().identity||logoutFailed)return;legacy=original;backupReady=false;if(!legacy)throw Error('이 브라우저에 이전 기기 기록이 없어요.');migration();}catch(issue){ctx.toast(issue.message);}return;
    }
    if(action==='legacy-backup'){
      const url=URL.createObjectURL(new Blob([JSON.stringify(legacy,null,2)],{type:'application/json'})),anchor=document.createElement('a');
      anchor.href=url;anchor.download=`${APP.name}-이전기록-백업.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);backupReady=true;document.getElementById('legacy-backup-state').textContent='백업 파일 내려받기를 요청했어요. 실제 파일 보관을 확인해 주세요.';return;
    }
    if(action==='logout'){
      busy=true;logoutFailed=true;message='로그아웃을 확인하고 있어요.';ctx.hidePrivate();rerender();
      try{await ctx.beforeSignOut?.();await ctx.client.logout();ctx.onSignedOut();}catch(issue){message=issue.message;busy=false;rerender();}
    }
  });
  document.addEventListener('submit',async event=>{
    if(!['account-form','legacy-form','account-delete-form','kakao-form'].includes(event.target.id))return;
    event.preventDefault();if(busy)return;
    const form=event.target,fields=new FormData(form),error=form.querySelector('.form-error'),submit=form.querySelector('[type="submit"]');
    busy=true;submit.disabled=true;error.textContent='';
    try{
      if(form.id==='kakao-form'){
        const purpose=form.dataset.purpose;
        await kakao.start(purpose,purpose==='login'?{ageConfirmed:fields.get('ageConfirmed')==='on',consent:fields.get('consent')==='on'}:purpose==='delete'?{confirm:fields.get('confirm')==='on'}:{});return;
      }
      if(form.id==='account-delete-form'){
        if(fields.get('confirm')!=='on')throw Error('계정과 모든 기록 삭제를 확인해 주세요.');
        await ctx.client.deleteAccount(fields.get('password'));
        try{await ctx.beforeSignOut?.();}catch{}ctx.hidePrivate();ctx.onSignedOut();return;
      }
      if(form.id==='account-form'){
        if(mode!=='login'&&fields.get('password')!==fields.get('confirmPassword'))throw Error('비밀번호 확인이 일치하지 않아요.');
        const result=await ctx.client.authenticate(mode,{username:fields.get('username'),password:fields.get('password'),...(mode==='register'?{consent:fields.get('consent')==='on',ageConfirmed:fields.get('ageConfirmed')==='on'}:{}),...(mode==='recover'?{recoveryCode:fields.get('recoveryCode')}:{})});
        form.reset();ctx.announceSession();
        if(result.recoveryCode){recoveryCode=result.recoveryCode;recovering=mode==='recover';busy=false;rerender();}else await ctx.onReady();
      }else{
        if(!backupReady||fields.get('backupConfirmed')!=='on'||fields.get('consent')!=='on')throw Error('원본 백업과 이전 동의를 먼저 확인해 주세요.');
        const data=selectLegacyData(legacy,{recordIds:fields.getAll('record'),sections:fields.getAll('section')});
        await ctx.client.importLegacy(data,{backupConfirmed:true,consent:true});legacy=null;ctx.closeDialog();await ctx.onReady();ctx.toast('선택한 기록을 계정에 저장했어요. 이전 기기 원본은 유지했어요.');
      }
    }catch(issue){error.textContent=issue.message;}
    finally{busy=false;submit.disabled=false;}
  });
  return {gate:()=>{
    const content=gate();
    if(!kakaoEnabled||recoveryCode||logoutFailed||mode==='recover')return content;
    return content.replace('<button class="text-link" data-account-mode="recover">','<button class="btn kakao-button full-width" data-account="kakao-login">카카오로 시작하기</button><button class="text-link" data-account-mode="recover">');
  },panel,kakaoSettings:()=>kakaoEnabled?`<button class="settings-list-row" data-account="kakao-link" ${ctx.client.state().user?.kakaoLinked?'disabled':''}><span>${ctx.client.state().user?.kakaoLinked?'카카오 연결됨':'카카오 계정 연결'}</span><span aria-hidden="true">›</span></button>`:'',
  async initialize(){try{kakaoEnabled=(await ctx.client.kakaoConfig()).enabled===true;}catch{kakaoEnabled=false;}await kakao.initialize();},
  locked:()=>Boolean(recoveryCode||logoutFailed),setError:value=>{message=value;},clear(){legacy=null;recoveryCode=null;backupReady=false;}};
}
