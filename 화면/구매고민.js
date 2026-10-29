import { today, currency, validateWish, validateData } from './계산.js';
import { productById } from './제품목록.js';
import { PRIORITIES, STATUSES, recommend, purchaseWish } from './추천계산.js';
import { availableInventory } from './계획계산.js';
import { KINDS } from './피부계산.js';
import { icon } from './아이콘.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action=(text,act,id='',cls='secondary',extra='')=>`<button type="button" class="btn ${cls}" data-wish="${act}" data-id="${id}" ${extra}>${text}</button>`;
const sampleWish=month=>({id:'sample-wish',kind:'cream',title:'다음 수분 크림을 고민 중이에요',month,limit:30000,priority:'price',owned:true,status:'pending',productId:null,recordId:null});

export function createWishUI(ctx) {
  let selectedId=null;
  const current=()=>{const s=ctx.state();return {...s,wishes:s.demo?[sampleWish(s.month)]:(s.data.wishes??[]).filter(w=>w.month===s.month)};};
  function selected(){const s=current();return s.wishes.find(w=>w.id===selectedId)??s.wishes.at(-1);}
  function guard(){const s=ctx.state();if(s.demo){ctx.toast('샘플을 종료한 뒤 내 구매 고민을 남겨주세요.');return false;}if(s.storageError){ctx.toast('먼저 백업을 복원해 주세요.');return false;}return !s.busy;}
  function form(id){
    if(!guard())return;
    const s=ctx.state(),w=s.data.wishes.find(w=>w.id===id)??{...sampleWish(s.month),id:crypto.randomUUID(),title:'',owned:false};
    if(w.status==='purchased'){ctx.toast('구매한 제품은 연결된 소비 기록에서 수정해 주세요.');return;}
    ctx.dialog(id?'구매 고민 수정':'어떤 제품이 필요하세요?',`<p class="modal-sub">세안제·보습제·자외선 차단제를 종류별로 비교해요. 구매 한도에는 배송비도 포함해 주세요.</p><form id="wish-form" data-id="${w.id}"><label>제품 종류<select name="kind">${Object.entries(KINDS).map(([value,label])=>`<option value="${value}" ${value===(w.kind??'cream')?'selected':''}>${label}</option>`).join('')}</select></label><label>고민 이름<input name="title" required maxlength="60" placeholder="예: 다 쓴 수분 크림 바꾸기" value="${esc(w.title)}"></label><label>구매 계획 월<input type="month" name="month" value="${w.month}" required min="2000-01" max="2099-12"></label><label>이번 구매 한도 (원)<input type="number" name="limit" min="0" max="100000000" step="1" inputmode="numeric" required value="${w.limit}"></label><label>가장 중요한 기준<select name="priority">${Object.entries(PRIORITIES).map(([v,t])=>`<option value="${v}" ${w.priority===v?'selected':''}>${t}</option>`).join('')}</select></label><label>이 종류의 제품이 남아 있나요?<select name="owned"><option value="no" ${!w.owned?'selected':''}>아니요, 새로 필요해요</option><option value="yes" ${w.owned?'selected':''}>네, 아직 남아 있어요</option></select></label><p class="field-help">선택한 종류만 비교해요. 세안제 1종·보습제 3종·자외선 차단제 1종으로 후보가 제한되어 있어요. 피부 진단이나 성분 적합성을 판단하지 않아요.</p><p id="form-error" class="form-error" role="alert"></p><div class="modal-actions">${action('취소','close')}<button class="btn primary" type="submit">저장하고 후보 보기</button></div></form>`);
  }
  function purchase(id,productId){
    if(!guard())return;
    const w=ctx.state().data.wishes.find(w=>w.id===id),p=productById(productId);
    if(!w||!p||w.status==='purchased')return;
    ctx.dialog('실제로 구매한 내용을 남겨요',`<p class="modal-sub">${esc(p.brand+' '+p.name)} · ${p.volume}ml<br>주문이나 결제는 진행되지 않아요. 이미 구매한 내역만 기록해 주세요.</p><form id="wish-purchase-form" data-id="${id}" data-product="${p.id}"><label>실제 결제금액 (배송비 포함, 원)<input name="amount" type="number" inputmode="numeric" min="0" max="100000000" step="1" required placeholder="영수증의 최종 금액"></label><label>구매 날짜<input name="date" type="date" required min="2000-01-01" max="${today()}" value="${today()}"></label><p class="field-help">참고 예상 총액 ${currency(p.price+p.shipping)} · ${p.checkedAt} 확인. 실제 가격과 다를 수 있어요.</p><label class="checkbox"><input type="checkbox" name="confirmed" required> 이미 구매한 내역임을 확인했어요.</label><p id="form-error" class="form-error" role="alert"></p><div class="modal-actions">${action('취소','close')}<button class="btn primary" type="submit">소비 기록으로 저장</button></div></form>`);
  }
  function productCard(product,wish){
    const previous=product.previous;
    return `<article class="product-card ${product.eligible?'':'reference-only'}"><div class="product-top"><div class="product-heading"><span class="product-tag">${product.eligible?'비교 후보':'참고 제품'}</span><p class="product-brand">${esc(product.brand)} · ${product.volume}ml</p><h3>${esc(product.name)}</h3><div class="product-price">${currency(product.total)}</div><small>단품 1개 · 배송비 포함 예상</small></div></div><p class="match-reason">${icon(product.eligible?'check':'leaf')} ${esc(product.reason)}</p><details class="product-details"><summary>가격·내 경험 자세히 보기 ${icon('chevron')}</summary><div class="product-detail-content"><p class="price-detail">제품 ${currency(product.price)} + 배송 ${currency(product.shipping)}<br>제품 가격 기준 10ml당 약 ${currency(product.unit)}</p>${previous?`<p class="personal-note">내 지난 기록: ${previous.rating===null?'아직 평가 전':`만족도 ${previous.rating}점`}${previous.repurchase===false?' · 재구매 의향 없음':''}</p>`:''}<p class="personal-note">${product.rated?`누적 ${product.rated}건 평가 · 평균 ${product.average.toFixed(1)}점${product.rated<2?' · 개인화 순위 근거 부족':''}`:'아직 내 사용 경험이 없어요.'}</p><p class="product-note">${esc(product.note)}</p><p class="product-note">가격 확인일 ${product.checkedAt} · 실시간 가격이 아니에요.</p><a class="source-link" href="${product.url}" target="_blank" rel="noopener noreferrer">공식몰 가격·상세 확인 ↗</a></div></details>${action('이 제품 구매했어요','purchase',wish.id,'secondary',`data-product="${product.id}"`)}</article>`;
  }
  function render(){
    const s=current(),w=selected(),d=s.demo?{...s.effective,wishes:s.wishes}:s.data;
    const held=s.wishes.filter(w=>w.status==='held');
    return `${w?`<div class="wish-compact-intro"><span>내 예산 안에서 후보를 비교해요.</span>${action(icon('plus')+'새 고민','new','','secondary')}</div>`:`<section class="wish-intro"><div><span class="eyebrow">THINK BEFORE YOU BUY</span><h2>나에게 필요한 만큼,<br>한 번 더 생각하고.</h2><p>구매 고민을 남기면 예산과 선호에 맞춰 종류별 제품 후보를 비교해요.</p></div>${action(icon('plus')+'구매 고민 추가','new','','primary')}</section>`}<div class="wish-summary"><span>이번 달 고민 <b>${s.wishes.length}개</b></span><span>보류 <b>${held.length}개</b></span><small>보류한 구매 한도는 실제 절약액으로 계산하지 않아요.</small></div>${!w?`<section class="panel wish-empty"><span class="empty-icon">${icon('bottle')}</span><h2>살까 말까, 함께 생각해요</h2><p>구매 한도와 중요하게 보는 기준을 알려주세요.<br>가격·용량을 비교하고 구매를 쉬어갈 수도 있어요.</p>${action('첫 구매 고민 남기기','new','','primary')}<p class="catalog-caption">현재 비교 대상: 세안제 1종 · 보습제 3종 · 자외선 차단제 1종</p></section>`:`<div class="wish-tabs" aria-label="저장한 구매 고민">${s.wishes.map(x=>`<button type="button" data-wish="select" data-id="${x.id}" aria-pressed="${x.id===w.id}" class="wish-tab ${x.id===w.id?'selected':''}"><span>${esc(x.title)}</span><small>${STATUSES[x.status]} · ${currency(x.limit)}</small></button>`).join('')}</div>${detail(d,w)}`}<p class="catalog-disclosure">등록된 2개 브랜드의 5종만 비교하며 전체 시장의 최저가나 최적 제품을 뜻하지 않아요. 광고·제휴 수수료는 없습니다. 사진은 공식몰 제공 구성 예시로 증정품이 포함될 수 있으며, 비교 가격은 단품 1개 기준이에요.</p>`;
  }
  function detail(d,w){
    if(w.status==='purchased'){
      const r=d.records.find(r=>r.id===w.recordId);
      return `<section class="panel purchase-complete"><span class="empty-icon">${icon('check')}</span><h2>고민이 나의 경험으로 이어졌어요</h2><p>${esc(r?.title??'연결된 소비')} · ${currency(r?.amount??0)}</p><p>${r?.rating===null?'충분히 사용한 뒤 만족도를 남겨주세요.':`직접 남긴 만족도 ${r?.rating}점이 다음 후보 비교에 표시돼요.`}</p><button class="btn primary" data-action="edit" data-id="${w.recordId}">만족도·소비 기록 보기</button></section>`;
    }
    const result=recommend(d,w);
    const decisions=`<div class="decision-options"><article><h3>새로 구매</h3><p>후보별 예상 비용과 내 평가를 확인해요. 실제 구매 후 아래 제품 카드에서 기록할 수 있어요.</p></article><article><h3>기존 제품 사용</h3><p>추가 지출 0원 · ${result.inventory.length?result.inventory.map(item=>esc(item.title)+' '+item.remaining+'%').join(', '):w.owned?'이 종류의 제품이 남아 있다고 입력했어요.':'같은 종류의 보유 제품을 먼저 확인해 주세요.'}</p>${result.inventory.length||w.owned?action('기존 제품 사용하기','use',w.id):'<button class="btn secondary" data-view="life">보유 제품 등록</button>'}</article><article><h3>구매 연기·포기</h3><p>지금 추가 지출 0원. 실제 절약액이나 미래 구매 가격을 뜻하지 않아요.</p>${action('구매 보류','hold',w.id)} ${action('구매 포기','abandon',w.id)}${w.status!=='pending'?action('다시 고민하기','resume',w.id):''}</article></div>`;
    return `<section class="panel wish-detail"><div class="section-head"><div><span class="small-badge">${STATUSES[w.status]}</span><h2>${esc(w.title)}</h2><p>이번 구매 한도 ${currency(w.limit)} · ${PRIORITIES[w.priority]}</p></div>${action('조건 수정','edit',w.id)}</div><details class="decision-disclosure"><summary>구매·기존 제품·보류 선택 비교 ${icon('chevron')}</summary>${decisions}</details><div class="decision-banner"><span class="tip-icon">${icon('leaf')}</span><div><h3>${result.hold?'구매를 잠시 보류해도 좋아요':'필요할 때 선택할 수 있는 후보예요'}</h3><p>${result.reasons.length?result.reasons.map(esc).join('<br>'):'조건에 맞는 후보가 있어도 꼭 구매할 필요는 없어요. 필요한지 먼저 확인하세요.'}</p></div>${action(w.status==='held'?'다시 고민하기':'이번에는 보류하기',w.status==='held'?'resume':'hold',w.id,'soft')}</div><div class="comparison-head"><div><h2>${KINDS[w.kind??'cream']} 후보 ${result.candidates.length}개</h2><p>${result.remaining===null?'월 예산 미설정':`해당 월 남은 예산 ${currency(result.remaining)}`} · 비교 한도 ${currency(result.cap)}</p></div><span class="small-badge">${result.stale?'가격 재확인 필요':'제품별 확인일 보기'}</span></div><details class="comparison-method"><summary>비교 기준·배송비 안내</summary><p class="comparison-note">${PRIORITIES[w.priority]} 순으로, 한도 내 후보를 먼저 보여요. 같은 조건의 제품에는 별도 우열을 두지 않아요. 예상 배송비는 단품 1개 기준이고 쿠폰·지역·시점에 따라 바뀔 수 있어요.</p></details><div class="product-grid">${result.candidates.map(product=>productCard(product,w)).join('')}</div><p class="comparison-note">각 고민을 따로 비교해요. 여러 제품을 함께 구매할 계획이라면 총액을 다시 확인하세요. 성분 적합성·알레르기·피부 효과는 판단하지 않아요.</p></section>`;
  }
  async function click(e){
    const b=e.target.closest('[data-wish]');if(!b)return;
    const a=b.dataset.wish,id=b.dataset.id;
    if(a==='close'){document.querySelector('#editor').close();return;}
    if(a==='select'){selectedId=id;ctx.render();return;}
    if(a==='new'){form();return;}if(a==='edit'){form(id);return;}
    if(a==='purchase'){purchase(id,b.dataset.product);return;}
    if(!guard())return;
    if(['hold','resume','use','abandon'].includes(a)){
      const d=ctx.state().data,w=d.wishes.find(x=>x.id===id);
      if(!w||w.status==='purchased')return;
      if(a==='use'&&!w.owned&&!availableInventory(d).some(item=>item.kind===(w.kind??'cream')&&item.category==='cosmetic')){ctx.toast('같은 종류의 사용 가능한 제품을 먼저 등록해 주세요.');return;}
      const status={hold:'held',resume:'pending',use:'using',abandon:'abandoned'}[a];
      await ctx.persist(validateData({...d,wishes:d.wishes.map(x=>x.id===id?{...x,status}:x)}),`${STATUSES[status]} 상태로 저장했어요. 실제 지출에는 더하지 않아요.`);
    }
  }
  async function submit(e){
    if(!['wish-form','wish-purchase-form'].includes(e.target.id))return;
    e.preventDefault();if(!guard())return;
    try{
      const f=new FormData(e.target),s=ctx.state(),id=e.target.dataset.id;
      if(e.target.id==='wish-form'){
        const old=s.data.wishes.find(w=>w.id===id);
        const w=validateWish({id,kind:f.get('kind'),title:f.get('title'),month:f.get('month'),limit:Number(f.get('limit')),priority:f.get('priority'),owned:f.get('owned')==='yes',status:old?.status??'pending',productId:null,recordId:null});
        selectedId=id;
        ctx.setMonth(w.month);
        await ctx.persist(validateData({...s.data,wishes:[...s.data.wishes.filter(x=>x.id!==id),w]}),'고민을 저장했어요. 후보와 보류 선택을 살펴보세요.');
      }else{
        if(f.get('confirmed')!=='on')throw Error('실제 구매 내역인지 확인해 주세요.');
        const next=purchaseWish(s.data,id,e.target.dataset.product,Number(f.get('amount')),f.get('date'));
        await ctx.persist(next,'소비 기록에 연결했어요. 사용 후 만족도를 남겨주세요.');
      }
    }catch(err){document.querySelector('#form-error').textContent=err.message;}
  }
  document.addEventListener('click',click);
  document.addEventListener('submit',submit);
  return {render};
}
