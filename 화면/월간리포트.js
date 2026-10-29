import { APP } from '../앱설정.js';
import { icon } from './아이콘.js';

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const money = value => `${value.toLocaleString('ko-KR')}원`;
const shortDate = value => `${Number(value.slice(5, 7))}.${Number(value.slice(8, 10))}`;
const dayLabel = value => `${Number(value.slice(8, 10))}일`;
const within = (date, start, end) => date >= start && date <= end;
const markLabel = value => value === true ? '완료' : value === false ? '하지 않음' : '미기록';
const markClass = value => value === true ? 'done' : value === false ? 'skipped' : 'unknown';

export function summarizeMonthlyReport(sample) {
  const startTime = Date.parse(`${sample.start}T00:00:00Z`);
  const endTime = Date.parse(`${sample.end}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime || endTime - startTime > 30 * 86400000) {
    throw new Error('리포트 기간은 1~31일이어야 합니다.');
  }
  const days = Array.from({ length: (endTime - startTime) / 86400000 + 1 }, (_, index) => {
    const date = new Date(startTime + index * 86400000).toISOString().slice(0, 10);
    const entry = sample.routine.find(item => item.date === date);
    return { date, morning: entry?.morning ?? null, evening: entry?.evening ?? null };
  });
  const records = sample.records.filter(item => within(item.date, sample.start, sample.end));
  const rated = records.filter(item => Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5);
  const total = records.reduce((sum, item) => sum + item.amount, 0);
  const budget = sample.budget ?? null;
  const remaining = budget === null ? null : budget - total;
  const marks = days.flatMap(day => [day.morning, day.evening]);
  const done = marks.filter(value => value === true).length;
  const skipped = marks.filter(value => value === false).length;
  const feedback = sample.feedback.filter(item => within(item.date, sample.start, sample.end));
  return {
    days, records, total, budget, remaining,
    average: rated.length ? rated.reduce((sum, item) => sum + item.rating, 0) / rated.length : null,
    ratedCount: rated.length,
    unratedCount: records.length - rated.length,
    done, skipped, unknown: marks.length - done - skipped,
    opportunities: marks.length, checkRate: Math.round(done / marks.length * 100),
    morningDone: days.filter(day => day.morning === true).length,
    eveningDone: days.filter(day => day.evening === true).length,
    feedbackCount: feedback.length,
    comfortable: feedback.filter(item => item.feeling === 'comfortable').length,
    dry: feedback.filter(item => item.feeling === 'dry').length
  };
}

function sourceBadge(label, real = false) {
  return `<span class="source-badge${real ? ' source-real' : ''}">${escapeText(label)}</span>`;
}

function sectionHeading(number, title, id, badge = '가상 기록') {
  return `<div class="section-heading"><div><span class="section-number">${escapeText(number)}</span><h2 id="${escapeText(id)}">${escapeText(title)}</h2></div>${sourceBadge(badge)}</div>`;
}

function routineDay(day) {
  const marks = [day.morning, day.evening].map(value => `<span class="day-mark ${markClass(value)}" aria-hidden="true">${value === true ? icon('check') : value === false ? '−' : '·'}</span>`).join('');
  return `<li><span class="day-number">${dayLabel(day.date)}</span><span class="day-marks" aria-hidden="true">${marks}</span><span class="sr-only">아침 ${markLabel(day.morning)}, 저녁 ${markLabel(day.evening)}</span></li>`;
}

export function renderMonthlySample(sample, observation) {
  const report = summarizeMonthlyReport(sample);
  const month = Number(sample.start.slice(5, 7));
  const period = `${sample.start.replaceAll('-', '.')} — ${sample.end.replaceAll('-', '.')}`;
  const budgetText = report.budget === null ? '미설정' : money(report.budget);
  const balanceLabel = report.remaining !== null && report.remaining < 0 ? '예산 초과' : '남은 예산';
  const balance = report.remaining === null ? '미설정' : money(Math.abs(report.remaining));
  const budgetRate = report.budget > 0 ? Math.min(100, report.total / report.budget * 100) : 0;
  const planBudget = sample.nextBudget ?? null;
  const reviewLimit = planBudget === null ? null : Math.min(sample.purchaseReview, planBudget);
  const unassigned = planBudget === null ? null : planBudget - reviewLimit;
  const scoreRows = observation.concerns.map(concern => `<tr><th scope="row">${escapeText(concern.name)}<small>${escapeText(concern.code)}</small></th><td>${escapeText(concern.raw)}</td></tr>`).join('');
  const spendingRows = report.records.map(record => `<tr><td>${shortDate(record.date)}</td><th scope="row">${escapeText(record.title)}</th><td>${money(record.amount)}</td><td>${record.rating === null ? '<span class="muted">미평가</span>' : `${escapeText(record.rating)} / 5`}</td></tr>`).join('');
  const inventory = sample.inventory.map(item => `<li><span class="inventory-icon">${icon(item.icon)}</span><div><strong>${escapeText(item.title)}</strong><span>사용자가 적은 잔량</span></div><strong>${escapeText(item.remaining)}<small>%</small></strong></li>`).join('');
  return `
    <a class="skip-link" href="#report-main">본문으로 바로가기</a>
    <div class="sample-banner">${icon('lock')}<span><strong>샘플 리포트</strong> · 실제 관찰 1회 + 가상 월간 기록 · 사용자 기록에 저장되지 않아요</span></div>
    <header class="report-header">
      <a class="wordmark" href="/#home" aria-label="${APP.name} 앱 홈으로">${icon('diamond')}<span>${APP.englishName}</span></a>
      <span class="edition">MONTHLY LETTER / 01</span>
    </header>
    <main id="report-main">
      <section class="report-hero" aria-labelledby="report-title">
        <div class="hero-copy"><p class="eyebrow">나를 위한 기록, 다음을 위한 선택</p><h1 id="report-title">${month}월, 나의<br>뷰티 리포트<span>.</span></h1>
          <p class="hero-description">무엇이 좋아졌다고 서두르기보다,<br><strong>무엇을 이어갈지</strong> 함께 정리해요.</p>
          <p class="period">${icon('calendar')} ${escapeText(period)} <span>중간 집계</span></p>
          <a class="primary-link" href="#next-month">다음 달 제안 먼저 보기 ${icon('arrow')}</a>
        </div>
        <div class="hero-summary"><span class="source-badge">가상 기록 요약</span><div class="check-ring" style="--checked:${report.checkRate}%"><div><span>루틴 체크율</span><strong>${report.checkRate}<small>%</small></strong><span>${report.done} / ${report.opportunities}회</span></div></div>
          <p>많이 사는 것보다,<br><strong>내 기록을 쌓는 한 달.</strong></p><span class="hero-footnote">완료 체크 비율이지 피부 개선율은 아니에요.</span>
        </div>
      </section>

      <nav class="report-nav" aria-label="리포트 목차"><a href="#monthly-summary">한눈에 보기</a><a href="#photo-observation">사진 관찰</a><a href="#routine-review">관리 기록</a><a href="#next-month">다음 달</a></nav>

      <section class="overview" id="monthly-summary" aria-label="샘플 월간 요약">
        <div class="overview-caption"><h2>이번 달, 한눈에</h2>${sourceBadge('아래 숫자는 모두 가상 기록')}</div>
        <div class="metric-grid">
          <article>${icon('wallet')}<span>기록한 소비</span><strong>${money(report.total)}</strong><small>예산 ${budgetText}</small></article>
          <article>${icon('calendar')}<span>루틴 완료 체크</span><strong>${report.done}<em> / ${report.opportunities}회</em></strong><small>미기록 ${report.unknown}회 별도 표시</small></article>
          <article>${icon('heart')}<span>직접 남긴 만족도</span><strong>${report.average === null ? '미평가' : report.average.toFixed(1)}${report.average === null ? '' : '<em> / 5</em>'}</strong><small>평가 ${report.ratedCount}건 · 미평가 ${report.unratedCount}건</small></article>
        </div>
      </section>

      <section class="observation-card" id="photo-observation" aria-labelledby="observation-title">
        <div class="observation-intro"><div class="observation-icon">${icon('face')}</div><div><p class="eyebrow">어제 확인한 결과, 그대로</p><h2 id="observation-title">사진 관찰은 기준점으로만</h2></div>${sourceBadge('실제 결과 · 1회', true)}</div>
        <div class="observation-body"><div><p><strong>${escapeText(observation.date.replaceAll('-', '.'))} · ${escapeText(observation.source)}</strong></p><p>전날 검토한 6항목 중 <strong>홍조·모공·피부결 3항목</strong>만 옮겼어요. 새 사진을 보내거나 다시 분석하지 않았어요.</p><details class="raw-details"><summary>관찰 원점수와 출처 보기 ${icon('chevron')}</summary><table><caption>대화에서 검토한 공급자 raw_score</caption><thead><tr><th scope="col">관찰 항목</th><th scope="col">원점수</th></tr></thead><tbody>${scoreRows}</tbody></table><p>대화에서 확인한 값의 수동 전사본이며, 원본 응답 파일을 새로 검증한 결과는 아닙니다. 보정 점수(ui_score), 피부 나이, 종합 점수는 사용하지 않았어요.</p></details></div>
          <aside class="comparison-note">${icon('chart')}<strong>변화 판단은 아직 보류</strong><p>사진 1회로 피부가 좋아졌는지, 어떤 제품이 효과가 있었는지 알 수 없어요. 가상 소비·관리 기록과도 연결해 해석하지 않아요.</p><span>전후 변화 · 상위 비율 · 뷰티 ROI 표시 안 함</span></aside></div>
        <p class="observation-footnote">사진 조건에 영향을 받는 참고 관찰이며 의료 진단이 아닙니다. 우리 앱의 실제 API 연결 시험을 통과했다는 뜻도 아닙니다.</p>
      </section>

      <div class="report-columns">
        <section class="report-card" id="routine-review" aria-labelledby="routine-title">
          ${sectionHeading('01', '꾸준함을 먼저 봐요', 'routine-title')}
          <p class="section-description">매일 아침·저녁 중 완료를 누른 기록이에요.<br>비어 있는 날을 실패로 보지 않아요.</p>
          <div class="routine-totals"><span>${icon('sun')} 아침 <strong>${report.morningDone} / ${report.days.length}</strong></span><span>${icon('moon')} 저녁 <strong>${report.eveningDone} / ${report.days.length}</strong></span></div>
          <ol class="routine-calendar" aria-label="날짜별 아침과 저녁 샘플 체크">${report.days.map(routineDay).join('')}</ol>
          <div class="calendar-legend"><span><i class="done"></i>완료 ${report.done}</span><span><i class="skipped"></i>하지 않음 ${report.skipped}</span><span><i class="unknown"></i>미기록 ${report.unknown}</span></div>
          <p class="card-note">각 날짜의 왼쪽은 아침, 오른쪽은 저녁이에요. 분모는 ${report.days.length}일 × 2회이며, 미기록은 실제 실행 여부를 모르는 상태예요.</p>
          <div class="feedback-box"><span>${icon('heart')} 내가 느낀 사용감</span><strong>편안함 ${report.comfortable}건 <i>·</i> 건조한 느낌 ${report.dry}건</strong><p>입력 ${report.feedbackCount}건만 집계했어요. 주관적인 느낌이며 사진 점수나 제품 효과와 합산하지 않아요.</p></div>
        </section>

        <section class="report-card" aria-labelledby="spending-title">
          ${sectionHeading('02', '쓴 돈보다, 다음 선택', 'spending-title')}
          <p class="section-description">이번 달 소비와 아직 평가하지 않은 제품을<br>분리해서 확인해요.</p>
          <div class="spending-total"><span>기록한 소비</span><strong>${money(report.total)}</strong></div>
          ${report.budget > 0 ? `<div class="budget-meter" role="img" aria-label="예산 ${budgetText} 중 ${money(report.total)} 사용"><span style="width:${budgetRate}%"></span></div>` : ''}
          <div class="budget-caption"><span>예산 ${budgetText}</span><strong>${balanceLabel} ${balance}</strong></div>
          <div class="table-scroll" role="region" aria-label="가상 소비 내역" tabindex="0"><table class="spending-table"><caption class="sr-only">샘플 소비 내역과 직접 남긴 만족도</caption><thead><tr><th scope="col">날짜</th><th scope="col">항목</th><th scope="col">금액</th><th scope="col">만족도</th></tr></thead><tbody>${spendingRows}</tbody></table></div>
          <p class="card-note">남은 예산은 절약액이나 써야 할 돈이 아니에요. 만족도는 평가한 ${report.ratedCount}건만 계산하며 미평가는 0점으로 넣지 않아요.</p>
          <div class="feedback-box"><span>${icon('book')} 다음에 남길 기록</span><strong>자외선 차단제는 아직 미평가</strong><p>충분히 사용한 뒤 느낌을 남겨요. 미평가라는 이유로 다른 제품을 사도록 권하지 않아요.</p></div>
        </section>
      </div>

      <section class="next-section" id="next-month" aria-labelledby="next-title">
        <div class="next-heading"><div><p class="eyebrow">NEXT CHAPTER / 다음 달의 나에게</p><h2 id="next-title">새로 사기 전에,<br>지금의 기록부터.</h2></div>${sourceBadge('가상 기록을 바탕으로 쓴 예시 제안')}</div>
        <div class="next-grid"><div class="next-actions">
          <article><span class="action-number">01</span><div><span class="action-tag">유지 검토</span><h3>세안제·보습제는 보유분부터 확인</h3><p>샘플 잔량이 각각 35%, 60% 남아 있어요. 실제 사용감·사용기한을 확인하고, 불편하다면 이 제안보다 불편함 확인을 우선해요.</p><small>근거 · 아래 보유 제품의 가상 잔량</small></div></article>
          <article><span class="action-number">02</span><div><span class="action-tag">구매 보류</span><h3>차단제 재고와 사용감 먼저 확인</h3><p>잔량 15%라는 기록만으로 소진일은 몰라요. 구매를 확정하지 않고, 필요할 때만 예산 안에서 다시 비교해요.</p><small>근거 · 가상 잔량 15% / 만족도 미평가</small></div></article>
          <article><span class="action-number">03</span><div><span class="action-tag">기록 이어가기</span><h3>완료 체크와 사용감을 짧게 남기기</h3><p>미기록 ${report.unknown}회는 실행 여부를 몰라요. 다음 달도 아침·저녁 체크와 직접 느낀 사용감을 따로 기록해요.</p><small>근거 · 가상 루틴 ${report.opportunities}회 중 미기록 ${report.unknown}회</small></div></article>
        </div><aside class="next-budget"><span class="next-budget-label">다음 달 예산 검토안</span><strong class="next-budget-total">${planBudget === null ? '미설정' : money(planBudget)}</strong><p>샘플의 이번 달 예산 그대로</p><dl><div><dt>구매 확정</dt><dd>0원</dd></div><div><dt>재고 확인 후 구매 검토 상한</dt><dd>${reviewLimit === null ? '미정' : money(reviewLimit)}</dd></div><div><dt>아직 배정하지 않은 금액</dt><dd>${unassigned === null ? '미정' : money(unassigned)}</dd></div></dl><div class="budget-note">${icon('lock')}<span>검토 상한은 샘플 구매가를 사용한 예시예요. 현재 판매가가 아니며, 배정하지 않은 금액도 절약액이 아니에요.</span></div></aside></div>
        <div class="inventory-section"><div><h3>제안에 참고한 보유 제품</h3><p>가상 잔량 · 실제 소진일을 예측하지 않아요</p></div><ul>${inventory}</ul></div>
        <p class="proposal-note">이 제안은 화면 검토용으로 미리 작성한 예시입니다. 앱의 AI 자동 생성·예산 변경·제품 주문은 실행하지 않아요.</p>
      </section>

      <section class="provenance" aria-labelledby="provenance-title"><h2 id="provenance-title">무엇이 실제이고, 무엇이 예시인가요?</h2><div><p><strong>실제 관찰</strong>어제 검토한 사진 분석 1회의 원점수 3개만 사용했어요. 새 분석·사진 전송·크레딧 사용은 없어요.</p><p><strong>가상 월간 기록</strong>소비·만족도·루틴·사용감·재고·예산·제안은 화면 검토용 가상 자료예요. ${shortDate(sample.end)}까지의 중간 집계이며 한 달 전체 성과가 아니에요.</p><p><strong>아직 없는 기능</strong>계정별 자동 월간 리포트·구독 결제·영수증 자동 입력은 이 화면에 구현하지 않았어요. 실제 기록을 불러오거나 변경하지 않아요.</p></div></section>
      <footer class="report-footer"><span>${icon('diamond')} 더 많이 사는 대신, 더 잘 선택하도록.</span><a href="/#care">실제 앱으로 돌아가기 ${icon('arrow')}</a></footer>
    </main>`;
}
