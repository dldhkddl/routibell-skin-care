import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppService } from './서버/앱서버.js';
import { readServerEnvironment, isPrivateServerPath } from './서버/환경설정.js';
import { APP } from './앱설정.js';

function accountServer(env){
  function attach(server,preview=false){
    const host=preview?server.config.preview.host:server.config.server.host;
    if(!['127.0.0.1','localhost'].includes(host))throw Error('계정 서버는 로컬 주소에서만 실행하세요. 공개 배포 전 HTTPS·운영 인증 설정이 필요합니다.');
    const port=(preview?server.config.preview.port:server.config.server.port)??4173;
    const service=createAppService({dbPath:resolve(process.env.BEAUTY_DB_PATH??'.계정자료/뷰티로그.sqlite'),origins:[`http://127.0.0.1:${port}`,`http://localhost:${port}`],env});
    server.middlewares.use((request,response,next)=>{
      if(isPrivateServerPath(request.url)){response.writeHead(404);response.end();}
      else void service.handle(request,response,next);
    });
    server.httpServer?.once('close',()=>service.close());
  }
  return {name:'beauty-app-server',configureServer:server=>attach(server),configurePreviewServer:server=>attach(server,true)};
}
export default defineConfig(({mode})=>({
  plugins:[{name:'app-brand',transformIndexHtml:html=>html.replaceAll('__APP_NAME__',APP.name).replaceAll('__APP_ENGLISH_NAME__',APP.englishName)},accountServer(readServerEnvironment({root:fileURLToPath(new URL('.',import.meta.url)),mode}))],
  build:{rollupOptions:{input:{app:resolve('index.html'),privacy:resolve('개인정보-처리방침.html'),terms:resolve('이용약관.html'),accountDeletion:resolve('계정-삭제.html')}}},
  server:{host:'127.0.0.1',port:4173,strictPort:true,watch:{ignored:['**/.계정자료/**','**/.검증자료/**']},fs:{deny:['**/.env*','**/.git/**','**/.계정자료/**','**/.검증자료/**','**/저장키','**/*.sqlite*']}},
  preview:{host:'127.0.0.1',port:4173,strictPort:true},
}));
