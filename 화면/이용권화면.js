const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[character]));

export function renderSubscription(value,error=''){
  if(error)return `<section class="subscription-page"><h2>이용권을 확인하지 못했어요</h2><p>${esc(error)}</p><button class="btn secondary full-width" data-subscription-retry>다시 확인하기</button></section>`;
  if(!value)return '<section class="subscription-page"><h2>이용권을 확인하고 있어요</h2></section>';
  const {access,priceKrw,monthlyAnalyses,analysisPassPriceKrw=3900,paymentsEnabled=false}=value;
  const until=access.tier==='subscription'&&Number.isFinite(access.expiresAt)?new Date(access.expiresAt).toLocaleDateString('ko-KR'):'';
  return `<section class="subscription-page" aria-labelledby="subscription-title">
    <h2 id="subscription-title">내 피부 관리를 이어갈까요?</h2>
    <p class="subscription-current">${access.tier==='subscription'?`구독 이용 중 · 이번 결제 기간 ${access.subscriptionRemaining??access.remaining}회 남았어요`:access.oneTimeRemaining>0?`1회권 ${access.oneTimeRemaining}회 남았어요`:access.freeTrialRemaining===0?'무료 분석 체험을 사용했어요':access.trialLocked?`${access.trialRequiredDays}일 체크인 후 무료 체험이 열려요`:'무료 사진 분석 1회를 체험할 수 있어요'}</p>
    <div class="subscription-plans">
      <article><h3>1회권</h3><strong>${Number(analysisPassPriceKrw).toLocaleString('ko-KR')}원</strong><p>16개 항목 · 분석 1회<br>기한 없이 쌓여요</p>${!paymentsEnabled?'<small class="subscription-coming">곧 열려요</small><button type="button" class="btn secondary" data-payment-interest="pass">알림 받기</button>':''}</article>
      <article class="subscription-plus"><h3>월 구독</h3><strong>월 ${Number(priceKrw).toLocaleString('ko-KR')}원</strong><p>16개 항목 · 결제 기간마다 ${monthlyAnalyses}회<br>재분석 비교</p>${!paymentsEnabled?'<small class="subscription-coming">곧 열려요</small><button type="button" class="btn secondary" data-payment-interest="subscription">알림 받기</button>':''}</article>
    </div>
    <p class="subscription-free">체크인·기록·루틴·내 화장대는 무료예요. ${access.trialRequiredDays??3}일 체크인 뒤 4개 항목까지 한 번 분석할 수 있어요.</p>
    <p class="subscription-note">표시 가격은 임시값이에요. 실제 결제 전 최종 금액을 다시 알려드릴게요.</p>
    <div class="subscription-terms"><p>1회권은 자동 갱신되지 않아요. 구독은 매월 자동 갱신돼요.</p><details><summary>해지·환불 자세히 보기</summary><p>구독은 Google Play에서 다음 갱신 전에 해지할 수 있어요. 해지 후에도 결제 기간까지 이용할 수 있어요.</p><p>환불은 스토어 정책과 법령에 따라 처리해요. 환불된 1회권은 미사용분만 회수해요.</p><p>실제 구매가 연결되기 전에는 결제가 진행되지 않아요.</p></details></div>
    ${access.tier==='subscription'?`<p class="subscription-until">${esc(until)}까지 이용할 수 있어요${access.autoRenew?' · 자동 갱신 예정':' · 해지됨'}</p>`:''}
    <p class="subscription-pending">결제 연결을 준비 중이에요. 지금은 무료 기능을 계속 이용해 주세요.</p>
    <button type="button" class="btn primary full-width" data-care-section="photo">사진·관리 화면으로 돌아가기</button>
  </section>`;
}
