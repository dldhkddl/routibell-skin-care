import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_ACTIONS, PHOTO_LABELS } from '../화면/사진항목.js';
import { normalizeAnalysis } from '../서버/유캠분석.js';
import { photoReference, validatePhotoReference } from '../화면/사진계산.js';

const outputFor=(type,region)=>({type,...(region?{region,skin_type:{whole:'Combination',t_zone:'Oily',u_zone:'Dry'}[region]}:{raw_score:65}),mask_urls:[`https://yce-us.s3-accelerate.amazonaws.com/mock/${type}${region?`-${region}`:''}.png`]});
const responseFor=output=>({status:200,data:{task_status:'success',results:{output}}});

for(const action of PHOTO_ACTIONS){
  test(`${PHOTO_LABELS[action]}: 현재 지원 계약의 저장 왕복·누락·중복·이미지·점수 검증`,()=>{
    const normalize=output=>normalizeAnalysis(responseFor(output),Date.now,[action]);
    const outputs=action==='skin_type'?['whole','t_zone','u_zone'].map(region=>outputFor(action,region)):[outputFor(action)];
    const result=normalize(outputs);
    const reference=photoReference(result,action);
    assert.deepEqual(validatePhotoReference(JSON.parse(JSON.stringify(reference))),reference);
    assert.equal(reference.scores[action],action==='skin_type'?null:65);
    for(const output of [[],[outputFor(action),outputFor(action)],[{...outputFor(action),mask_urls:[]}],[{...outputFor(action),mask_urls:['first','second']}],[{...outputFor(action),mask_urls:null}]]){
      assert.ok(normalize(output).items[0].warnings.length>0);
    }
    for(const score of [null,'65',NaN,Infinity,0,101]){
      if(action==='skin_type')assert.equal(normalize(outputs.map(item=>({...item,raw_score:score}))).items[0].rawScore,null);
      else {const partial=normalize([{...outputFor(action),raw_score:score}]);assert.equal(partial.items[0].rawScore,null);assert.equal(partial.items[0].images.length,1);assert.throws(()=>photoReference(partial,action));}
    }
    assert.deepEqual(normalize([{...outputFor(action),mask_urls:['https://untrusted.example/photo']}]).items[0].images,[]);
  });
}

test('피부 타입 세 영역을 분류형으로 저장하고 누락·중복·알 수 없는 분류는 저장하지 않는다',()=>{
  const regions=['whole','t_zone','u_zone'].map(region=>outputFor('skin_type',region));
  const normalize=output=>normalizeAnalysis(responseFor(output),Date.now,['skin_type']);
  const complete=normalize([regions[2],regions[0],regions[1]]);
  assert.equal(complete.items[0].verified,true);
  assert.equal(complete.items[0].rawScore,null);
  assert.deepEqual(complete.items[0].skinTypes,{whole:'Combination',t_zone:'Oily',u_zone:'Dry'});
  assert.deepEqual(complete.items[0].regions.map(item=>item.images.length),[1,1,1]);
  assert.deepEqual(photoReference(complete,'skin_type').skinTypes,complete.items[0].skinTypes);
  const unsafe=normalize([{...regions[0],mask_urls:[...regions[0].mask_urls,'https://untrusted.example/face.jpg']},regions[1],regions[2]]);
  assert.equal(unsafe.items[0].verified,true);
  assert.deepEqual(unsafe.items[0].regions[0].images,regions[0].mask_urls);
  assert.ok(!JSON.stringify(unsafe).includes('untrusted.example'));
  for(const output of [regions.slice(0,2),[...regions,regions[0]],[regions[0],regions[0],regions[2]],[...regions.slice(0,2),{...regions[2],skin_type:'<script>'}],[...regions.slice(0,2),{...regions[2],region:'unknown'}]]){
    const partial=normalize(output);
    assert.equal(partial.items[0].verified,false);
    assert.equal(partial.items[0].skinTypes,null);
    assert.throws(()=>photoReference(partial,'skin_type'));
    assert.ok(!JSON.stringify(partial).includes('<script>'));
  }
  for(const changed of [{skinTypes:{whole:'Dry',t_zone:'Oily'}},{skinTypes:{whole:'Unknown',t_zone:'Oily',u_zone:'Dry'}},{skinTypes:{...complete.items[0].skinTypes,extra:'Dry'}}])assert.throws(()=>validatePhotoReference({...photoReference(complete,'skin_type'),...changed}));
});

test('여드름·유분·수분·피부 타입 조합은 실패 항목을 구별하고 응답 원문을 노출하지 않는다',()=>{
  const actions=['acne','moisture','oiliness','skin_type'];
  const output=actions.map(outputFor);
  output[3].mask_urls=[];
  output[3].privateValue='DO-NOT-EXPOSE';
  const result=normalizeAnalysis(responseFor(output),Date.now,actions);
  assert.equal(result.items.filter(item=>item.images.length).length,3);
  assert.ok(result.items[3].warnings.some(warning=>warning.includes('이미지 없음')));
  assert.ok(!JSON.stringify(result).includes('DO-NOT-EXPOSE'));
});

test('복수 이미지 중 안전한 주소만 모두 표시하고 점수 오류와 분리한다',()=>{
  const item=outputFor('acne');item.raw_score=null;
  item.mask_urls.push('https://yce-us.s3-accelerate.amazonaws.com/mock/second.png','https://evil.example/private');
  const result=normalizeAnalysis(responseFor([item]),Date.now,['acne']);
  assert.equal(result.items[0].images.length,2);
  assert.equal(result.items[0].verified,false);
  assert.ok(!JSON.stringify(result).includes('evil.example'));
  assert.throws(()=>photoReference(result,'acne'));
});
