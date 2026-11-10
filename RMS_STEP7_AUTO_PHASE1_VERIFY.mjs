import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const pub=read('scripts/cloud/publication.ts');
const ordered=['run=await runner.check()','aiResult=await runAi','step7Result=await step7','await(options.publishOverview'];
for(let i=0;i<ordered.length-1;i++)assert(pub.includes(ordered[i])&&pub.indexOf(ordered[i])<pub.indexOf(ordered[i+1]),'Unchanged pipeline execution order must be free -> news -> STEP7 -> overview');
const {checks}=JSON.parse(fs.readFileSync(new URL('./auto-step7-manifest.json',import.meta.url),'utf8'));
for(const f of ['src/server/freeSourceRefresh.ts','src/server/marketIntelligenceService.ts','src/server/scheduledAi.ts','src/server/freeDailyJobs.ts'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),checks[f],'Existing market / news implementation changed: '+f);
// The new adapter source must remain disabled until payment and publication safeguards are written.
assert.match(read('scripts/cloud/scheduledStep7.ts'),/status:'not-enabled'/);
console.log('PASS: unchanged price/supply/weather/news code; STEP7 hook order verified; paid execution disabled. No API calls.');
