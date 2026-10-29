import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const sqliteSchema=`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS documents(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, idle_until INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS session_user_index ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS photo_tickets(token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS kakao_identities(subject_hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS kakao_flows(id TEXT PRIMARY KEY,state_hash TEXT UNIQUE NOT NULL,challenge TEXT NOT NULL,origin TEXT NOT NULL,purpose TEXT NOT NULL,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,status TEXT NOT NULL,subject_hash TEXT);
  CREATE TABLE IF NOT EXISTS kakao_webhook_events(id_hash TEXT PRIMARY KEY,received_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS photo_usage(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, used INTEGER NOT NULL DEFAULT 0, job TEXT, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS analysis_entitlements(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, legacy_free_used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS trial_checkin_days(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, received_date TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY(user_id,received_date));
  CREATE TABLE IF NOT EXISTS analysis_requests(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL, slot TEXT NOT NULL, period_start INTEGER, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,request_id));
  CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, external_id TEXT NOT NULL, status TEXT NOT NULL, period_start INTEGER NOT NULL, period_end INTEGER NOT NULL, auto_renew INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, processed_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS analysis_passes(external_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, status TEXT NOT NULL, purchased_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS payment_interest(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, product TEXT NOT NULL, requested_at INTEGER NOT NULL, PRIMARY KEY(user_id,product));
  CREATE TABLE IF NOT EXISTS analysis_capacity_lock(id INTEGER PRIMARY KEY CHECK(id=1));
  INSERT INTO analysis_capacity_lock(id) VALUES(1) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS analysis_capacity(request_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, state TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS analysis_pass_user_index ON analysis_passes(user_id,status,purchased_at);
  PRAGMA user_version=3;`;

const postgresSchema=`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS documents(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL, idle_until BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS session_user_index ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS photo_tickets(token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS kakao_identities(subject_hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS kakao_flows(id TEXT PRIMARY KEY,state_hash TEXT UNIQUE NOT NULL,challenge TEXT NOT NULL,origin TEXT NOT NULL,purpose TEXT NOT NULL,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL,status TEXT NOT NULL,subject_hash TEXT);
  CREATE TABLE IF NOT EXISTS kakao_webhook_events(id_hash TEXT PRIMARY KEY,received_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS photo_usage(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, used INTEGER NOT NULL DEFAULT 0, job TEXT, updated_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS analysis_entitlements(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, legacy_free_used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS trial_checkin_days(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, received_date TEXT NOT NULL, received_at BIGINT NOT NULL, PRIMARY KEY(user_id,received_date));
  CREATE TABLE IF NOT EXISTS analysis_requests(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL, slot TEXT NOT NULL, period_start BIGINT, state TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(user_id,request_id));
  CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, external_id TEXT NOT NULL, status TEXT NOT NULL, period_start BIGINT NOT NULL, period_end BIGINT NOT NULL, auto_renew INTEGER NOT NULL, updated_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, processed_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS analysis_passes(external_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, status TEXT NOT NULL, purchased_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS payment_interest(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, product TEXT NOT NULL, requested_at BIGINT NOT NULL, PRIMARY KEY(user_id,product));
  CREATE TABLE IF NOT EXISTS analysis_capacity_lock(id INTEGER PRIMARY KEY CHECK(id=1));
  INSERT INTO analysis_capacity_lock(id) VALUES(1) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS analysis_capacity(request_id TEXT PRIMARY KEY, created_at BIGINT NOT NULL, state TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS analysis_pass_user_index ON analysis_passes(user_id,status,purchased_at);`;

export function createAccountStore({dbPath,databaseUrl,caPath,onConnectionError=()=>{}}={}){
  const context=new AsyncLocalStorage();
  if(!databaseUrl){
    const sqlite=new DatabaseSync(dbPath,{timeout:5000});
    sqlite.exec(sqliteSchema);
    let queue=Promise.resolve();
    const locked=operation=>{
      if(context.getStore())return Promise.resolve().then(operation);
      const pending=queue.then(operation,operation);
      queue=pending.catch(()=>{});
      return pending;
    };
    return {
      kind:'sqlite',ready:async()=>{},
      prepare:sql=>({get:(...values)=>locked(()=>sqlite.prepare(sql).get(...values)),all:(...values)=>locked(()=>sqlite.prepare(sql).all(...values)),run:(...values)=>locked(()=>sqlite.prepare(sql).run(...values))}),
      transaction:operation=>locked(async()=>{
        sqlite.exec('BEGIN IMMEDIATE');
        try{const result=await context.run(true,operation);sqlite.exec('COMMIT');return result;}
        catch(issue){sqlite.exec('ROLLBACK');throw issue;}
      }),
      checkpoint:()=>locked(()=>sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)')),
      close:()=>locked(()=>sqlite.close()),
    };
  }
  let address;
  try{address=new URL(databaseUrl);}catch{throw Error('DATABASE_URL 형식을 확인해 주세요.');}
  if(!['postgres:','postgresql:'].includes(address.protocol)||!address.hostname||!address.username||!address.password||address.pathname.length<2)throw Error('DATABASE_URL 형식을 확인해 주세요.');
  const certificatePath=caPath||new URL('./인증서/Supabase인증서.crt',import.meta.url);
  if(caPath&&!existsSync(certificatePath))throw Error('DB CA 인증서 파일을 찾을 수 없습니다.');
  const certificate=existsSync(certificatePath)?readFileSync(certificatePath,'utf8'):null;
  if(certificate&&!certificate.includes('-----BEGIN CERTIFICATE-----'))throw Error('DB CA 인증서 형식을 확인해 주세요.');
  const pool=new pg.Pool({host:address.hostname,port:Number(address.port||5432),user:decodeURIComponent(address.username),password:decodeURIComponent(address.password),database:decodeURIComponent(address.pathname.slice(1)),ssl:{rejectUnauthorized:true,...(certificate?{ca:certificate}:{})},max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  const connectionError=issue=>['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT','ECONNRESET','08001','08006','57P01'].includes(issue?.code);
  pool.on('error',issue=>{console.warn('계정 DB 연결을 다시 확인해 주세요.');onConnectionError();});
  pg.types.setTypeParser(20,value=>Number(value));
  let initialization;
  const ready=()=>initialization??=(async()=>{
    const client=await pool.connect();
    try{await client.query(postgresSchema);}finally{client.release();}
  })().catch(issue=>{if(connectionError(issue))onConnectionError();throw issue;});
  const query=async(sql,values)=>{
    await ready();
    let index=0;
    const prepared=sql.replaceAll('?',()=>`$${++index}`);
    try{return await (context.getStore()??pool).query(prepared,values);}
    catch(issue){if(connectionError(issue))onConnectionError();throw issue;}
  };
  return {
    kind:'postgres',ready,
    prepare:sql=>({get:async(...values)=>(await query(sql,values)).rows[0],all:async(...values)=>(await query(sql,values)).rows,run:async(...values)=>({changes:(await query(sql,values)).rowCount})}),
    transaction:async operation=>{
      await ready();
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const result=await context.run(client,operation);
        await client.query('COMMIT');
        return result;
      }catch(issue){await client.query('ROLLBACK');throw issue;}finally{client.release();}
    },
    checkpoint:async()=>{},
    close:()=>pool.end(),
  };
}
