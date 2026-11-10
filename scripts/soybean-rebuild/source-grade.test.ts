import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseGrade,safeExternalUrl,isGoogleRedirect,isPublicIp,documentHasSoybeanEvidence} from './source-grade.ts';

test('publisher content can be A only when readable and soybean-specific',()=>{
  const yes=chooseGrade({citation:true,publisherUrl:'https://www.usda.gov/reports/soybean-2026',status:200,type:'html',text:'USDA soybean balances. '.repeat(40)});
  assert.deepEqual(yes,{grade:'A',reason:'verified-html'});
  const empty=chooseGrade({citation:true,publisherUrl:'https://www.usda.gov/reports/report',status:200,type:'html',text:'About us. '.repeat(40)});
  assert.equal(empty.grade,'B');assert.equal(empty.reason,'publisher-unrelated');
});
test('Google-cited publisher 403 remains B, not discarded',()=>{
  const out=chooseGrade({citation:true,publisherUrl:'https://reuters.com/world/soybean-news',status:403,error:'publisher-http-error'});
  assert.equal(out.grade,'B');
});
test('provider citation without an independently accessible original remains B',()=>{
  const out=chooseGrade({citation:true,publisherUrl:null,error:'publisher-redirect-unresolved'});
  assert.equal(out.grade,'B');
});
test('cannot assign B or A to model-invented URL without Google citation',()=>{
  assert.equal(chooseGrade({citation:false,publisherUrl:'https://www.usda.gov/soybeans',status:200,type:'html',text:'soybeans '.repeat(100)}).grade,'EXCLUDED');
});
test('Wikipedia and unsafe URLs do not qualify as A/B',()=>{
  assert.equal(chooseGrade({citation:true,publisherUrl:'https://en.wikipedia.org/wiki/Soybean',status:200,type:'html',text:'soybean '.repeat(200)}).grade,'EXCLUDED');
  for(const unsafe of ['http://usda.gov/soybean','https://127.0.0.1/foo','https://localhost/foo','https://10.0.0.1/a','file:///tmp/foo']) assert.equal(safeExternalUrl(unsafe),null);
});
test('Google grounding redirect detected; private DNS responses refused',()=>{
  assert.equal(isGoogleRedirect(new URL('https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc')),true);
  assert.equal(isPublicIp('127.0.0.1'),false);assert.equal(isPublicIp('192.168.1.1'),false);assert.equal(isPublicIp('8.8.8.8'),true);
  assert.equal(documentHasSoybeanEvidence('Soybean production'),true);
});
