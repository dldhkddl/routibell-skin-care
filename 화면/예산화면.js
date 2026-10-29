import { monthlyBudgetPlan } from './예산계산.js';
import { PRODUCT_KINDS } from './화장대순서.js';

export function renderBudgetForm(monthLabel,budget=null) {
  return `<p class="modal-sub">${monthLabel}에 편안하게 쓸 수 있는 금액을 정해보세요.</p><form id="budget-form"><label>월 뷰티 예산<span class="input-unit"><input type="text" name="budget" required inputmode="numeric" pattern="[0-9,]+" placeholder="예: 300,000" value="${budget===null?'':budget.toLocaleString('ko-KR')}"><span>원</span></span></label><div class="quick-budgets">${[100000,200000,300000,500000].map(amount=>`<button type="button" data-action="quick-budget" data-value="${amount}">${amount/10000}만원</button>`).join('')}</div><p class="field-help">0원도 괜찮아요. 남은 예산은 다음 달에 자동으로 더해지지 않아요.</p><p id="form-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">취소</button><button class="btn primary" type="submit">예산 저장</button></div></form>`;
}

export function formatBudgetInput(value) {
  const digits=String(value).replace(/[^0-9]/g,'');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');
}

export function renderBudgetResult(data,month) {
  const plan=monthlyBudgetPlan(data,month);
  if(!plan)return '';
  if(!plan.items.length)return '<section class="panel budget-recommendation"><h2>이번 달 예산 계획</h2><p>이번 달은 안 사도 돼요. 가진 제품부터 써요.</p></section>';
  const rows=plan.items.map(item=>`<tr><th scope="row">${PRODUCT_KINDS[item.kind]}</th><td>${item.range}</td><td>${item.status}</td></tr>`).join('');
  return `<section class="panel budget-recommendation"><h2>이번 달 예산 계획</h2><div class="budget-manager-lines">${plan.lines.map(line=>`<p>${line}</p>`).join('')}</div><table><thead><tr><th scope="col">종류</th><th scope="col">예상 가격대</th><th scope="col">계획</th></tr></thead><tbody>${rows}</tbody></table><p class="field-help">가격과 교체 주기는 대략적인 기준이에요. 내 기록이 쌓이면 바뀌어요.</p></section>`;
}
