const endings=Object.freeze({
  '이/가':['이','가'],
  '을/를':['을','를'],
  '은/는':['은','는'],
  '과/와':['과','와'],
  '이에요/예요':['이에요','예요'],
  '으로/로':['으로','로'],
});

export function withParticle(word,pair) {
  const choices=endings[pair];
  if(!choices)throw Error('조사 종류를 확인해 주세요.');
  const code=String(word).codePointAt(String(word).length-1);
  const jong=code>=0xac00&&code<=0xd7a3?(code-0xac00)%28:0;
  return `${word}${jong&&!(pair==='으로/로'&&jong===8)?choices[0]:choices[1]}`;
}
