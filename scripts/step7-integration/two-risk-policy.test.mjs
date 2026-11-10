import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS,parseArgs,kstDay,ensureCurrentDay,unreviewedAttemptFiles} from './two-risk-policy.mjs';
test('one shared recovery policy supports all eight commodities and refuses unknown identifiers',()=>{
 assert.deepEqual(TARGETS,['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
 for(const id of TARGETS)
  assert.equal(parseArgs(['paid-one',`--commodity=${id}`,'--approve-paid=YES']).commodity,id);
 assert.throws(()=>parseArgs(['paid-one','--commodity=unknown','--approve-paid=YES']),/Only known RMS commodities/);
});
test('no implicit paid calls; paid flags cannot be attached to free/status/map',()=>{
 assert.deepEqual(parseArgs([]),{mode:'status',commodity:null,approved:false});
 for(const m of ['paid-one','review-once'])assert.throws(()=>parseArgs([m,'--commodity=soybean']),/requires/);
 for(const m of ['free','map'])assert.throws(()=>parseArgs([m,'--commodity=soybean','--approve-paid=YES']),/requires/);
 assert.equal(parseArgs(['paid-one','--commodity=potato-starch','--approve-paid=YES']).approved,true);
 assert.throws(()=>parseArgs(['all','--commodity=soybean','--approve-paid=YES']),/Mode must/);
});
test('KST day is computed dynamically and conflicting prior day is rejected',()=>{
 const date=new Date('2026-11-06T16:00:00Z');
 assert.equal(kstDay(date),'2026-11-07');
 assert.equal(ensureCurrentDay({},date),'2026-11-07');
 assert.throws(()=>ensureCurrentDay({RMS_RESEARCH_RUN_DAY:'2026-11-06'},date),/differs/);
 for(const env of [{CLOUD_RUN_JOB:'1'},{K_SERVICE:'viewer'},{NODE_ENV:'production'},{RMS_PUBLIC_READONLY:'1'}])
  assert.throws(()=>ensureCurrentDay(env,date),/denied/);
});
test('paid stage and review attempt markers are retained, not deleted or overridden',()=>{
 const names=['paid-step1.json','paid-step4.json','paid-step7.json','step7-fact-attempt-0123456789abcdef0123.json','some-report.json'];
 assert.equal(unreviewedAttemptFiles(names).length,4);
});
test('production script has no hardcoded article, price, URL, or risk text and limits research call to one',async()=>{
 const fs=await import('node:fs');const src=fs.readFileSync(new URL('./complete-missing-risks.mjs',import.meta.url),'utf8');
 assert.match(src,/maxPaid:1,approve:true/);
 assert.doesNotMatch(src,/--max-paid['", ]+6|\bcloud\.run\/|\bUSD\/MT\b|summarySentenceKo\s*:/);
 assert.doesNotMatch(src,/\.unlinkSync\(|\.rmSync\(/);
 assert.match(src,/if\(initial.todayAccepted\|\|initial.accepted\)/);
});
