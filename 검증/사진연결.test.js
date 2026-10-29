import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { readPhotoConnection, registerPhotoConnection } from '../서버/사진연결.js';

function connectionFile(context){
  const directory=mkdtempSync(join(tmpdir(),'beauty-connection-test-'));
  context.after(()=>{const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep));assert.ok(target.includes('beauty-connection-test-'));rmSync(target,{recursive:true,force:true});});
  return join(directory,'사진연결.json');
}
function photoServer(port){const server=new EventEmitter();server.address=()=>({port});return server;}

test('별도 포트의 사진 연결을 자동 등록하고 종료하면 정리한다',context=>{
  const path=connectionFile(context),server=photoServer(43127);
  assert.deepEqual(readPhotoConnection(path),{port:4174});
  registerPhotoConnection(server,path);
  assert.deepEqual(readPhotoConnection(path),{port:43127});
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(path,'utf8'))).sort(),['instance','port']);
  server.emit('close');assert.equal(existsSync(path),false);
});

test('이전 사진 실행 종료가 새 연결 정보를 지우지 않는다',context=>{
  const path=connectionFile(context),first=photoServer(43127),second=photoServer(43128);
  registerPhotoConnection(first,path);registerPhotoConnection(second,path);
  first.emit('close');assert.deepEqual(readPhotoConnection(path),{port:43128});
  second.emit('close');assert.equal(existsSync(path),false);
});

test('외부 주소·손상 연결값으로 대체하지 않고 잘못된 포트는 차단한다',context=>{
  const path=connectionFile(context);
  for(const value of [{port:'https://other.example',instance:'test'},{port:80,instance:'test'},{port:65536,instance:'test'},{port:4174}]){
    writeFileSync(path,JSON.stringify(value));assert.throws(()=>readPhotoConnection(path),/연결/);
  }
  writeFileSync(path,'broken');assert.throws(()=>readPhotoConnection(path),/연결/);
  assert.throws(()=>registerPhotoConnection(photoServer(0),path));
});
