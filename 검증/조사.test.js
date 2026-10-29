import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_KINDS } from '../화면/화장대순서.js';
import { PHOTO_SIMPLE_LABELS } from '../화면/사진항목.js';
import { withParticle } from '../화면/조사.js';

const pairs={
  '이/가':['이','가'],
  '을/를':['을','를'],
  '은/는':['은','는'],
  '과/와':['과','와'],
  '이에요/예요':['이에요','예요'],
  '으로/로':['으로','로'],
};

test('제품·사진 항목 모든 이름에 여섯 종류 조사를 받침에 맞게 붙인다',()=>{
  for(const name of [...Object.values(PRODUCT_KINDS),...Object.values(PHOTO_SIMPLE_LABELS)]){
    const last=name.charCodeAt(name.length-1);
    const final=last>=0xac00&&last<=0xd7a3?(last-0xac00)%28:0;
    for(const [pair,[consonant,vowel]] of Object.entries(pairs)){
      const expected=final&&!(pair==='으로/로'&&final===8)?consonant:vowel;
      assert.equal(withParticle(name,pair),`${name}${expected}`,`${name} ${pair}`);
    }
  }
  assert.equal(withParticle('선크림','으로/로'),'선크림으로');
  assert.equal(withParticle('거울','으로/로'),'거울로');
  assert.equal(withParticle('토너','이/가'),'토너가');
  assert.equal(withParticle('잡티','을/를'),'잡티를');
  assert.throws(()=>withParticle('수분','unknown'));
});
