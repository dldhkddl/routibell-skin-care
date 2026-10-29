import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { Readable } from 'node:stream';
import { createAccountStore } from '../서버/계정저장소.js';
import { createKakaoWebhook } from '../서버/카카오웹훅.js';

test('카카오 연결 해제는 서명·앱·중복을 검증한 후에만 계정에 반영된다',async context=>{
  const database=createAccountStore({dbPath:':memory:'});context.after(()=>database.close());
  const secret=randomBytes(32),userId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const subject=createHmac('sha256',secret).update('kakao:12345').digest('hex');
  await database.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(userId,'test-user','password','recovery',1);
  await database.prepare('INSERT INTO kakao_identities VALUES(?,?)').run(subject,userId);
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
  const now=Date.parse('2026-09-29T06:00:00Z');
  const service=createKakaoWebhook({database,env:{KAKAO_REST_API_KEY:'rest-test',KAKAO_APP_ID:'42'},encryptionKey:secret,now:()=>now,fetchImpl:async()=>({ok:true,json:async()=>({keys:[jwk]})})});
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload={iss:'https://kauth.kakao.com',aud:'rest-test',app_id:'42',sub:'12345',iat:Math.floor(now/1000),jti:'event-1',events:{'https://schemas.openid.net/secevent/oauth/event-type/user-unlinked':{subject:{subject_type:'iss-sub',sub:'12345'}}}};
  const token=body=>{const signed=`${encode({alg:'RS256',typ:'secevent+jwt',kid:'test-key'})}.${encode(body)}`;return `${signed}.${sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url')}`;};
  async function send(body){
    const request=Readable.from([body]);request.method='POST';request.headers={'content-type':'application/secevent+jwt'};
    const response={status:0,writeHead(status){this.status=status;},end(){}};
    await service.handle(request,response);return response.status;
  }
  assert.equal(await send(token({...payload,aud:'wrong'})),400);
  assert.equal(await send(token(payload)),202);
  assert.equal(await send(token(payload)),202);
  assert.equal(await database.prepare('SELECT user_id FROM kakao_identities WHERE user_id=?').get(userId),undefined);
  assert.ok(await database.prepare('SELECT id FROM users WHERE id=?').get(userId));
});
