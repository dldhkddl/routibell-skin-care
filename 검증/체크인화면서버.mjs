import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAppService } from '../서버/앱서버.js';
import { isPrivateServerPath } from '../서버/환경설정.js';
import { EMPTY, today } from '../화면/계산.js';
import { emptyCare } from '../화면/피부계산.js';
import { readFileSync } from 'node:fs';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { PHOTO_ACTIONS } from '../화면/사진항목.js';
import { savePhotoObservation } from '../화면/사진이력.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const origin='http://127.0.0.1:4186';
const service=createAppService({dbPath:':memory:',origins:[origin],env:{}});
const server=await createServer({root,cacheDir:'node_modules/.vite-checkin',configFile:false,envFile:false,server:{host:'127.0.0.1',port:4186,strictPort:true,watch:{ignored:['**/.계정자료/**','**/.검증자료/**']},fs:{deny:['**/.env*','**/.git/**','**/.계정자료/**','**/.검증자료/**','**/저장키','**/*.sqlite*']}},plugins:[{name:'isolated-checkin',configureServer(vite){vite.middlewares.use((request,response,next)=>{if(isPrivateServerPath(request.url)){response.writeHead(404);response.end();}else void service.handle(request,response,next);});vite.httpServer.once('close',()=>service.close());}}]});
await server.listen();
const signup=await fetch(`${origin}/api/account/register`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Beauty-Client':'account-v1'},body:JSON.stringify({username:'checkin-demo',password:'local-checkin-only',consent:true,ageConfirmed:true})});
if(!signup.ok)throw Error('검증 계정을 준비하지 못했습니다.');
const session=await signup.json();
const data={...EMPTY(),inventory:[{id:'checkin-cream',title:'검증용 보습제',category:'cosmetic',kind:'cream',comfort:'comfortable',status:'available',remaining:80,opened:today(),expires:'2099-12-31',memo:''}],skinCare:{...emptyCare(),profile:{feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:today()},selection:{cleanser:null,cream:'checkin-cream',sunscreen:null}}};
if(process.argv.includes('--사진요약')){
  const response=JSON.parse(readFileSync(new URL('./실제응답구조.json',import.meta.url),'utf8'));
  const result=normalizeAnalysis(response,()=>Date.parse('2026-09-23T06:00:00Z'),PHOTO_ACTIONS);
  data.skinCare=savePhotoObservation(data,result,'moisture').skinCare;
}
const saved=await fetch(`${origin}/api/account/data`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','X-Beauty-Client':'account-v1',Cookie:signup.headers.get('set-cookie').split(';')[0],'X-Account-ID':session.user.id,'X-Session-ID':session.sessionId,'X-CSRF-Token':session.csrfToken},body:JSON.stringify({revision:0,data})});
if(!saved.ok)throw Error('검증용 기록을 준비하지 못했습니다.');
console.log(`검증 전용 앱: ${origin}/#checkin\n아이디: checkin-demo / 비밀번호: local-checkin-only\n가상 계정은 서버 메모리에만 유지합니다. 유캠 연결은 꺼져 있습니다.`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
