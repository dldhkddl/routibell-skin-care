import { randomBytes, randomUUID } from 'node:crypto';
import { ANALYSIS_PASS_PRICE_KRW, ANALYSIS_PASS_PRODUCT_ID, SUBSCRIPTION_PRICE_KRW, SUBSCRIPTION_PRODUCT_ID } from './상품설정.js';

const fault=(code,message,status=409)=>Object.assign(Error(message),{code,status});
const MONTH=30*24*60*60*1000;
const validText=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,120}$/.test(value);

export function createFakePaymentProvider({now=Date.now,analysisPassProductId=ANALYSIS_PASS_PRODUCT_ID}={}){
  const receipts=new Map(),subscriptions=new Map(),passes=new Map();
  const snapshot=(entry,kind)=>({...entry,eventId:randomUUID(),kind});
  return {
    kind:'fake',
    issue(accountId,productId=SUBSCRIPTION_PRODUCT_ID){const receipt=randomBytes(24).toString('hex');receipts.set(receipt,{accountId,productId});return receipt;},
    async verifyPurchase({accountId,receipt,productId=SUBSCRIPTION_PRODUCT_ID}){
      const issued=receipts.get(receipt);
      if(!issued||issued.accountId!==accountId||issued.productId!==productId)throw fault('PURCHASE_UNVERIFIED','구매 확인 정보를 확인하지 못했어요.',403);
      receipts.delete(receipt);
      if(productId===analysisPassProductId){
        const entry={accountId,productId,externalId:randomUUID(),status:'active',purchasedAt:now()};
        passes.set(entry.externalId,entry);return snapshot(entry,'purchase');
      }
      if(productId!==SUBSCRIPTION_PRODUCT_ID)throw fault('PURCHASE_UNVERIFIED','상품 정보를 확인하지 못했어요.',403);
      const entry={accountId,productId,externalId:randomUUID(),status:'active',periodStart:now(),periodEnd:now()+MONTH,autoRenew:true};
      subscriptions.set(accountId,entry);
      return snapshot(entry,'purchase');
    },
    async renew({accountId}){
      const entry=subscriptions.get(accountId);
      if(!entry||!entry.autoRenew||entry.status!=='active')throw fault('RENEWAL_UNVERIFIED','갱신할 이용권이 없어요.');
      const next={...entry,periodStart:entry.periodEnd,periodEnd:entry.periodEnd+MONTH};
      subscriptions.set(accountId,next);return snapshot(next,'renewal');
    },
    async cancel({accountId}){
      const entry=subscriptions.get(accountId);
      if(!entry)throw fault('SUBSCRIPTION_MISSING','이용권을 찾지 못했어요.');
      const next={...entry,status:'canceled',autoRenew:false};
      subscriptions.set(accountId,next);return snapshot(next,'cancel');
    },
    async refund({accountId,productId=SUBSCRIPTION_PRODUCT_ID,purchaseId}){
      if(productId===analysisPassProductId){
        const entry=passes.get(purchaseId);
        if(!entry||entry.accountId!==accountId)throw fault('PASS_MISSING','1회권 구매 내역을 찾지 못했어요.',404);
        if(entry.status==='refunded')return snapshot(entry,'refund');
        const next={...entry,status:'refunded'};
        passes.set(purchaseId,next);return snapshot(next,'refund');
      }
      const entry=subscriptions.get(accountId);
      if(!entry)throw fault('SUBSCRIPTION_MISSING','이용권을 찾지 못했어요.');
      const next={...entry,status:'refunded',periodEnd:now(),autoRenew:false};
      subscriptions.set(accountId,next);return snapshot(next,'refund');
    },
    async restore({accountId,productId=SUBSCRIPTION_PRODUCT_ID,purchaseId}){
      if(productId===analysisPassProductId){
        const entry=passes.get(purchaseId);
        if(!entry||entry.accountId!==accountId)throw fault('RESTORE_NOT_FOUND','복원할 1회권이 없어요.',404);
        return snapshot(entry,'restore');
      }
      const entry=subscriptions.get(accountId);
      if(!entry)throw fault('RESTORE_NOT_FOUND','복원할 이용권이 없어요.',404);
      return snapshot(entry,'restore');
    },
  };
}

export function createPaymentGateway({database,provider,now=Date.now,price=SUBSCRIPTION_PRICE_KRW,analysisPassPrice=ANALYSIS_PASS_PRICE_KRW,analysisPassProductId=ANALYSIS_PASS_PRODUCT_ID,entitlements}){
  if(!Number.isSafeInteger(price)||price<100||price>100000)throw Error('구독 금액 설정을 확인해 주세요.');
  if(!Number.isSafeInteger(analysisPassPrice)||analysisPassPrice<100||analysisPassPrice>100000||!validText(analysisPassProductId))throw Error('1회권 설정을 확인해 주세요.');
  const available=Boolean(provider&&provider.kind!=='unavailable');
  const requireProvider=()=>{if(!available)throw fault('PAYMENT_UNAVAILABLE','결제 연결을 준비 중이에요. 무료 기능은 계속 이용할 수 있어요.',503);};
  async function apply(accountId,snapshot){
    const pass=snapshot?.productId===analysisPassProductId;
    const common=snapshot?.accountId===accountId&&validText(snapshot.externalId)&&validText(snapshot.eventId)&&['purchase','renewal','cancel','refund','restore'].includes(snapshot.kind);
    const validPass=pass&&['purchase','refund','restore'].includes(snapshot.kind)&&['active','refunded'].includes(snapshot.status)&&Number.isSafeInteger(snapshot.purchasedAt);
    const validSubscription=!pass&&(snapshot.productId===undefined||snapshot.productId===SUBSCRIPTION_PRODUCT_ID)&&['active','canceled','refunded'].includes(snapshot.status)&&Number.isSafeInteger(snapshot.periodStart)&&Number.isSafeInteger(snapshot.periodEnd)&&snapshot.periodEnd>=snapshot.periodStart&&typeof snapshot.autoRenew==='boolean';
    if(!common||!validPass&&!validSubscription)throw fault('PURCHASE_UNVERIFIED','결제 확인 결과를 사용할 수 없어요.',403);
    await database.transaction(async()=>{
      const user=await database.prepare(`SELECT id FROM users WHERE id=?${database.kind==='postgres'?' FOR UPDATE':''}`).get(accountId);
      if(!user)throw fault('ACCOUNT_REQUIRED','계정을 확인해 주세요.',401);
      const seen=await database.prepare('SELECT event_id FROM payment_events WHERE event_id=?').get(snapshot.eventId);
      if(seen)return;
      await database.prepare('INSERT INTO payment_events VALUES(?,?,?,?)').run(snapshot.eventId,accountId,snapshot.kind,now());
      if(pass){
        const prior=await database.prepare('SELECT user_id,status FROM analysis_passes WHERE external_id=?').get(snapshot.externalId);
        if(prior&&prior.user_id!==accountId)throw fault('PURCHASE_UNVERIFIED','다른 계정의 1회권이에요.',403);
        if(!prior){
          if(snapshot.status!=='active'||!['purchase','restore'].includes(snapshot.kind))throw fault('PURCHASE_UNVERIFIED','1회권 구매 기록을 확인하지 못했어요.',403);
          await database.prepare('INSERT INTO analysis_passes(external_id,user_id,provider,status,purchased_at,updated_at) VALUES(?,?,?,?,?,?)').run(snapshot.externalId,accountId,provider.kind,'active',snapshot.purchasedAt,now());
        }else if(prior.status==='active'&&snapshot.status==='refunded'){
          await database.prepare("UPDATE analysis_passes SET status='refunded',updated_at=? WHERE external_id=? AND user_id=?").run(now(),snapshot.externalId,accountId);
        }
        return;
      }
      const prior=await database.prepare('SELECT external_id,period_start,period_end,status FROM subscriptions WHERE user_id=?').get(accountId);
      if(prior&&prior.external_id!==snapshot.externalId&&prior.period_end>now()&&prior.status!=='refunded')throw fault('SUBSCRIPTION_OWNER','다른 이용권을 이 계정에 연결할 수 없어요.',409);
      if(prior&&prior.period_start>snapshot.periodStart)return;
      if(prior&&prior.status==='refunded'&&snapshot.kind==='restore'&&prior.period_start===snapshot.periodStart)return;
      await database.prepare('INSERT INTO subscriptions(user_id,provider,external_id,status,period_start,period_end,auto_renew,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,auto_renew=excluded.auto_renew,updated_at=excluded.updated_at')
        .run(accountId,provider.kind,snapshot.externalId,snapshot.status,snapshot.periodStart,snapshot.periodEnd,snapshot.autoRenew?1:0,now());
    });
    return status(accountId);
  }
  async function status(accountId){
    const access=await entitlements.access(accountId);
    return {priceKrw:price,priceTemporary:true,monthlyAnalyses:entitlements.monthlyLimit,analysisPassProductId,analysisPassPriceKrw:analysisPassPrice,billingAvailable:available&&provider.kind==='real',access};
  }
  const perform=async(accountId,method,extra={})=>{
    requireProvider();
    const snapshot=await provider[method]({accountId,...extra});
    const result=await apply(accountId,snapshot);
    return method==='verifyPurchase'&&snapshot.productId===analysisPassProductId?{...result,purchaseId:snapshot.externalId}:result;
  };
  return {
    status,
    purchase:(accountId,receipt,productId=SUBSCRIPTION_PRODUCT_ID)=>perform(accountId,'verifyPurchase',{receipt,productId}),
    renew:accountId=>perform(accountId,'renew'),
    cancel:accountId=>perform(accountId,'cancel'),
    refund:(accountId,productId=SUBSCRIPTION_PRODUCT_ID,purchaseId)=>perform(accountId,'refund',{productId,purchaseId}),
    restore:(accountId,productId=SUBSCRIPTION_PRODUCT_ID,purchaseId)=>perform(accountId,'restore',{productId,purchaseId}),
  };
}
