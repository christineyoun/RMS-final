import fs from 'node:fs';import assert from 'node:assert/strict';
const p='src/components/CommodityDetail.tsx',before=fs.readFileSync('.rms-backups/palm-disclaimer-final-2026-10-26/CommodityDetail.tsx','utf8'),after=fs.readFileSync(p,'utf8');
const removed=before.split('\n').filter(l=>l.includes('{isPalmOil && <div')&&l.includes('CPO는 관측일 환율로 USD 환산'));
assert.equal(removed.length,1);assert(removed[0].includes('estimatedFxObservations')&&removed[0].includes('diagnostics?.lastError'));
assert.equal(after,before.split('\n').filter(l=>l!==removed[0]).join('\n'),'entire change is removal of one visible paragraph and its conditional suffixes');
for(const phrase of ['CPO는 관측일 환율로 USD 환산','표시통화는 공통 환율 적용','벤치마크 차이는 실제 정제마진이 아닙니다','일부 가격 원문 갱신 불가','일부 과거 환산값은 고정환율 추정입니다']){
 for(const entry of fs.readdirSync('src/components'))if(entry.endsWith('.tsx'))assert(!fs.readFileSync('src/components/'+entry,'utf8').includes(phrase),'no active alternative renderer: '+entry);
}
console.log('PASS paragraph and both diagnostic suffixes removed; every other component line, source style, header/control layout, data and calculations preserved.');
