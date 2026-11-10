import {test} from 'node:test';
import assert from 'node:assert/strict';
import {miReservedKrw,requireMiMonthlyRoom,previousMonthMiKrw} from '../miMonthlyBudget.ts';

test('all eight scheduled MI phases share a single monthly estimate cap',()=>{
  const original=[{reservedUsd:10,estimatedUsd:12},{reservedUsd:20}];
  assert.equal(miReservedKrw(original,1800),57600);
  assert.equal(requireMiMonthlyRoom(100000,30000,original,1,1800),1800);
  assert.throws(()=>requireMiMonthlyRoom(100000,45000,original,1,1800),/limit reached/);
  assert.throws(()=>requireMiMonthlyRoom(100000,0,original,1,NaN),/Verified FX/);
  assert.throws(()=>miReservedKrw([{reservedUsd:-1}],1800),/Invalid paid/);
});

test('KST monthly historical spending includes every earlier day and fails closed',async()=>{
  const archive=new Map([
    ['control/paid-daily/2026-11-02.json',JSON.stringify({version:2,day:'2026-11-02',requests:[{reservedUsd:3}]})],
    ['control/paid-daily/2026-11-04.json',JSON.stringify({version:2,day:'2026-11-04',requests:[{reservedUsd:2,estimatedUsd:4}]})]
  ]);
  const read=async(key:string):Promise<Uint8Array>=>{
    if(!archive.has(key))throw Error('Cloud publication read failed: HTTP 404');
    return Buffer.from(archive.get(key)!);
  };
  assert.equal(await previousMonthMiKrw('2026-11-05',1800,read),12600);
  assert.equal(await previousMonthMiKrw('2026-12-01',1800,read),0);
  archive.set('control/paid-daily/2026-11-03.json','{broken');
  await assert.rejects(previousMonthMiKrw('2026-11-05',1800,read),/Malformed/);
  const outage=async(_key:string):Promise<Uint8Array>=>{throw Error('Storage unavailable: HTTP 503');};
  await assert.rejects(previousMonthMiKrw('2026-11-05',1800,outage),/503/);
});
