import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { backupLegacyDatabase, migrateLegacyDatabase } from '../도구/계정DB이전.mjs';
import { createAccountStore } from '../서버/계정저장소.js';

function legacyFixture(context){
  const directory=mkdtempSync(join(tmpdir(),'routibell-migrate-'));
  const dbPath=join(directory,'legacy.sqlite');
  const key=randomBytes(32);
  writeFileSync(join(directory,'저장키'),key);
  const source=new DatabaseSync(dbPath);
  source.exec('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,recovery TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE documents(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL,payload TEXT NOT NULL)');
  const payloads=[];
  for(const index of [1,2]){
    const userId=`user-${index}`,nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
    cipher.setAAD(Buffer.from(`${userId}:0`));
    const contents=Buffer.concat([cipher.update(JSON.stringify({skinCare:{observations:index===1?[{id:'prior'}]:[]}}),'utf8'),cipher.final()]);
    const payload=[nonce,cipher.getAuthTag(),contents].map(part=>part.toString('base64')).join('.');
    payloads.push(payload);
    source.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(userId,`account-${index}`,'test-hash','test-recovery',Date.now());
    source.prepare('INSERT INTO documents VALUES(?,?,?)').run(userId,0,payload);
  }
  source.close();
  context.after(()=>{
    const target=resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir())+sep));
    rmSync(target,{recursive:true,force:true});
  });
  return {dbPath,payloads,env:{DATABASE_URL:'postgresql://not-used.invalid/example',ACCOUNT_ENCRYPTION_KEY:key.toString('base64')}};
}

test('SQLite 온라인 백업을 만든 뒤 두 계정의 암호문을 빈 대상에만 옮긴다',async context=>{
  const fixture=legacyFixture(context);
  const destination=createAccountStore({dbPath:':memory:'});
  const fakePostgres={...destination,kind:'postgres'};
  try{
    const result=await migrateLegacyDatabase({...fixture,store:fakePostgres,checkLocalServer:async()=>false});
    assert.equal(result.accounts,2);
    assert.equal(readFileSync(result.backupPath).length>0,true);
    const rows=await destination.prepare('SELECT user_id,payload FROM documents ORDER BY user_id').get();
    assert.equal(rows.user_id,'user-1');
    assert.equal(rows.payload===fixture.payloads[0],true);
    assert.equal((await destination.prepare('SELECT COUNT(*) AS total FROM users').get()).total,2);
    assert.equal((await destination.prepare('SELECT used FROM photo_usage WHERE user_id=?').get('user-1')).used,1);
    assert.equal(await destination.prepare('SELECT used FROM photo_usage WHERE user_id=?').get('user-2'),undefined);
    await assert.rejects(migrateLegacyDatabase({...fixture,store:fakePostgres,checkLocalServer:async()=>false}),issue=>issue.message.includes('덮어쓰지'));
    assert.equal((await destination.prepare('SELECT COUNT(*) AS total FROM users').get()).total,2);
  }finally{await destination.close();}
});

test('기존 암호화 키와 다르면 이전을 시작하지 않는다',async context=>{
  const fixture=legacyFixture(context);
  const destination=createAccountStore({dbPath:':memory:'});
  try{
    await assert.rejects(migrateLegacyDatabase({...fixture,env:{...fixture.env,ACCOUNT_ENCRYPTION_KEY:randomBytes(32).toString('base64')},store:{...destination,kind:'postgres'},checkLocalServer:async()=>false}),issue=>issue.message.includes('일치하지'));
    const backupPath=await backupLegacyDatabase(fixture.dbPath);
    assert.equal(readFileSync(backupPath).length>0,true);
  }finally{await destination.close();}
});
