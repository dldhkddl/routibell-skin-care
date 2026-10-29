import { APP } from '../앱설정.js';
import { createAccountClient } from './계정연결.js';
import './법정페이지.css';
import './계정화면.css';

document.title=`${APP.name} · 계정 삭제 요청`;
const root=document.getElementById('delete-page');
root.innerHTML=`<section class="privacy-policy account-delete-web" aria-labelledby="delete-title">
  <p class="privacy-draft">초안 · 공개 전 검토 필요</p>
  <h1 id="delete-title">${APP.name} 계정 삭제</h1>
  <p>앱을 지웠어도 여기에서 계정과 연결된 기록을 삭제할 수 있어요.</p>
  <form id="web-delete-form">
    <label>아이디<input name="username" autocomplete="username" required pattern="[A-Za-z0-9_-]{4,32}" maxlength="32"></label>
    <label>비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
    <label class="checkbox"><input name="confirm" type="checkbox" required> 계정과 모든 기록을 삭제하고 되돌릴 수 없다는 것을 확인했어요.</label>
    <p class="form-error" role="alert" id="delete-error"></p>
    <button type="submit" class="btn danger">계정과 기록 삭제하기</button>
  </form>
  <section><h2>카카오로 가입했다면</h2><p>브라우저에서 카카오로 로그인한 뒤 마이 → 계정 탈퇴를 선택해 주세요. 앱을 다시 설치할 필요는 없어요.</p><a href="/#settings">브라우저에서 로그인하기</a></section>
  <section><h2>구독을 이용 중이라면</h2><p>계정 삭제가 스토어 구독을 자동 해지하지는 않아요. Google Play에서 구독을 먼저 확인해 주세요.</p><a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">Google Play 구독 관리</a></section>
</section>`;

let busy=false;
document.getElementById('web-delete-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  const form=event.currentTarget,fields=new FormData(form),button=form.querySelector('button[type="submit"]'),error=document.getElementById('delete-error');
  busy=true;button.disabled=true;error.textContent='';
  const client=createAccountClient();
  try{
    if(fields.get('confirm')!=='on')throw Error('삭제 내용을 확인해 주세요.');
    await client.authenticate('login',{username:fields.get('username'),password:fields.get('password')});
    await client.deleteAccount(fields.get('password'));
    root.innerHTML=`<section class="privacy-policy"><h1>계정과 기록을 삭제했어요</h1><p>${APP.name} 계정으로 다시 로그인할 수 없어요. 직접 저장한 백업 파일은 별도로 삭제해 주세요.</p></section>`;
  }catch(issue){error.textContent=issue.message;button.disabled=false;if(client.state().user)await client.logout().catch(()=>{});}
  finally{client.clear();busy=false;}
});
