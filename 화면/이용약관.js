import { APP } from '../앱설정.js';

export function renderTerms({signedIn=false,standalone=false}={}){
  return `<section class="privacy-policy" aria-labelledby="terms-title">
    <p class="privacy-draft" role="status">초안 · 공개 전 검토 필요</p>
    <h1 id="terms-title">이용약관</h1>
    <p>${APP.name}은 직접 남긴 기록과 선택한 사진 분석 결과를 바탕으로 오늘의 피부 관리 습관을 정리합니다.</p>
    <section><h2>무료 이용</h2><p>체크인·기록·기본 루틴·내 화장대는 무료입니다. 가입 계정에는 사진 분석 체험 1회가 제공되며 최대 4개 항목을 선택할 수 있습니다. 분석은 본인 사진과 별도 국외 이전 동의가 있을 때만 시작됩니다.</p></section>
    <section><h2>구독과 자동 갱신</h2><p>구독이 정식 연결되면 16개 항목 분석, 결제 기간마다 설정된 횟수의 분석, 재분석 비교를 제공합니다. 월 구독은 해지 전까지 매 결제 기간에 자동 갱신됩니다. 최종 가격과 결제일·다음 갱신일은 결제 전에 명확히 표시합니다. 현재 실제 결제는 연결하지 않았습니다.</p></section>
    <section><h2>해지·복원·환불</h2><p>Google Play에서 구매한 구독은 Play 구독 관리에서 다음 갱신 전 해지할 수 있습니다. 해지 후에도 일반적으로 이미 결제한 기간이 끝날 때까지 이용권이 유지됩니다. 앱 재설치 후 복원은 구매 내역을 공급자에게 확인한 경우에만 반영합니다. 환불은 구매한 스토어 정책과 적용 법령에 따르며, 환불로 이용권이 취소되면 유료 기능 접근이 종료될 수 있습니다.</p><a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">Google Play 구독 관리</a></section>
    <section><h2>사진 분석의 한계</h2><p>사진 점수와 비교 결과는 촬영 조건에 영향을 받는 참고값입니다. 의료 진단·치료·효과 보증을 제공하지 않습니다. 불편함이 지속되면 전문 의료인과 상담해 주세요.</p></section>
    <section><h2>계정과 개인정보</h2><p>탈퇴 시 계정과 연결 기록을 삭제합니다. 구독 해지는 계정 삭제와 별개이므로 계정 탈퇴 전에 스토어 구독 관리에서 해지 여부를 확인해 주세요. 자세한 처리 방식은 개인정보 처리방침에서 확인할 수 있습니다.</p><a href="/개인정보-처리방침.html">개인정보 처리방침</a></section>
    <section><h2>운영자·분쟁 처리</h2><p>사업자 정보, 고객센터 연락처, 시행일, 청약철회·환불의 세부 기준 및 분쟁 처리 절차는 공개 전 확정해야 합니다. 이 초안은 아직 실제 결제 계약의 약관으로 사용하지 않습니다.</p></section>
    ${standalone?'<a class="btn secondary" href="/#login">앱으로 돌아가기</a>':signedIn?'<button type="button" class="btn secondary" data-view="settings">마이로 돌아가기</button>':'<a class="btn secondary" href="#login">가입·로그인으로 돌아가기</a>'}
  </section>`;
}
