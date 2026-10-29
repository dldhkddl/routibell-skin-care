import { createAccountService } from './계정서버.js';
import { createPreparationService } from './유캠준비.js';
import { PreparationError } from './유캠조회.js';
import { connectionOrigins } from './접근정책.js';
import { createOperationalAlerts } from './운영알림.js';

export function createAppService({dbPath,origins=['http://127.0.0.1:4173','http://localhost:4173'],env=process.env,fetchImpl=fetch,now=Date.now,sleep,paymentProvider}={}){
  origins=connectionOrigins(origins,env);
  const alerts=createOperationalAlerts({env,now});
  const report=kind=>{void alerts.notify(kind);};
  let photo;
  const account=createAccountService({dbPath,origins,env,fetchImpl,now,paymentProvider,onOperationalError:report,photoConnection:()=>({path:'/api/youcam'}),onDelete:userId=>photo?.clearOwner(userId)});
  photo=createPreparationService({env,origins,fetchImpl,now,sleep,resolveAnalysisAccess:account.analysisAccess,onOperationalError:report,integrated:true,photoState:account.photoState,verifyAccount:async ticket=>{
    try{return await account.verifyPhotoTicket(ticket);}
    catch{throw new PreparationError('ACCOUNT_REQUIRED','로그인 후 사진 분석을 다시 열어 주세요.',401);}
  }});
  alerts.schedule();
  return {
    handle(request,response,next=()=>{response.writeHead(404);response.end();}){
      if(request.url==='/api/health'){
        if(request.method!=='GET'){response.writeHead(405,{'Cache-Control':'no-store'});response.end();return;}
        void account.health().then(ok=>{
          response.writeHead(ok?200:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
          response.end(JSON.stringify({ok}));
        }).catch(()=>{
          response.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
          response.end(JSON.stringify({ok:false}));
        });
        return;
      }
      if(request.url?.startsWith('/api/account/'))return account.handle(request,response);
      if(request.url?.startsWith('/api/youcam/'))return photo.handle(request,response);
      return next();
    },
    async close(){alerts.close();photo.close();await account.close();},
  };
}
