const element = id => document.getElementById(id);
let settings = null;
let pending = false;

function updateButton() {
  element('lookup').disabled = pending || !settings?.keyConfigured || !settings.lookupAllowed
    || !settings.remainingLookups || settings.busy || settings.retryAfterSeconds > 0 || !element('consent').checked;
}

async function refreshSettings() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw Error('서버 상태를 확인하지 못했습니다.');
    settings = await response.json();
    element('key-status').textContent = settings.keyConfigured ? '설정됨' : '미설정';
    element('lookup-status').textContent = settings.lookupAllowed ? '버튼을 누를 때만 조회' : '꺼짐';
    document.querySelector('#analysis-status').textContent = settings.analysisEnabled ? '앱에서 별도 동의 후 1회 가능' : '꺼짐 · 시작 창에서 별도 허용 필요';
    element('allowance').textContent = `이번 실행에서 남은 조회: ${settings.remainingLookups}회${settings.retryAfterSeconds ? ` · ${settings.retryAfterSeconds}초 후 설정 상태를 새로 확인하세요.` : ''}`;
  } catch {
    settings = null;
    element('key-status').textContent = '확인 불가';
    element('lookup-status').textContent = '확인 불가';
    element('allowance').textContent = '서버가 켜져 있는지 확인한 뒤 설정 상태를 새로 확인해 주세요.';
  }
  updateButton();
}

function displayCosts(result) {
  const container = element('result');
  container.replaceChildren();
  const checked = document.createElement('p');
  checked.className = 'note';
  checked.textContent = `조회 시각: ${new Date(result.checkedAt).toLocaleString('ko-KR')} · ${result.pages}페이지 확인`;
  container.append(checked);
  for (const item of result.items) {
    const card = document.createElement('article');
    card.className = 'cost';
    const title = document.createElement('h3');
    title.textContent = item.description;
    const price = document.createElement('p');
    price.textContent = `${item.quantity}${item.unit === 'second' ? '초' : '개 결과 이미지'}당 ${item.credits.toLocaleString('ko-KR')} 크레딧`;
    const version = document.createElement('p');
    version.className = 'note';
    version.textContent = `가격표의 API 버전: ${item.version} · 다른 버전·항목 조합에 같은 가격을 가정하지 않습니다.`;
    card.append(title, price, version);
    container.append(card);
  }
  container.hidden = false;
}

element('consent').addEventListener('change', updateButton);
element('refresh').addEventListener('click', refreshSettings);
element('lookup').addEventListener('click', async () => {
  if (element('lookup').disabled) return;
  pending = true;
  updateButton();
  element('message').className = '';
  element('message').textContent = '유캠 가격표를 조회하고 있습니다. 사진은 전송하지 않습니다.';
  element('result').replaceChildren();
  element('result').hidden = true;
  try {
    const response = await fetch('/api/feature-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Local-Token': settings.localToken },
      body: JSON.stringify({ consent: true }),
      signal: AbortSignal.timeout(35000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error?.message ?? '가격을 확인하지 못했습니다.');
    displayCosts(result);
    element('message').textContent = '인증·가격 조회에 성공했습니다. 사진 분석은 실행하지 않았습니다.';
  } catch (error) {
    element('message').className = 'error';
    element('message').textContent = error.name === 'TimeoutError' ? '조회 시간이 초과되었습니다. 자동 재시도하지 않습니다.' : error.message;
  } finally {
    pending = false;
    element('consent').checked = false;
    await refreshSettings();
  }
});

await refreshSettings();
