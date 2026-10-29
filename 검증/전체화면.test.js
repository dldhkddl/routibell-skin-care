import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { EMPTY, CATEGORIES } from '../화면/계산.js';
import { blankPlan } from '../화면/계획계산.js';
import { createFlowUI } from '../화면/시작흐름.js';
import { createLifeUI } from '../화면/생활계획.js';
import { PRODUCTS } from '../화면/제품목록.js';
import { isPrivateServerPath } from '../서버/환경설정.js';
import { ringGradient, spendingPortfolio, planPortfolio, monthlyTrend, trendChart, lifetimeStats } from '../화면/시각요소.js';

const record = (id, date, amount, rating = null) => ({id,date,amount,rating,category:'cosmetic',title:'확인용 크림',repurchase:null,memo:''});
const renderWithDocument = callback => {
  const previous = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try { return callback(); }
  finally { if(previous===undefined)delete globalThis.document; else globalThis.document=previous; }
};

test('도넛은 빈 데이터·0원을 임의의 비중으로 채우지 않음', () => {
  assert.equal(ringGradient([]),'#edf0f5');
  assert.equal(ringGradient([{amount:0,color:'#ff0000'}]),'#edf0f5');
  assert.equal(ringGradient([{amount:25,color:'#ff0000'},{amount:75,color:'#0000ff'}]),'conic-gradient(#ff0000 0% 25%,#0000ff 25% 100%)');
  assert.ok(spendingPortfolio(EMPTY(),'2026-09').includes('월 예산 미설정'));
  assert.ok(spendingPortfolio({...EMPTY(),budgets:{'2026-09':0}},'2026-09').includes('내 예산 0원'));
  assert.ok(planPortfolio(blankPlan(),false).includes('미설정'));
  assert.ok(!planPortfolio(blankPlan(),true).includes('미설정'));
});

test('예산 초과는 음수 원호 대신 실제 지출과 초과 안내로 표시', () => {
  const data={...EMPTY(),budgets:{'2026-09':10000},records:[record('one','2026-09-01',15000)]};
  const html=spendingPortfolio(data,'2026-09');
  assert.ok(html.includes('5,000원 더 사용'));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.ok(!html.includes('남은 예산'));
});

test('월별 추이는 연도를 넘겨 집계하고 미평가를 0점으로 바꾸지 않음', () => {
  const data={...EMPTY(),records:[record('one','2025-12-15',10000,4),record('two','2026-01-03',0),record('three','2026-02-11',5000,2)]};
  const history=monthlyTrend(data,'2026-02',3);
  assert.deepEqual(history.map(item=>item.month),['2025-12','2026-01','2026-02']);
  assert.deepEqual(history.map(item=>item.average),[4,null,2]);
  assert.equal(history[1].count,1);
  assert.equal((trendChart(data,'2026-02').match(/class="satisfaction-line"/g)??[]).length,2);
});

test('마이 화면 집계는 모든 실제 기록과 평가가 있는 기록만 사용', () => {
  const data={...EMPTY(),records:[record('one','2026-08-01',20000,5),{...record('two','2026-09-01',10000),repurchase:true}]};
  assert.deepEqual(lifetimeStats(data),{total:30000,count:2,rated:1,average:5,repurchase:1});
  assert.equal(lifetimeStats(EMPTY()).average,null);
});

test('시작·미리보기는 고해상도 자산을 쓰며 AI 결과를 약속하지 않음', () => {
  const ui=renderWithDocument(()=>createFlowUI({state:()=>({effective:EMPTY()})}));
  assert.ok(ui.welcome().includes('/화면사진/시작화면.webp'));
  assert.ok(!ui.overview().includes('goal-photo'));
  assert.ok(ui.preview().includes('가상체험 결과는 아니에요'));
  assert.ok(ui.preview().includes('AI로 만든 스타일 참고 이미지'));
  assert.ok(!ui.preview().includes('준비 중'));
  assert.ok(!ui.preview().includes('PC 로컬 시험'));
  assert.ok(!ui.preview().includes('type="file"'));
  assert.ok(readFileSync(new URL('../public/화면사진/시작화면.webp',import.meta.url)).length>0);
});

test('계획 메뉴를 나눠도 입력·저장·보유 제품·사용 경험·일정 영역을 보존', () => {
  const data=EMPTY();
  const ui=renderWithDocument(()=>createLifeUI({state:()=>({data,effective:data,demo:false,busy:false,storageError:false})}));
  const html=ui.render();
  for(const panel of ['plan','inventory','stats','schedules'])assert.ok(html.includes(`id="life-${panel}"`));
  for(const category of CATEGORIES)assert.ok(html.includes(`name="amount-${category.id}"`));
  assert.ok(html.includes('id="plan-form"'));
  assert.ok(html.includes('data-life-tab="plan" aria-pressed="true"'));
  assert.ok(html.includes('id="life-inventory" hidden'));
});

test('공식몰 제품 사진은 공개 자산에서 빠지고 제품 비교 화면은 경로로 열리지 않음', () => {
  assert.ok(PRODUCTS.every(product=>!Object.hasOwn(product,'image')));
  assert.equal(existsSync(new URL('../public/제품사진',import.meta.url)),false);
  assert.ok(readdirSync(new URL('../보관/제품사진',import.meta.url)).length>0);
  assert.equal(isPrivateServerPath('/보관/제품사진/순정크림.jpg'),true);
  const app=readFileSync(new URL('../화면/앱.js',import.meta.url),'utf8');
  assert.ok(!app.match(/const routes=\[[^\n]*'wishes'/));
  for(const filename of ['스타일.css','시작화면.css','목표화면.css','구매고민.css','생활계획.css','시작흐름.js']) {
    assert.ok(!readFileSync(new URL(`../화면/${filename}`,import.meta.url),'utf8').includes('목업원본.png'));
  }
});

test('화면 루트에 클릭 이동용 data-view를 부여하지 않음', () => {
  const app=readFileSync(new URL('../화면/앱.js',import.meta.url),'utf8');
  assert.ok(!app.includes('document.body.dataset.view'));
});
