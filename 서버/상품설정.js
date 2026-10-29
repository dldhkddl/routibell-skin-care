export const SUBSCRIPTION_PRODUCT_ID='subscription';
export const ANALYSIS_PASS_PRODUCT_ID='routibell_analysis_1';
export const SUBSCRIPTION_PRICE_KRW=7900;
export const ANALYSIS_PASS_PRICE_KRW=3900;
export const FREE_TRIAL_CHECKIN_DAYS=3;

export function readProductSettings(env={}){
  const settings={
    subscriptionPriceKrw:Number(env.SUBSCRIPTION_PRICE_KRW??SUBSCRIPTION_PRICE_KRW),
    analysisPassProductId:env.ANALYSIS_PASS_PRODUCT_ID??ANALYSIS_PASS_PRODUCT_ID,
    analysisPassPriceKrw:Number(env.ANALYSIS_PASS_PRICE_KRW??ANALYSIS_PASS_PRICE_KRW),
    freeTrialCheckinDays:Number(env.FREE_TRIAL_CHECKIN_DAYS??FREE_TRIAL_CHECKIN_DAYS),
    trialBypassAccountIds:(env.FREE_TRIAL_BYPASS_ACCOUNT_IDS??'').split(',').map(value=>value.trim()).filter(Boolean),
  };
  if(!Number.isSafeInteger(settings.subscriptionPriceKrw)||settings.subscriptionPriceKrw<100||settings.subscriptionPriceKrw>100000)throw Error('구독 금액 설정을 확인해 주세요.');
  if(!/^[a-z0-9_]{8,80}$/.test(settings.analysisPassProductId)||!Number.isSafeInteger(settings.analysisPassPriceKrw)||settings.analysisPassPriceKrw<100||settings.analysisPassPriceKrw>100000)throw Error('1회권 설정을 확인해 주세요.');
  if(!Number.isSafeInteger(settings.freeTrialCheckinDays)||settings.freeTrialCheckinDays<1||settings.freeTrialCheckinDays>30)throw Error('무료 체험 체크인 일수 설정을 확인해 주세요.');
  if(settings.trialBypassAccountIds.length>12||settings.trialBypassAccountIds.some(value=>! /^[a-f0-9-]{36}$/i.test(value))||new Set(settings.trialBypassAccountIds).size!==settings.trialBypassAccountIds.length)throw Error('무료 체험 테스트 계정 설정을 확인해 주세요.');
  return settings;
}
