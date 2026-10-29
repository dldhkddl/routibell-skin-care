import { createHash, createHmac, createPublicKey, verify } from 'node:crypto';

const eventType='https://schemas.openid.net/secevent/oauth/event-type/user-unlinked';
const invalid=()=>Object.assign(Error('카카오 연결 해제 알림을 확인하지 못했어요.'),{code:'invalid_request'});

export function createKakaoWebhook({database,env,fetchImpl=fetch,now=Date.now,encryptionKey,onDelete=()=>{}}){
  let keys=null,keysUntil=0;
  const subject=value=>createHmac('sha256',encryptionKey).update(`kakao:${value}`).digest('hex');
  async function publicKeys(){
    if(keys&&keysUntil>now())return keys;
    const response=await fetchImpl('https://kauth.kakao.com/.well-known/jwks.json',{redirect:'error',signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw invalid();
    const payload=await response.json();
    if(!Array.isArray(payload.keys)||payload.keys.length>20)throw invalid();
    keys=payload.keys;keysUntil=now()+60*60*1000;
    return keys;
  }
  async function handle(request,response){
    try{
      if(!env.KAKAO_REST_API_KEY||!env.KAKAO_APP_ID||request.method!=='POST'||request.headers['content-type']!=='application/secevent+jwt')throw invalid();
      const chunks=[];let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>8192)throw invalid();chunks.push(Buffer.from(chunk));}
      const token=Buffer.concat(chunks).toString('utf8');
      const parts=token.split('.');
      if(parts.length!==3||parts.some(part=>! /^[A-Za-z0-9_-]+$/.test(part)))throw invalid();
      let header,payload;
      try{header=JSON.parse(Buffer.from(parts[0],'base64url'));payload=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw invalid();}
      if(header.alg!=='RS256'||header.typ!=='secevent+jwt'||typeof header.kid!=='string'||header.kid.length>128)throw invalid();
      if(payload.iss!=='https://kauth.kakao.com'||payload.aud!==env.KAKAO_REST_API_KEY||String(payload.app_id)!==env.KAKAO_APP_ID)throw invalid();
      if(typeof payload.sub!=='string'||! /^\d+$/.test(payload.sub)||typeof payload.jti!=='string'||payload.jti.length>200||!Number.isInteger(payload.iat)||Math.abs(now()/1000-payload.iat)>86400)throw invalid();
      const event=payload.events?.[eventType];
      if(!event||event.subject?.subject_type!=='iss-sub'||event.subject?.sub!==payload.sub)throw invalid();
      const key=(await publicKeys()).find(item=>item.kid===header.kid&&item.kty==='RSA'&&(!item.alg||item.alg==='RS256'));
      if(!key||!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw invalid();
      let deleted=null;
      await database.transaction(async()=>{
        const idHash=createHash('sha256').update(payload.jti).digest('hex');
        const inserted=await database.prepare('INSERT INTO kakao_webhook_events(id_hash,received_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(idHash,now());
        if(!inserted.changes)return;
        const linked=await database.prepare('SELECT users.id,users.password FROM kakao_identities JOIN users ON users.id=kakao_identities.user_id WHERE kakao_identities.subject_hash=?').get(subject(payload.sub));
        if(!linked)return;
        if(linked.password){
          await database.prepare('DELETE FROM kakao_identities WHERE user_id=?').run(linked.id);
          await database.prepare('DELETE FROM sessions WHERE user_id=?').run(linked.id);
        }else{await database.prepare('DELETE FROM users WHERE id=?').run(linked.id);deleted=linked.id;}
      });
      if(deleted)try{await onDelete(deleted);}catch{console.warn('카카오 연결 해제 후 임시 사진 정리 실패');}
      response.writeHead(202);response.end();
    }catch{
      response.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});
      response.end(JSON.stringify({err:'invalid_request',description:'Invalid security event token.'}));
    }
  }
  return {handle};
}
