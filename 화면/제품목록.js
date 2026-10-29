// 공식 판매 페이지에서 확인한 단품 가격. 실시간 조회나 제휴 추적을 하지 않습니다.
export const CHECKED_AT = '2026-09-14';
export const PRODUCTS = [
  {id:'soonjung', kind:'cream', checkedAt:CHECKED_AT, brand:'에뛰드', name:'순정 2x 베리어 보습 크림', volume:60, price:13600, shipping:2500, color:'#DBE9DE',
   url:'https://www.amoremall.com/kr/ko/product/detail?onlineProdCode=110090000247&onlineProdSn=58429',
   note:'등록된 후보 중 작은 60ml 용량. 실제 사용감과 전성분은 공식 상세정보를 확인하세요.'},
  {id:'atobarrier', kind:'cream', checkedAt:CHECKED_AT, brand:'에스트라', name:'아토베리어365 크림', volume:80, price:28050, shipping:0, color:'#DCE4F4',
   url:'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=60892',
   note:'80ml 단품 기준. 같은 용량의 다른 크림과 가격이 같아도 사용감과 성분은 다를 수 있어요.'},
  {id:'hydro', kind:'cream', checkedAt:CHECKED_AT, brand:'에스트라', name:'아토베리어365 하이드로 수딩크림', volume:80, price:28050, shipping:0, color:'#DDEFF0',
   url:'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=50007',
   note:'80ml 단품 기준. 제품명만으로 내 피부에 맞는지 판단하지 말고 상세정보를 확인하세요.'},
  {id:'soonjung-cleanser', kind:'cleanser', checkedAt:'2026-09-22', brand:'에뛰드', name:'순정 약산성 6.5 휩 클렌저', volume:150, price:12000, shipping:2500, color:'#DBE9DE',
   url:'https://www.amoremall.com/kr/ko/product/detail?onlineProdCode=110090000240&onlineProdSn=58265',
   note:'150ml 단품 기준. 등록된 세안제 후보는 1개이며 사용감·전성분은 공식 상세정보를 확인하세요.'},
  {id:'dermauv-sunscreen', kind:'sunscreen', checkedAt:'2026-09-22', brand:'에스트라', name:'더마UV365 장벽수분 무기자차 선크림 SPF50+ PA++++', volume:40, price:26350, shipping:0, color:'#E8EBF4',
   url:'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=69497',
   note:'40ml 단품 기준. 등록된 자외선 차단제 후보는 1개예요. 표시된 차단 지수는 개인별 적합성을 보장하지 않아요.'},
];
export const productById = id => PRODUCTS.find(p=>p.id===id);
