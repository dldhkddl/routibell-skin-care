import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { APP } from '../앱설정.js';
import { renderPrivacyPolicy } from '../화면/개인정보방침.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('이름은 공통 설정에서 화면·개인정보·알림·네이티브로 이어진다',()=>{
  assert.deepEqual(APP,{name:'루티벨',englishName:'ROUTIBELL',managerName:'매니저'});
  assert.equal(JSON.parse(read('capacitor.config.json')).appName,APP.name);
  assert.match(read('android/app/src/main/res/values/strings.xml'),new RegExp(`<string name="app_name">${APP.name}</string>`));
  assert.ok(renderPrivacyPolicy().includes(APP.name));
  assert.match(read('화면/체크인알림.js'),/title:APP.name/);
  for(const filename of readdirSync(new URL('../화면/',import.meta.url)).filter(name=>name.endsWith('.js')))assert.equal(/뷰티로그|BEAUTY\s*(?:<b>)?PORTFOLIO|오늘결|결봄/.test(read('화면/'+filename)),false,filename);
});
