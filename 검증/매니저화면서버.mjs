import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAppService } from '../서버/앱서버.js';
import { isPrivateServerPath } from '../서버/환경설정.js';
import { EMPTY, today } from '../화면/계산.js';
import { APP } from '../앱설정.js';
import { randomBytes } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const previewPort=Number(process.env.BEAUTY_PREVIEW_PORT??4187);
if(!Number.isInteger(previewPort)||previewPort<1024||previewPort>65535)throw Error('검증 포트를 확인해 주세요.');
const origin=`http://127.0.0.1:${previewPort}`;
const sessions=new Map();
const service=createAppService({dbPath:':memory:',origins:[origin],env:{}});
const server=await createServer({root,cacheDir:'node_modules/.vite-manager',configFile:false,envFile:false,server:{host:'127.0.0.1',port:previewPort,strictPort:true,watch:{ignored:['**/.계정자료/**','**/.검증자료/**']},fs:{deny:['**/.env*','**/.git/**','**/.계정자료/**','**/.검증자료/**','**/저장키','**/*.sqlite*']}},plugins:[{name:'isolated-manager',transformIndexHtml:html=>html.replaceAll('__APP_NAME__',APP.name).replaceAll('__APP_ENGLISH_NAME__',APP.englishName),configureServer(vite){vite.middlewares.use((request,response,next)=>{
  const url=new URL(request.url,origin);
  if(decodeURIComponent(url.pathname)==='/매니저-입장'){
    const cookie=sessions.get(url.searchParams.get('state'));
    if(!cookie){response.writeHead(404);response.end();return;}
    response.writeHead(302,{Location:'/#home','Set-Cookie':cookie});response.end();return;
  }
  if(isPrivateServerPath(request.url)){response.writeHead(404);response.end();return;}
  void service.handle(request,response,next);
});vite.httpServer.once('close',()=>service.close());}}]});
await server.listen();

const offset=days=>{const date=new Date(`${today()}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
const states=[['신규','manager-new'],['연속','manager-streak'],['불편함','manager-discomfort'],['분석','manager-photo'],['첫실행','manager-start'],['재분석','manager-compare'],['화장대','manager-vanity']];
for(const [state,username] of states){
  const signup=await fetch(`${origin}/api/account/register`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Beauty-Client':'account-v1'},body:JSON.stringify({username,password:randomBytes(24).toString('hex'),consent:true,ageConfirmed:true})});
  if(!signup.ok)throw Error(`${state} 검증 계정을 준비하지 못했습니다.`);
  const session=await signup.json();
  const cookie=signup.headers.get('set-cookie');
  sessions.set(state,cookie);
  const data=EMPTY();
  data.onboarding=true;data.goals={selected:['skin'],note:''};
  data.skinCare.profile={feel:'balanced',concerns:[],sensitivity:'rare',discomfort:'no',priority:'comfort',budget:null,updatedAt:today()};
  if(state==='첫실행'){data.onboarding=false;data.goals={selected:[],note:''};data.skinCare.profile=null;}
  if(state==='연속')data.skinCare.days=[-3,-2,-1].map(days=>({date:offset(days),morning:true,evening:false,morningProducts:[],eveningProducts:[]}));
  if(state==='불편함'){
    data.skinCare.profile.discomfort='yes';data.skinCare.profile.updatedAt=offset(-1);
    data.skinCare.checkins=[{date:offset(-1),feeling:'uncomfortable',adherence:'pending',feel:null,product:null,memo:''}];
  }
  if(state==='분석')data.skinCare.observation={provider:'youcam',version:'v2.1',date:offset(-1),focus:'moisture',actions:['pore','moisture'],scores:{pore:74,moisture:56}};
  if(state==='재분석'){
    const previous={provider:'youcam',version:'v2.1',date:offset(-10),focus:'moisture',actions:['pore','moisture'],scores:{pore:61,moisture:56}};
    const current={provider:'youcam',version:'v2.1',date:offset(-1),focus:'moisture',actions:['pore','moisture'],scores:{pore:74,moisture:60}};
    data.skinCare.observation=current;
    data.skinCare.observations=[{id:'photo-first',completedAt:`${offset(-10)}T01:00:00.000Z`,reference:previous,condition:'unknown',baselineId:null},{id:'photo-second',completedAt:`${offset(-1)}T01:00:00.000Z`,reference:current,condition:'matched',baselineId:'photo-first'}];
  }
  if(state==='화장대')data.inventory=['serum','cleanser','toner','cream','sunscreen'].map(kind=>({id:`product-${kind}`,title:{serum:'내 세럼',cleanser:'내 클렌저',toner:'내 토너',cream:'내 크림',sunscreen:'내 선크림'}[kind],category:'cosmetic',kind,comfort:'comfortable',remaining:100,status:'available',opened:'',expires:'',memo:''}));
  const saved=await fetch(`${origin}/api/account/data`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','X-Beauty-Client':'account-v1',Cookie:cookie.split(';')[0],'X-Account-ID':session.user.id,'X-Session-ID':session.sessionId,'X-CSRF-Token':session.csrfToken},body:JSON.stringify({revision:0,data})});
  if(!saved.ok)throw Error(`${state} 검증 기록을 준비하지 못했습니다.`);
}
console.log(`검증 전용 앱: ${origin}/매니저-입장?state=신규|연속|불편함|분석|첫실행|재분석|화장대`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
