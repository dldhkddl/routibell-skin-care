import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFlowUI, GOALS } from '../화면/시작흐름.js';

function renderGoals(goals) {
  const previousDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    return createFlowUI({ state: () => ({ effective: { goals } }) }).goals();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('목표 사진 6장은 개별 웹 이미지이며 참조 파일이 존재', () => {
  assert.equal(new Set(GOALS.map(goal => goal.photo)).size, 6);
  assert.equal(GOALS.find(goal=>goal.id==='skin').photo,'피부.webp');
  assert.equal(GOALS.find(goal=>goal.id==='save').photo,'현명한소비.webp');
  assert.equal(GOALS.find(goal=>goal.id==='routine').photo,'꾸준한관리.webp');
  const html = renderGoals({ selected: [], note: '' });
  for (const goal of GOALS) {
    const image = readFileSync(new URL(`../public/목표사진/${goal.photo}`, import.meta.url));
    if(goal.photo.endsWith('.webp')){assert.equal(image.toString('ascii', 0, 4), 'RIFF');assert.equal(image.toString('ascii', 8, 12), 'WEBP');}
    else assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');
    assert.ok(html.includes(`src="/목표사진/${goal.photo}"`));
    assert.ok(html.includes(`aria-labelledby="goal-label-${goal.id}"`));
  }
  assert.ok(!html.includes('목업원본.png'));
});

test('화면 개편 후에도 저장된 목표 선택과 이스케이프된 메모 유지', () => {
  const html = renderGoals({ selected: ['hair', 'save'], note: '</textarea><script>위험</script>' });
  assert.equal((html.match(/ checked/g) ?? []).length, 2);
  assert.match(html, /value="hair"[^>]* checked/);
  assert.match(html, /value="save"[^>]* checked/);
  assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;위험&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('최대 선택·저장 동작·가상 이미지 안내를 유지', () => {
  const html = renderGoals({ selected: [], note: '' });
  assert.ok(html.includes('최대 3개 선택'));
  assert.ok(html.includes('aria-label="목표 저장하고 내 루틴 보기"'));
  assert.ok(html.includes('실제 분석이나 가상체험 결과가 아니에요'));
  assert.ok(!html.includes('건너뛰기'));
});

test('첫 목표에서는 헤어·메이크업·이미지도 목표로 선택할 수 있다',()=>{
  const html=renderGoals({selected:[],note:''});
  for(const id of ['hair','makeup','style']){
    assert.match(html,new RegExp(`value="${id}"`));
    assert.doesNotMatch(html,new RegExp(`value="${id}"[^>]* disabled`));
  }
  assert.doesNotMatch(html,/class="goal-soon"/);
  assert.match(html,/사진 분석은 피부만 해요/);
  assert.match(html,/저장하고 내 루틴 보기/);
  assert.match(html,/사진 분석은 3일 체크인하면 무료로 열려요/);
});
