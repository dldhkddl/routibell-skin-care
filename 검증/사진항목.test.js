import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_ACTIONS, validatePhotoActions, photoPriceBand } from '../화면/사진항목.js';
import { validateAnalysisSelection, selectTrialCost, normalizeAnalysis, createAnalysisSession, PHOTO_CONSENT } from '../서버/유캠분석.js';
import { photoReference, validatePhotoReference } from '../화면/사진계산.js';

test('기본 항목은 1~4개이며 중복·미지원·HD·초과 선택을 거절한다',()=>{
  assert.equal(PHOTO_ACTIONS.length,16);
  assert.deepEqual(validateAnalysisSelection(['acne','pore']),['pore','acne']);
  for(const selected of [[],['pore','pore'],['unknown'],['hd_pore'],PHOTO_ACTIONS.slice(0,5)])assert.throws(()=>validateAnalysisSelection(selected));
  assert.deepEqual(validatePhotoActions(PHOTO_ACTIONS,16),PHOTO_ACTIONS);
});

test('각 선택 구간의 SD 가격만 허용하고 상한 초과를 거절한다',()=>{
  for(const count of [1,4,5,8,9,12,13,16]){
    const band=photoPriceBand(count),actions=PHOTO_ACTIONS.slice(0,count);
    const item={description:`AI Skin Analysis V2.1 SD (${band.min}-${band.max} concerns)`,version:'v2.1',credits:band.cap,unit:'result_image',quantity:1};
    assert.equal(selectTrialCost({items:[item]},actions),band.cap);
    assert.throws(()=>selectTrialCost({items:[{...item,credits:band.cap+1}]},actions));
  }
});

test('16개 결과의 선택 목록을 보존하며 피부 타입은 숫자로 만들지 않는다',()=>{
  const payload={data:{results:{output:PHOTO_ACTIONS.flatMap(type=>type==='skin_type'?['whole','t_zone','u_zone'].map((region,index)=>({type,region,skin_type:['Combination','Oily','Dry'][index],mask_urls:[`https://yce-us.s3-accelerate.amazonaws.com/test/${type}-${region}.jpg`]})):[{type,raw_score:60,mask_urls:[`https://yce-us.s3-accelerate.amazonaws.com/test/${type}.jpg`]}])}}};
  payload.status=200;payload.data.task_status='success';
  const result=normalizeAnalysis(payload,()=>Date.now(),PHOTO_ACTIONS);
  assert.equal(result.items.find(item=>item.type==='skin_type').rawScore,null);
  const reference=photoReference(result,'acne');
  assert.deepEqual(validatePhotoReference(JSON.parse(JSON.stringify(reference))),reference);
  assert.deepEqual(reference.actions,PHOTO_ACTIONS);
  assert.equal(reference.scores.skin_type,null);
  assert.deepEqual(reference.skinTypes,{whole:'Combination',t_zone:'Oily',u_zone:'Dry'});
  const missing={...reference,scores:{...reference.scores}};delete missing.scores.acne;
  assert.throws(()=>validatePhotoReference(missing));
  assert.throws(()=>photoReference({...result,items:result.items.slice(1)},'acne'));
});

test('권한 없는 전체 선택은 외부 호출 전에 차단하고 예약 때도 재검증한다',async()=>{
  let calls=0;
  const session=createAnalysisSession({apiKey:'synthetic-test-key',enabled:true,fetchImpl:async()=>{
    calls+=1;
    return Response.json({status:200,result:{skus:[{description:'AI Skin Analysis V2.1 SD (13-16 concerns)',amount:16,unit:'result_image',proc_unit:1,run_task_url:'https://yce-api-01.makeupar.com/s2s/v2.1/task/skin-analysis'}],next_token:null}});
  }});
  try{
    await assert.rejects(session.quote(PHOTO_ACTIONS));assert.equal(calls,0);
    const quote=await session.quote(PHOTO_ACTIONS,16);
    assert.deepEqual(quote.actions,PHOTO_ACTIONS);
    await assert.rejects(session.reserve(quote.id,PHOTO_CONSENT,PHOTO_CONSENT,4));
    assert.equal((await session.status()).used,false);
    await session.reserve(quote.id,PHOTO_CONSENT,PHOTO_CONSENT,16);assert.equal((await session.status()).used,true);
    assert.equal(calls,1);
  }finally{session.close();}
});
