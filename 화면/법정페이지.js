import { APP } from '../앱설정.js';
import { renderPrivacyPolicy } from './개인정보방침.js';
import { renderTerms } from './이용약관.js';
import './법정페이지.css';

const page=document.body.dataset.policy;
document.title=`${APP.name} · ${page==='terms'?'이용약관':'개인정보 처리방침'} 초안`;
document.getElementById('legal-page').innerHTML=page==='terms'?renderTerms({standalone:true}):renderPrivacyPolicy({standalone:true});
