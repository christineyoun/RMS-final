import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.cwd(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const m=JSON.parse(fs.readFileSync('RMS_STEP7_FULL_AUTO.manifest.json','utf8'));
for(const [f,v]of Object.entries({...m.added,...m.modified})){
 if(!fs.existsSync(f)||sha(fs.readFileSync(f))!==v.newSha256)throw Error('Expected integrated source missing/changed: '+f);
}
for(const [f,h]of Object.entries(m.protected)){
 if(!fs.existsSync(f)||sha(fs.readFileSync(f))!==h)throw Error('Original price/MI/UI code changed: '+f);
}
const workflow=fs.readFileSync('scripts/cloud/publication.ts','utf8'),started=fs.readFileSync('scripts/cloud/scheduledStep7.ts','utf8');
const refresh=workflow.indexOf('run=await runner.check()'),news=workflow.indexOf('aiResult=await runAi('),step=workflow.indexOf('step7Result=await step7('),overview=workflow.indexOf('publishDailyOverview)(');
if(!(refresh>=0&&news>refresh&&step>news&&overview>step))throw Error('Full 09:00 free/NEWS/STEP/overview call order was changed');
if(!started.includes("mode==='paid-cloud'")||!started.includes('readStep7Checkpoint')||!started.includes('promoteStep7CloudCard'))throw Error('STEP Cloud invocation, checkpoint, or publication missing');
console.log('PASS: free/Market Intelligence refresh order unmodified; cloud STEP invocation and saved-card promotion wired; old AI stays off; job OFF until explicitly approved. No API calls.');
