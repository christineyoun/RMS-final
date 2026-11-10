/** Explicit local no-cost test. Does NOT invoke free-market or MI refresh. */
const {runScheduledStep7}=await import('./scheduledStep7.ts');
if(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production')throw Error('Local-only probe');
process.env.RMS_STEP7_SCHEDULE_MODE='inspect';
const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const k=Object.fromEntries(parts.map(({type,value})=>[type,value]));
const today=`${k.year}-${k.month}-${k.day}`;
const result=await runScheduledStep7({day:today});
console.log('PHASE2 PROBE:',JSON.stringify(result,null,2));
if(!Array.isArray(result.results)||result.results.length!==8||result.results.some(r=>r.code!==0||r.paidCalls!==0))process.exitCode=2;
else console.log('PASS: all 8 real STEP runner inspectors invoked; 0 Gemini calls; publication unchanged.');
