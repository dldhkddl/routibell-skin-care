import { resolve } from 'node:path';
import { readServerEnvironment } from '../서버/환경설정.js';
import { createAccountStore } from '../서버/계정저장소.js';

const env=readServerEnvironment();
const database=createAccountStore({dbPath:resolve('.계정자료/뷰티로그.sqlite'),databaseUrl:env.DATABASE_URL,caPath:env.DATABASE_CA_CERT_PATH});
try{
  await database.ready();
  for(const [product,label] of [['pass','1회권'],['subscription','월 구독']]){
    const row=await database.prepare('SELECT COUNT(*) AS total FROM payment_interest WHERE product=?').get(product);
    process.stdout.write(`${label} 관심 계정: ${row.total}명\n`);
  }
}finally{await database.close();}
