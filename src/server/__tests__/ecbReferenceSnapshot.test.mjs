import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildVerifiedEcbSnapshot,verifiedEcbPrevious} from '../ecbReferenceSnapshot.ts';
const fx=(date,krw,eur)=>({base:'USD',date,rates:{KRW:krw,EUR:eur,MYR:4.2}});
const saved=(raw,verifiedAt='2026-11-10T05:00:00.000Z')=>({raw,verifiedAt});
test('new ECB release preserves the actual previous reference date across a weekend',()=>{
 const old=saved(fx('2026-11-06',1358.73,.89566));
 const next=buildVerifiedEcbSnapshot(fx('2026-11-09',1346.79,.89342),'2026-11-10T00:00:00Z',old);
 assert.equal(next.previous.raw.date,'2026-11-06');
 assert.equal(verifiedEcbPrevious(next).raw.rates.KRW,1358.73);
 assert.equal(next.raw.rates.KRW/next.raw.rates.EUR>0,true);
});
test('same-date recheck retains verified comparison, not self-comparison',()=>{
 const old=saved(fx('2026-11-06',1358.73,.89566));
 const next=buildVerifiedEcbSnapshot(fx('2026-11-09',1346.79,.89342),'2026-11-10T00:00:00Z',old);
 const repeat=buildVerifiedEcbSnapshot(next.raw,'2026-11-10T01:00:00Z',next);
 assert.equal(verifiedEcbPrevious(repeat).raw.date,'2026-11-06');
});
test('older and malformed responses cannot replace saved verified data',()=>{
 const old=saved(fx('2026-11-09',1346.79,.89342));
 assert.throws(()=>buildVerifiedEcbSnapshot(fx('2026-11-06',1358.73,.89566),'2026-11-10T01:00:00Z',old),/older reference date/);
 assert.throws(()=>buildVerifiedEcbSnapshot({base:'EUR',date:'2026-11-10',rates:{KRW:1,EUR:1}},'2026-11-10T01:00:00Z',old),/Invalid dated/);
});
test('missed sessions do not fabricate a prior-day comparison',()=>{
 const old=saved(fx('2026-11-05',1358.73,.89566));
 const next=buildVerifiedEcbSnapshot(fx('2026-11-10',1346.79,.89342),'2026-11-10T12:00:00Z',old);
 assert.equal(verifiedEcbPrevious(next),null);
});
