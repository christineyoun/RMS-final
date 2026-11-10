/** Local static regression check. No API calls, no code edits, no cloud actions. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.cwd(),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const hash=f=>crypto.createHash('sha256').update(read(f)).digest('hex');
const check=(c,msg)=>{if(!c)throw Error('FAIL: '+msg)};
const protectedFiles={
 'src/server/freeSourceRefresh.ts':'4e56b153846563ba3c3d1beb16f30e77f902626ce94d00401e6eb1f7f4f4db09',
 'src/server/marketIntelligenceService.ts':'11e3bb9087c61dccda468f1cffcf28cb52432669f1a8056ceb3c990b619d6f29',
 'src/server/scheduledAi.ts':'826536746072411b25ce6e2892313b66ac34dfa5e557b6070279710bf43c22f5',
 'src/server/freeDailyJobs.ts':'11b3be43ff624109d02d5eba22308684233a714eb4eed1770ba69337929d5c3f',
};
for(const [f,h]of Object.entries(protectedFiles))check(hash(f)===h,`protected file changed: ${f}`);
const scheduled=read('scripts/cloud/scheduledStep7.ts'),worker=read('scripts/cloud/step7PaidLocalWorker.mjs'),pub=read('scripts/cloud/publication.ts');
check(pub.includes('step7Result=await step7')&&pub.indexOf('aiResult=await runAi')<pub.indexOf('step7Result=await step7')&&pub.indexOf('step7Result=await step7')<pub.indexOf('await(options.publishOverview'),'original refresh order');
for(const text of ["mode==='paid-local'","RMS_STEP7_PAID_APPROVED!=='YES'","RMS_STEP7_PAID_COMMODITIES","if(isCloud())",'RMS_RESEARCH_RUN_DAY'])check(scheduled.includes(text),'missing local paid guard: '+text);
for(const text of ['--run-paid','--approve-paid','--max-paid',"'6'",'--allow-review-paid','approvedForPublication===false','Cloud Run is deliberately blocked','validat'])check(worker.includes(text),'missing worker gate: '+text);
check(!scheduled.includes('process.env.RMS_STEP7_SCHEDULE_MODE||\'paid-local\''),'paid mode must not be default');
const calls={
 'step1-google.ts':'maxOutputTokens:3200',
 'step4-analyze.ts':'maxOutputTokens:8192',
 'step5-search.ts':'maxOutputTokens:3200',
 'step5-decision-run.ts':'maxOutputTokens:6200',
 'step6-search.ts':'maxOutputTokens:3200',
 'step7-run.ts':'maxOutputTokens:12000',
 'step7-fact-review.ts':'maxOutputTokens:16000',
};
for(const [f,part]of Object.entries(calls))check(read('scripts/soybean-rebuild/'+f).includes(part),'original token cap differs: '+f);
console.log('PASS: existing price/supply/weather/Market Intelligence unchanged; 7 STEP token caps intact.');
console.log('PASS: paid-local requires explicit approval + selected commodities; cloud blocked; 6 paid stages + 1 review max; 0 API calls.');
