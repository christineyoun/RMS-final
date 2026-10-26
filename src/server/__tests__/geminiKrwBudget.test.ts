import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {savedGeminiBudget} from '../geminiKrwBudget.ts';
import {validateScheduledPolicy,configuredScheduledPolicy,policyHash} from '../scheduledAi.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-krw-telemetry-')),now=new Date('2026-10-26T00:05:00Z');fs.mkdirSync(path.join(root,'.rms-stage3'));
const file=path.join(root,'.rms-stage3/free-fx.json'),policy={fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20};
const write=(rate:number,date='2026-10-23')=>fs.writeFileSync(file,JSON.stringify({raw:{base:'USD',date,rates:{KRW:rate,EUR:0.9}},verifiedAt:'2026-10-26T00:00:00Z'}));
write(1324.45);assert.equal(savedGeminiBudget(policy,root,now).safetyKrwPerUsd,1800);
write(2000);assert.equal(savedGeminiBudget(policy,root,now).safetyKrwPerUsd,2400);
write(1324.45,'2026-10-01');assert.equal(savedGeminiBudget(policy,root,now).safetyKrwPerUsd,null);
fs.unlinkSync(file);assert.equal(savedGeminiBudget(policy,root,now).safetyKrwPerUsd,null);
const approved=JSON.parse(fs.readFileSync('scripts/cloud/weekday-ai-policy.approved.json','utf8'));
for(const day of ['2026-10-26T00:00:00Z','2026-11-26T00:00:00Z','2030-01-01T00:00:00Z'])assert.equal(validateScheduledPolicy(approved,new Date(day)),approved);
for(const key of ['validThrough','validFrom','maxDailyCalls','maxDailyEstimatedKrw'])assert(!(key in approved));
assert.equal(approved.monthlyOperatingBudgetKrw,100000);assert.equal(approved.automaticTopUp,false);assert.equal(approved.automaticPayment,false);
assert.equal(validateScheduledPolicy({...approved,monthlyOperatingBudgetKrw:1}).monthlyOperatingBudgetKrw,1,'Operating budget is metadata');
assert.throws(()=>validateScheduledPolicy({version:'weekday-ai-v1',enabled:true} as any),/invalid/);
const example=JSON.parse(fs.readFileSync('scripts/cloud/scheduled-ai-policy.example.json','utf8'));assert.equal(example.enabled,false);
const env={...process.env};
try{
 delete process.env.GEMINI_API_KEY;
 Object.assign(process.env,{CLOUD_RUN_JOB:'rms-free-refresh',RMS_CLOUD_FREE_JOB:'1',RMS_SCHEDULED_AI_POLICY_FILE:path.resolve('scripts/cloud/weekday-ai-policy.approved.json'),RMS_SCHEDULED_AI_APPROVAL:policyHash(approved),RMS_GEMINI_API_KEY_FILE:path.join(root,'nonexistent')});
 assert.throws(()=>configuredScheduledPolicy());
 fs.writeFileSync(path.join(root,'fixture-secret'),'offline-placeholder');process.env.RMS_GEMINI_API_KEY_FILE=path.join(root,'fixture-secret');
 assert.equal(configuredScheduledPolicy()?.version,'weekday-ai-prepaid-v3');assert.equal(process.env.GEMINI_API_KEY,'offline-placeholder');
}finally{process.env=env;fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS FX telemetry, missing/stale FX, indefinite policy, metadata-only operating budget, existing mounted secret and disabled example. No provider calls.');
