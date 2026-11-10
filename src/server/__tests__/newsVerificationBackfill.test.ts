import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWithBoundedBackfill} from '../newsVerifiedBackfill.ts';

test('checks a second bounded batch if earlier original pages are inaccessible',async()=>{
  const candidates=Array.from({length:28},(_,i)=>i);
  const seen:number[]=[];
  const checked=await verifyWithBoundedBackfill(candidates,async candidate=>{
    seen.push(candidate);
    return candidate>=20?candidate:null;
  });
  assert.deepEqual(checked,[20,21,22,23,24,25,26,27]);
  assert.equal(seen.length,28);
  assert.deepEqual(candidates,Array.from({length:28},(_,i)=>i));
});

test('does not make unnecessary second-batch original-page requests',async()=>{
  const checked:number[]=[];
  const verified=await verifyWithBoundedBackfill(Array.from({length:32},(_,i)=>i),async i=>{
    checked.push(i);
    return i<8?i:null;
  });
  assert.deepEqual(verified,[0,1,2,3,4,5,6,7]);
  assert.equal(checked.length,16);
});

test('fails closed on invalid bounds without running any verification',async()=>{
  let calls=0;
  const result=await verifyWithBoundedBackfill([1,2],async i=>{calls++;return i;},{maximum:64});
  assert.deepEqual(result,[]);
  assert.equal(calls,0);
});
