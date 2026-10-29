import { DatabaseSync, backup } from 'node:sqlite';
import { createConnection } from 'node:net';
import { createDecipheriv, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readServerEnvironment } from '../서버/환경설정.js';
import { createAccountStore } from '../서버/계정저장소.js';

const tables=[
  {name:'users',columns:['id','username','password','recovery','created_at']},
  {name:'documents',columns:['user_id','revision','payload']},
  {name:'sessions',columns:['id','token_hash','user_id','expires_at','idle_until']},
  {name:'photo_tickets',columns:['token_hash','session_id','expires_at']},
  {name:'limits',columns:['key','count','until']},
  {name:'kakao_identities',columns:['subject_hash','user_id']},
  {name:'kakao_flows',columns:['id','state_hash','challenge','origin','purpose','session_id','expires_at','status','subject_hash']},
  {name:'photo_usage',columns:['user_id','used','job','updated_at']},
];

const exists=(database,name)=>Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
const count=(database,name)=>exists(database,name)?database.prepare(`SELECT COUNT(*) AS total FROM ${name}`).get().total:0;
const expectedKey=env=>{
  const encoded=env.ACCOUNT_ENCRYPTION_KEY??'';
  if(!(/^[a-f0-9]{64}$/i.test(encoded)||/^[A-Za-z0-9+/]{43}=$/.test(encoded)))throw Error('ACCOUNT_ENCRYPTION_KEY 설정을 확인해 주세요.');
  return Buffer.from(encoded,/^[a-f0-9]{64}$/i.test(encoded)?'hex':'base64');
};
function hasPriorAnalysis(row,key){
  const parts=row.payload.split('.');
  if(parts.length!==3)throw Error('기존 암호화 기록 형식을 확인하지 못했습니다.');
  try{
    const [nonce,tag,contents]=parts.map(part=>Buffer.from(part,'base64'));
    const cipher=createDecipheriv('aes-256-gcm',key,nonce);
    cipher.setAuthTag(tag);cipher.setAAD(Buffer.from(`${row.user_id}:${row.revision}`));
    const data=JSON.parse(Buffer.concat([cipher.update(contents),cipher.final()]).toString('utf8'));
    const care=data?.skinCare;
    return Boolean(care?.observation)||(Array.isArray(care?.observations)&&care.observations.length>0);
  }catch{throw Error('기존 암호화 기록을 읽지 못했습니다. 저장키와 DB를 확인해 주세요.');}
}
async function localServerRunning(){
  return new Promise(resolve=>{
    const socket=createConnection({host:'127.0.0.1',port:4173});
    socket.setTimeout(500);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',()=>resolve(false));
    socket.once('timeout',()=>{socket.destroy();resolve(false);});
  });
}

export async function backupLegacyDatabase(dbPath){
  if(!existsSync(dbPath))throw Error('기존 SQLite 계정 DB를 찾을 수 없습니다.');
  const source=new DatabaseSync(dbPath,{readOnly:true});
  const backupDirectory=join(dirname(dbPath),'백업');
  mkdirSync(backupDirectory,{recursive:true,mode:0o700});
  const backupPath=join(backupDirectory,`이전-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.sqlite`);
  try{
    await backup(source,backupPath);
    const copied=new DatabaseSync(backupPath,{readOnly:true});
    try{
      if(copied.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite 백업 무결성을 확인하지 못했습니다.');
      for(const table of tables)if(count(source,table.name)!==count(copied,table.name))throw Error('SQLite 백업 건수가 원본과 다릅니다.');
    }finally{copied.close();}
    return backupPath;
  }finally{source.close();}
}

export async function migrateLegacyDatabase({dbPath=resolve('.계정자료/뷰티로그.sqlite'),env=readServerEnvironment(),store,checkLocalServer=localServerRunning}={}){
  if(await checkLocalServer())throw Error('앱 서버를 종료한 뒤 이전을 실행해 주세요.');
  if(!env.DATABASE_URL)throw Error('DATABASE_URL 설정을 확인해 주세요.');
  const oldKey=readFileSync(join(dirname(dbPath),'저장키'));
  const newKey=expectedKey(env);
  if(oldKey.length!==32||newKey.length!==32||!timingSafeEqual(oldKey,newKey))throw Error('기존 계정 저장키와 환경변수 저장키가 일치하지 않습니다.');
  const backupPath=await backupLegacyDatabase(dbPath);
  const source=new DatabaseSync(backupPath,{readOnly:true});
  const destination=store??createAccountStore({databaseUrl:env.DATABASE_URL,caPath:env.DATABASE_CA_CERT_PATH});
  try{
    if(destination.kind!=='postgres')throw Error('대상은 PostgreSQL이어야 합니다.');
    const previousUsage=exists(source,'photo_usage')?new Set(source.prepare('SELECT user_id FROM photo_usage').all().map(row=>row.user_id)):new Set();
    const inferredUsers=source.prepare('SELECT * FROM documents').all().filter(row=>!previousUsage.has(row.user_id)&&hasPriorAnalysis(row,oldKey)).map(row=>row.user_id);
    await destination.ready();
    await destination.transaction(async()=>{
      for(const table of tables){
        const current=await destination.prepare(`SELECT COUNT(*) AS total FROM ${table.name}`).get();
        if(Number(current.total)!==0)throw Error('대상 DB에 기존 자료가 있어 덮어쓰지 않습니다.');
      }
      for(const table of tables){
        if(!exists(source,table.name))continue;
        const rows=source.prepare(`SELECT * FROM ${table.name}`).all();
        const fields=table.columns.join(',');
        const placeholders=table.columns.map(()=>'?').join(',');
        for(const row of rows)await destination.prepare(`INSERT INTO ${table.name}(${fields}) VALUES(${placeholders})`).run(...table.columns.map(column=>row[column]));
      }
      for(const userId of inferredUsers)await destination.prepare('INSERT INTO photo_usage(user_id,used,job,updated_at) VALUES(?,1,NULL,?)').run(userId,Date.now());
    });
    for(const table of tables){
      const total=Number((await destination.prepare(`SELECT COUNT(*) AS total FROM ${table.name}`).get()).total);
      if(table.name==='photo_usage'){
        if(total!==count(source,table.name)+inferredUsers.length)throw Error('분석 사용 기록 검증에 실패했습니다. 계정 서버를 시작하지 마세요.');
      }else if(total!==count(source,table.name))throw Error('이전 건수 검증에 실패했습니다. 계정 서버를 시작하지 마세요.');
    }
    return {backupPath,accounts:count(source,'users')};
  }finally{
    source.close();
    if(!store)await destination.close();
    newKey.fill(0);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await migrateLegacyDatabase();
    console.log(`계정 ${result.accounts}개 이전 및 건수 검증 완료. SQLite 백업: ${result.backupPath}`);
  }catch{
    console.error('계정 DB 이전을 완료하지 못했습니다. 원본과 백업은 유지했습니다. 설정·접속 상태를 확인해 주세요.');
    process.exitCode=1;
  }
}
