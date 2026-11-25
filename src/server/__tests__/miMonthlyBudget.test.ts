import {test} from 'node:test';
import assert from 'node:assert/strict';
import {miReservedKrw,requireMiMonthlyRoom,previousMonthMiKrw,miAccountedUsd} from '../miMonthlyBudget.ts';

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


test('completed usage reconciles both smaller and larger estimates; unresolved requests remain fully reserved',()=>{
  const original=[{reservedUsd:1,estimatedUsd:.2},{reservedUsd:1,estimatedUsd:1.2},{reservedUsd:1},{reservedUsd:1,estimatedUsd:0},{reservedUsd:1,estimatedUsd:1}];
  const before=JSON.stringify(original);
  assert.deepEqual(original.map(miAccountedUsd),[.2,1.2,1,1,1]);
  assert.equal(miReservedKrw(original,1800),7920);
  assert.equal(JSON.stringify(original),before);
  for(const estimatedUsd of [NaN,Infinity,-1])assert.throws(()=>miAccountedUsd({reservedUsd:1,estimatedUsd}),/Invalid paid/);
  assert.throws(()=>miAccountedUsd({reservedUsd:0,estimatedUsd:.2}),/Invalid paid/);
});

test('new requests reserve full cost; reconciliation never overrides authorized cap',()=>{
  const completed=[{reservedUsd:20,estimatedUsd:2}];
  const pending=[...completed,{reservedUsd:20}];
  assert.equal(requireMiMonthlyRoom(50000,10000,completed,10,1800),18000);
  assert.throws(()=>requireMiMonthlyRoom(50000,10000,pending,10,1800),/limit reached/);
  assert.throws(()=>requireMiMonthlyRoom(50000,49000,completed,1,1800),/limit reached/);
  assert.throws(()=>requireMiMonthlyRoom(50000,0,completed,1,0),/Verified FX/);
});

test('prior-month daily journals reconcile completed usage without mutating persisted records',async()=>{
  const rows={version:2,day:'2026-11-01',requests:[{reservedUsd:10,estimatedUsd:1},{reservedUsd:5},{reservedUsd:1,estimatedUsd:2}]};
  const bytes=Buffer.from(JSON.stringify(rows));
  const original=bytes.toString();
  const read=async(key:string)=>{if(key==='control/paid-daily/2026-11-01.json')return bytes;throw Error('HTTP 404');};
  assert.equal(await previousMonthMiKrw('2026-11-03',1800,read),14400);
  assert.equal(bytes.toString(),original);
  assert.equal(await previousMonthMiKrw('2026-12-01',1800,read),0);
});

test('overflow and malformed records fail closed',()=>{
  assert.throws(()=>miReservedKrw([{reservedUsd:Number.MAX_VALUE}],1800),/Invalid paid request accounting total/);
  assert.throws(()=>requireMiMonthlyRoom(100000,0,[],Number.MAX_VALUE,1800),/Invalid monthly AI spending authorization/);
  assert.throws(()=>miReservedKrw([null as any],1800),/Invalid paid request record/);
});
