import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
test('한글 전체 가변 글꼴을 앱에 포함하며 입력·목표 화면에 같은 글꼴을 적용한다',()=>{
  const font=read('public/글꼴/프리텐다드.woff2');assert.equal(font.subarray(0,4).toString(),'wOF2');assert.ok(font.length>1000000);
  assert.match(read('public/글꼴/프리텐다드-라이선스.txt').toString(),/SIL OPEN FONT LICENSE/);
  assert.doesNotMatch(read('화면/글꼴.css').toString(),/unicode-range|https?:|뷰티고딕/);
  for(const path of ['화면/글꼴.css','화면/스타일.css','화면/목표화면.css'])assert.match(read(path).toString(),/Pretendard Variable/);
  assert.match(read('화면/스타일.css').toString(),/button, input, select, textarea \{ font: inherit/);
});
