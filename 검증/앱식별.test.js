import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('앱 식별자·버전·Java 패키지·인증 복귀 주소는 출시 설정과 일치한다',()=>{
  assert.equal(JSON.parse(read('capacitor.config.json')).appId,'com.dldhkddl.skincare');
  assert.equal(JSON.parse(read('capacitor.config.json')).loggingBehavior,'none');
  const gradle=read('android/app/build.gradle');
  assert.match(gradle,/namespace = "com\.dldhkddl\.skincare"/);
  assert.match(gradle,/applicationId "com\.dldhkddl\.skincare"/);
  assert.match(gradle,/versionCode 1\s/);assert.match(gradle,/versionName "1\.0\.0"/);
  for(const name of ['MainActivity','SecureSessionPlugin'])assert.match(read(`android/app/src/main/java/com/dldhkddl/skincare/${name}.java`),/^package com\.dldhkddl\.skincare;/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'),/android:scheme="com\.dldhkddl\.skincare" android:host="kakao"/);
});
