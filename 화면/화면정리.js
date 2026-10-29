const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function copyDetails(lead,content='',label='자세히 보기'){
  return `${lead?`<p class="card-copy">${esc(lead)}</p>`:''}${content?`<details class="card-details"><summary>${esc(label)}</summary><div>${content}</div></details>`:''}`;
}

export function numericCard(label,value,unit=''){
  return `<div class="number-card"><span>${esc(label)}</span><strong>${esc(value)}${unit?`<small>${esc(unit)}</small>`:''}</strong></div>`;
}

export function primaryCandidate(candidates){
  return candidates.filter(candidate=>candidate.visible&&!candidate.disabled).sort((first,second)=>second.priority-first.priority)[0]?.element??null;
}

export function actionVisible(element){
  if(!element.getClientRects().length||element.closest('[hidden], [inert]'))return false;
  for(let ancestor=element.parentElement;ancestor;ancestor=ancestor.parentElement){
    if(ancestor.tagName==='DETAILS'&&!ancestor.open){
      const summary=[...ancestor.children].find(child=>child.tagName==='SUMMARY');
      if(!summary?.contains(element))return false;
    }
  }
  return true;
}

export function syncScreenAction(root=document){
  const dialog=[...root.querySelectorAll('dialog[open]')].at(-1);
  const scope=dialog??root.querySelector('.main-content')??root.querySelector('.account-shell');
  if(!scope)return;
  const selected=primaryCandidate([...scope.querySelectorAll('.btn.primary, [data-main-action]')].map(element=>({element,visible:actionVisible(element),disabled:element.disabled||element.getAttribute('aria-disabled')==='true',priority:Number(element.dataset.mainAction??0)+(element.matches('[data-checkin="save"], form button[type="submit"]')?20:0)})));
  for(const element of root.querySelectorAll('.screen-primary'))if(element!==selected)element.classList.remove('screen-primary');
  selected?.classList.add('screen-primary');
}

export function installScreenHierarchy(){
  document.body.classList.add('compact-ui');
  let scheduled=false;
  const refresh=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncScreenAction();});};
  const observer=new MutationObserver(refresh);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','disabled','aria-disabled','inert']});
  document.addEventListener('toggle',refresh,true);
  refresh();
  return ()=>{observer.disconnect();document.removeEventListener('toggle',refresh,true);};
}
