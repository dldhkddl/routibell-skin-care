import { APP } from '../앱설정.js';
export function renderPrivacyPolicy({signedIn=false,standalone=false}={}){
  return `<section class="privacy-policy" aria-labelledby="privacy-title">
    <p class="privacy-draft" role="status">초안 · 공개 전 검토 필요</p>
    <h1 id="privacy-title">개인정보 처리방침</h1>
    <p>${APP.name}은 기록을 내 계정에 보관하고, 사진 분석을 선택한 경우에만 외부 서비스를 이용합니다.</p>
    <section><h2>수집 항목과 이용 목적</h2><dl><div><dt>계정</dt><dd>아이디, 비밀번호의 암호화된 확인값, 복구 코드 확인값 또는 카카오 회원번호의 연결 확인값 · 로그인과 계정 보호. 카카오 이메일·전화번호·프로필은 요청하지 않습니다.</dd></div><div><dt>피부 기록</dt><dd>직접 입력한 피부 느낌·루틴·사용감과 동의해 저장한 분석 점수 · 관리 계획과 월간 리포트</dd></div><div><dt>소비 기록</dt><dd>지출·예산·평가·메모 · 지출 정리와 다음 달 제안</dd></div><div><dt>얼굴 사진</dt><dd>선택 시 얼굴 사진 1장과 분석 항목 · 사진 분석 수행</dd></div><div><dt>결제 정보</dt><dd>구독 연결 후 구매 식별자, 구독 상태·기간, 자동 갱신 여부 · 이용권 확인과 환불 반영. 카드번호는 앱 서버에서 직접 받지 않습니다. 현재 실제 결제는 연결하지 않았습니다.</dd></div></dl></section>
    <section><h2>보관 장소와 기간·파기</h2><p>계정·피부·소비 기록과 분석 이용권 정보는 서버 전용 Supabase PostgreSQL의 서울 리전 구성에 보관합니다. 출시 전 실제 프로젝트 리전과 위탁 관계를 다시 확인합니다.</p><p>계정 기록은 탈퇴할 때까지 보관하고, 탈퇴 시 계정·기록·분석 결과·로그인 세션을 삭제합니다. 직접 내려받은 백업 파일은 사용자가 별도로 삭제해야 합니다. 결제 후 법정 보관 의무가 생기는 자료의 범위와 기간은 공개 전 확정합니다.</p><p>얼굴 사진 원본은 계정 DB에 저장하지 않고 처리 후 서버 메모리에서 지웁니다. 분석 결과에 포함된 표시 이미지는 암호화된 임시 결과로 서버 DB에 남아, 사용자가 임시 결과를 지우거나 탈퇴하면 삭제됩니다. 이를 자동 30분 삭제라고 안내하지 않습니다. 유캠 작업·파일은 결과를 받은 뒤 삭제 요청하며, 실패해도 업로드·생성 이미지는 최대 30일 뒤 자동 삭제된다는 공급자 안내가 있습니다. 예외 보관 범위는 공개 전 확인합니다.</p></section>
    <section><h2>국외 이전</h2><p>이전 근거: 개인정보 보호법 제28조의8 제1항 제1호에 따른 별도 동의. 사진 분석을 선택하지 않으면 이전하지 않습니다.</p><dl><div><dt>이전 항목</dt><dd>얼굴 사진 1장, 선택한 분석 항목</dd></div><div><dt>국가·시기·방법</dt><dd>미국 서버 / 분석 버튼을 누를 때 암호화 통신으로 전송</dd></div><div><dt>받는 자</dt><dd>Perfect Corp. (대만) · person001@example.invalid</dd></div><div><dt>목적·기간</dt><dd>피부 분석 수행 / 분석 완료 뒤 삭제 요청, 실패 시 최대 30일 보관 후 삭제. 명시적 동의 없이 모델 학습에 사용하지 않음</dd></div><div><dt>거부 방법·효과</dt><dd>사진 분석 전 국외 이전 동의를 체크하지 않으면 됩니다. 사진 분석만 이용할 수 없고 다른 기능은 계속 이용할 수 있습니다.</dd></div></dl></section>
    <section><h2>권리와 행사 방법</h2><p>내 기록은 앱에서 열람·수정할 수 있고, 마이에서 탈퇴하여 계정 기록을 삭제할 수 있습니다. 이후 분석의 국외 이전은 동의하지 않는 방식으로 거부할 수 있습니다. 이미 전송한 자료의 처리 문의 및 열람·정정·삭제·처리정지 요청은 운영자에게 해주세요.</p></section>
    <section><h2>연락처</h2><p>${APP.name} 운영자 및 개인정보 보호 담당 연락처: 공개 전 확정 필요. 유캠의 연락처는 위 국외 이전 항목에 기재했습니다.</p></section>
    ${standalone?'<a class="btn secondary" href="/#login">앱으로 돌아가기</a>':signedIn?'<button type="button" class="btn secondary" data-view="settings">마이로 돌아가기</button>':'<button type="button" class="btn secondary" data-account="policy-close">가입·로그인으로 돌아가기</button>'}
  </section>`;
}
