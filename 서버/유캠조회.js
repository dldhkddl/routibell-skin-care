const API_ORIGIN = 'https://yce-api-01.makeupar.com';
const COST_PATH = '/s2s/v2.0/credit/feature-cost';
const SKIN_ENDPOINTS = new Map(['v2.0', 'v2.1'].map(version => [`${API_ORIGIN}/s2s/${version}/task/skin-analysis`, version]));
const MAX_PAGES = 10;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export class PreparationError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validApiKey(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{8,4096}$/.test(value);
}

export async function readJson(response) {
  if (!response.body) throw new PreparationError('INVALID_RESPONSE', '유캠 응답을 확인할 수 없습니다.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PreparationError('RESPONSE_TOO_LARGE', '유캠 응답 크기가 허용 범위를 넘었습니다.');
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof PreparationError) throw error;
    throw new PreparationError('INVALID_RESPONSE', '유캠 응답 형식을 확인할 수 없습니다.');
  } finally {
    reader.releaseLock();
  }
}

function normalizeCost(item, apiKey) {
  const version = SKIN_ENDPOINTS.get(item?.run_task_url);
  if (!version) return null;
  if (typeof item.description !== 'string' || !item.description.trim() || item.description.length > 500
    || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0
    || !Number.isSafeInteger(item.proc_unit) || item.proc_unit < 1
    || !['result_image', 'second'].includes(item.unit)) {
    throw new PreparationError('INVALID_COST', '피부 분석 가격 형식이 예상과 다릅니다. 가격을 임의로 계산하지 않습니다.');
  }
  return {
    description: item.description.replaceAll(apiKey, '[숨김]'),
    credits: item.amount,
    unit: item.unit,
    quantity: item.proc_unit,
    version,
  };
}

export async function lookupSkinCosts({ apiKey, fetchImpl = fetch, signal = AbortSignal.timeout(30000) }) {
  if (!validApiKey(apiKey)) throw new PreparationError('KEY_REQUIRED', '서버에 올바른 형식의 API 키를 설정해 주세요.', 503);
  const items = [];
  const visited = new Set();
  let token = null;
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      signal.throwIfAborted();
      const url = new URL(COST_PATH, API_ORIGIN);
      url.searchParams.set('page_size', '20');
      if (token !== null) url.searchParams.set('starting_token', token);
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw new PreparationError('AUTH_FAILED', '유캠에서 키 또는 조회 권한을 확인하지 못했습니다. 콘솔에서 키 상태를 확인해 주세요.');
        if (response.status === 429) throw new PreparationError('PROVIDER_LIMIT', '유캠 요청 한도에 도달했습니다. 자동 재시도하지 않습니다.', 429);
        throw new PreparationError('PROVIDER_ERROR', '유캠 가격을 조회하지 못했습니다. 자동 재시도하지 않습니다.');
      }
      const payload = await readJson(response);
      const result = payload?.result;
      if (payload?.status !== 200 || !Array.isArray(result?.skus) || result.skus.length > 20
        || !(result.next_token === null || (typeof result.next_token === 'string' && result.next_token.length > 0 && result.next_token.length <= 1024))) {
        throw new PreparationError('INVALID_RESPONSE', '유캠 가격 목록 형식이 예상과 다릅니다.');
      }
      for (const item of result.skus) {
        const normalized = normalizeCost(item, apiKey);
        if (normalized) items.push(normalized);
      }
      token = result.next_token;
      if (token === null) {
        if (!items.length) throw new PreparationError('NO_SKIN_COST', '가격 목록에 피부 분석 항목이 없습니다. 유캠에 제공 여부를 확인해 주세요.');
        return { items, pages: page + 1, checkedAt: new Date().toISOString() };
      }
      if (visited.has(token)) throw new PreparationError('REPEATED_PAGE', '유캠 가격 목록의 페이지가 반복되어 조회를 중단했습니다.');
      visited.add(token);
    }
    throw new PreparationError('PAGE_LIMIT', '가격 조회의 최대 10페이지 한도에 도달했습니다. 불완전한 가격은 표시하지 않습니다.');
  } catch (error) {
    if (signal.aborted) throw new PreparationError('LOOKUP_TIMEOUT', '가격 조회가 취소되었거나 30초를 초과했습니다. 자동 재시도하지 않습니다.', 504);
    if (error instanceof PreparationError) throw error;
    throw new PreparationError('NETWORK_ERROR', '유캠에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
  }
}
