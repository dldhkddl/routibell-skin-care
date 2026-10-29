import { EMPTY } from '../화면/계산.js';

const button=document.getElementById('seed-legacy');
button.disabled=location.origin!=='http://127.0.0.1:4273';
button.addEventListener('click',()=>{
  if(location.origin!=='http://127.0.0.1:4273')return;
  const data=EMPTY();data.records=[{id:'legacy-chosen',title:'이전할 검증 기록',category:'cosmetic',amount:12000,date:'2025-03-01',rating:null,repurchase:null,memo:''},{id:'legacy-excluded',title:'제외할 검증 기록',category:'hair',amount:80000,date:'2025-03-02',rating:null,repurchase:null,memo:''}];
  localStorage.setItem('beautylog-v1',JSON.stringify(data));
  document.getElementById('seed-message').textContent='4273 격리 기기 저장소에 2건을 준비했어요. 계정 서버로는 아직 전송하지 않았어요.';
});
await import('../화면/앱.js');
