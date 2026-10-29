export const PRODUCT_KINDS = Object.freeze({
  cleanser:'클렌저',toner:'토너',serum:'세럼',eyecream:'아이크림',cream:'로션/크림',sunscreen:'선크림',retinol:'레티놀',exfoliant:'각질제거제',other:'기타',
});

const ORDER = {cleanser:10,exfoliant:20,toner:30,serum:40,retinol:45,eyecream:50,cream:60,sunscreen:70,other:80};

export const sortVanity = inventory => [...inventory].sort((first,second)=>ORDER[first.kind]-ORDER[second.kind]||first.title.localeCompare(second.title,'ko'));

export function vanityRoutine(inventory,asOf=new Date().toISOString().slice(0,10)) {
  const ready=inventory.filter(item=>item.category==='cosmetic'&&item.status==='available'&&item.remaining>0&&item.comfort!=='uncomfortable'&&(!item.expires||item.expires>=asOf)&&Object.hasOwn(PRODUCT_KINDS,item.kind));
  const sorted=sortVanity(ready);
  const hasBoth=sorted.some(item=>item.kind==='retinol')&&sorted.some(item=>item.kind==='exfoliant');
  const morning=sorted.filter(item=>!['retinol','exfoliant'].includes(item.kind));
  const evening=sorted.filter(item=>item.kind!=='sunscreen'&&(!hasBoth||!['retinol','exfoliant'].includes(item.kind)));
  const tips=[];
  if(hasBoth)tips.push('레티놀과 각질제거제는 같은 날 저녁에 함께 쓰지 말아요. 사용할 때는 하나만 골라요.');
  if(!morning.some(item=>item.kind==='sunscreen'))tips.push('아침 선크림이 없네요. 가지고 있는 제품부터 확인해 볼까요?');
  if(sorted.some(item=>item.kind==='serum')&&sorted.some(item=>item.kind==='toner'))tips.push('세럼은 토너 다음 순서예요.');
  return {morning,evening,tips};
}
