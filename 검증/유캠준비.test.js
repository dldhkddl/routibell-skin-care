import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { EventEmitter } from 'node:events';
import { lookupSkinCosts, validApiKey } from '../서버/유캠조회.js';
import { createPreparationServer, listenPreparationServer, startupErrorMessage } from '../서버/유캠준비.js';

const fakeKey = 'local-test-only-not-a-real-key';
const skinCost = extra => ({
  description: 'AI Skin Analysis for SD 1~4 concerns', amount: 9, proc_unit: 1, unit: 'result_image',
  run_task_url: 'https://yce-api-01.makeupar.com/s2s/v2.0/task/skin-analysis', ...extra,
});
const pageResponse = (skus = [skinCost()], nextToken = null) => Response.json({ status: 200, result: { skus, next_token: nextToken } });
const expectCode = code => error => error.code === code;

async function startServer(context, options = {}) {
  let calls = 0;
  const server = createPreparationServer({
    env: { YOUCAM_API_KEY: fakeKey, YOUCAM_ALLOW_LOOKUP: '1' },
    fetchImpl: async () => { calls += 1; return pageResponse(); },
    ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(`${origin}/api/status`)).json();
  const post = (body = { consent: true }, headers = {}, path = '/api/feature-cost') => new Promise((resolve, reject) => {
    const outgoing = request(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Local-Token': status.localToken, ...headers },
    }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  return { origin, status, post, calls: () => calls };
}

test('가격 조회는 고정된 공식 주소의 GET만 사용하고 키를 인증 헤더에만 넣음', async () => {
  const requests = [];
  const result = await lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    return requests.length === 1
      ? pageResponse([{ ...skinCost(), run_task_url: 'https://other.example/task' }], 'token/with+symbols=')
      : pageResponse([skinCost({ description: `설명 ${fakeKey}` })]);
  } });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(new URL(request.url).origin, 'https://yce-api-01.makeupar.com');
    assert.equal(new URL(request.url).pathname, '/s2s/v2.0/credit/feature-cost');
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.headers.Authorization, `Bearer ${fakeKey}`);
    assert.equal(request.options.body, undefined);
    assert.ok(!request.url.includes(fakeKey));
  }
  assert.equal(new URL(requests[1].url).searchParams.get('starting_token'), 'token/with+symbols=');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].credits, 9);
  assert.equal(result.items[0].version, 'v2.0');
  assert.ok(!JSON.stringify(result).includes(fakeKey));
});

test('키 미설정·공백·개행·Bearer 접두사는 전송 전에 거절', async () => {
  for (const apiKey of ['', 'short', `Bearer ${fakeKey}`, `${fakeKey}\n`, `${fakeKey} `]) {
    assert.equal(validApiKey(apiKey), false);
    await assert.rejects(lookupSkinCosts({ apiKey, fetchImpl: () => assert.fail('외부 호출 금지') }), expectCode('KEY_REQUIRED'));
  }
  assert.equal(validApiKey(fakeKey), true);
});

test('유캠 인증·한도·통신 오류의 원문과 키를 반환하지 않고 재시도하지 않음', async () => {
  for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'AUTH_FAILED'], [429, 'PROVIDER_LIMIT'], [500, 'PROVIDER_ERROR']]) {
    let count = 0;
    await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => {
      count += 1;
      return new Response(fakeKey, { status });
    } }), error => error.code === code && !error.message.includes(fakeKey));
    assert.equal(count, 1);
  }
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => { throw Error(fakeKey); } }), error => error.code === 'NETWORK_ERROR' && !error.message.includes(fakeKey));
});

test('가격 0은 유지하고 가격 누락·음수·문자열·잘못된 과금 단위는 실패', async () => {
  const result = await lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => pageResponse([skinCost({ amount: 0 })]) });
  assert.equal(result.items[0].credits, 0);
  for (const extra of [{ amount: undefined }, { amount: -1 }, { amount: '9' }, { proc_unit: 0 }, { unit: 'unknown' }, { description: '' }]) {
    await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => pageResponse([skinCost(extra)]) }), expectCode('INVALID_COST'));
  }
});

test('잘못된 응답·빠진 페이지 정보·피부 항목 없음은 성공으로 표시하지 않음', async () => {
  for (const payload of [{}, { status: 200, result: { skus: [] } }, { status: 200, result: { skus: [], next_token: '' } }, { status: 401 }]) {
    await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => Response.json(payload) }), expectCode('INVALID_RESPONSE'));
  }
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => new Response('{') }), expectCode('INVALID_RESPONSE'));
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => pageResponse([]) }), expectCode('NO_SKIN_COST'));
});

test('반복 페이지·최대 페이지·응답 크기 제한은 불완전한 결과 대신 실패', async () => {
  let count = 0;
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => { count += 1; return pageResponse([skinCost()], 'same'); } }), expectCode('REPEATED_PAGE'));
  assert.equal(count, 2);
  count = 0;
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => { count += 1; return pageResponse([skinCost()], String(count)); } }), expectCode('PAGE_LIMIT'));
  assert.equal(count, 10);
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, fetchImpl: async () => new Response(' '.repeat(1024 * 1024 + 1)) }), expectCode('RESPONSE_TOO_LARGE'));
});

test('취소된 조회는 새 외부 요청을 하지 않음', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookupSkinCosts({ apiKey: fakeKey, signal: controller.signal, fetchImpl: () => assert.fail('외부 호출 금지') }), expectCode('LOOKUP_TIMEOUT'));
});

test('상태·정적 화면 조회는 외부 호출도 키 노출도 없음', async context => {
  const local = await startServer(context);
  assert.equal(local.status.keyConfigured, true);
  assert.equal(local.status.analysisEnabled, false);
  assert.ok(!JSON.stringify(local.status).includes(fakeKey));
  for (const path of ['/', '/ready.js', '/ready.css', '/api/status']) {
    const response = await fetch(`${local.origin}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.ok(!(await response.text()).includes(fakeKey));
  }
  assert.equal(local.calls(), 0);
});

test('기본 설정에서는 키가 있어도 외부 조회 차단', async context => {
  const local = await startServer(context, { env: { YOUCAM_API_KEY: fakeKey } });
  assert.equal(local.status.lookupAllowed, false);
  assert.equal((await local.post()).status, 403);
  assert.equal(local.calls(), 0);
});

test('조회 허용만으로는 키 없이 호출하지 않음', async context => {
  const local = await startServer(context, { env: { YOUCAM_ALLOW_LOOKUP: '1' } });
  assert.equal(local.status.keyConfigured, false);
  assert.equal((await local.post()).status, 503);
  assert.equal(local.calls(), 0);
});

test('잘못된 Host·Origin·로컬 토큰·교차 사이트 요청은 차단', async context => {
  const local = await startServer(context);
  for (const headers of [{ Host: 'attacker.example' }, { Origin: 'https://attacker.example' }, { Origin: 'null' }, { Origin: '' }, { 'X-Local-Token': 'wrong' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await local.post({ consent: true }, headers)).status, 403, JSON.stringify(headers));
  }
  assert.equal(local.calls(), 0);
});

test('동의 없음·임의 필드·사진·큰 본문·폼 요청은 외부로 전달하지 않음', async context => {
  const local = await startServer(context);
  for (const body of [{ consent: false }, { consent: true, photo: 'image' }, {}, 'not-json']) assert.equal((await local.post(body)).status, 400);
  assert.equal((await local.post({ consent: true }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await local.post({ consent: true, photo: 'a'.repeat(2048) })).status, 413);
  for (const path of ['/api/analyze', '/api/upload', '/.env', '/서버/유캠준비.js']) assert.equal((await local.post({}, {}, path)).status, 404);
  assert.equal(local.calls(), 0);
});

test('명시적 동의 후 조회하며 30초 간격·실행당 5회 제한', async context => {
  let timestamp = 100000;
  const local = await startServer(context, { now: () => timestamp });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await local.post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items[0].credits, 9);
    assert.equal((await local.post()).status, 429);
    timestamp += 30001;
  }
  assert.equal((await local.post()).status, 429);
  assert.equal(local.calls(), 5);
});

test('동시에 중복 조회를 실행하지 않음', async context => {
  let finish;
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const local = await startServer(context, { fetchImpl: () => {
    started();
    return new Promise(resolve => { finish = () => resolve(pageResponse()); });
  } });
  const first = local.post();
  await began;
  assert.equal((await local.post()).status, 409);
  finish();
  assert.equal((await first).status, 200);
});

test('공급자 오류는 HTTP 응답에서도 키와 원문을 숨김', async context => {
  const local = await startServer(context, { fetchImpl: async () => new Response(fakeKey, { status: 401 }) });
  const response = await local.post();
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.ok(body.includes('AUTH_FAILED'));
  assert.ok(!body.includes(fakeKey));
});

test('사용 중인 포트는 기존 서버를 그대로 두고 다른 루프백 포트로 시작', async context => {
  const existing = await startServer(context, { env: {} });
  const server = createPreparationServer({ env: { YOUCAM_API_KEY: fakeKey }, fetchImpl: () => assert.fail('외부 호출 금지') });
  context.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const started = await listenPreparationServer(server, Number(new URL(existing.origin).port));
  assert.equal(started.switchedPort, true);
  assert.notEqual(started.url, existing.origin);
  assert.equal(server.address().address, '127.0.0.1');
  const original = await (await fetch(`${existing.origin}/api/status`)).json();
  const current = await (await fetch(`${started.url}/api/status`)).json();
  assert.equal(original.keyConfigured, false);
  assert.equal(current.keyConfigured, true);
  assert.equal(current.lookupAllowed, false);
  assert.equal(current.analysisEnabled, false);
  const wrongOrigin = await fetch(`${started.url}/api/feature-cost`, {
    method: 'POST', headers: { Origin: existing.origin, 'X-Local-Token': current.localToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(server.listeners('error').some(listener => listener.name === 'failed'), false);
  assert.equal(server.listeners('listening').some(listener => listener.name === 'ready'), false);
});

test('빈 포트에서 시작하면 실제 열린 주소를 반환', async context => {
  const server = createPreparationServer({ env: {} });
  context.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const started = await listenPreparationServer(server, 0);
  assert.equal(started.switchedPort, false);
  assert.equal(started.url, `http://127.0.0.1:${server.address().port}`);
  assert.equal((await fetch(started.url)).status, 200);
});

test('권한 오류는 다른 포트로 재시도하지 않으며 원문에 포함된 키도 숨김', async () => {
  const server = new EventEmitter();
  const failure = Object.assign(Error(fakeKey), { code: 'EACCES' });
  let attempts = 0;
  server.listen = () => { attempts += 1; queueMicrotask(() => server.emit('error', failure)); };
  await assert.rejects(listenPreparationServer(server), error => error === failure);
  assert.equal(attempts, 1);
  assert.equal(server.listenerCount('error'), 0);
  assert.equal(server.listenerCount('listening'), 0);
  const message = startupErrorMessage(failure);
  assert.ok(message.includes('권한'));
  assert.ok(!message.includes(fakeKey));
  assert.ok(!message.includes('포트가 이미 사용'));
});

test('동기 시작 오류와 대체 포트 실패도 성공으로 표시하지 않음', async () => {
  const invalid = new EventEmitter();
  invalid.listen = () => { throw Object.assign(Error('검증용'), { code: 'ERR_SOCKET_BAD_PORT' }); };
  await assert.rejects(listenPreparationServer(invalid), expectCode('ERR_SOCKET_BAD_PORT'));
  assert.equal(invalid.listenerCount('error'), 0);
  const blocked = new EventEmitter();
  let attempts = 0;
  blocked.listen = () => { attempts += 1; queueMicrotask(() => blocked.emit('error', Object.assign(Error('검증용'), { code: 'EADDRINUSE' }))); };
  await assert.rejects(listenPreparationServer(blocked), expectCode('EADDRINUSE'));
  assert.equal(attempts, 2);
  assert.ok(startupErrorMessage({ code: 'EADDRINUSE' }).includes('로컬 포트'));
});
