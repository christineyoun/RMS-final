import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createFreeSourceRunner} from '../freeSourceRefresh.ts';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rms-recovery-fixture-'));let good=0,bad=0,blocked=0;
fs.writeFileSync(path.join(directory,'settings.json'),JSON.stringify({freeAutoEnabled:true,autoEnabled:false}));
const runner=createFreeSourceRunner({directory,now:()=>new Date('2026-10-26T00:01:00Z'),jobs:()=>[
 {key:'good',run:async()=>{good++;return {observationDate:'2026-10-23',price:1};}},
 {key:'transient',run:async()=>{bad++;if(bad===1)throw Error('temporary timeout');return {observationDate:'2026-10-23',price:2};}},
 {key:'blocked',retryable:false,run:async()=>{blocked++;throw Error('written authorization not recorded');}}
]});
await runner.check();assert.deepEqual([good,bad,blocked],[1,1,1]);
await runner.check();assert.deepEqual([good,bad,blocked],[1,1,1]);
const result=await runner.retryFailed();assert.deepEqual([good,bad,blocked],[1,2,1]);assert.equal(result.recoveryPasses,1);
assert.equal(await runner.retryFailed(),null);assert.equal(await runner.check(),null);assert.deepEqual([good,bad,blocked],[1,2,1]);
console.log('PASS one explicit bounded same-day recovery, successful collectors not repeated, licensing blocker not retried, restart/same-day guard retained.');
