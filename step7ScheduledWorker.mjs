/** Offline/free-only adapter to the REAL STEP1–7 research-pipeline-runner.
 * Used by scheduledStep7.ts. Intentionally no paid invocation support whatsoever.
 */
import {inspect,run,COMMODITIES} from '../soybean-rebuild/research-pipeline-runner.mjs';

const args=process.argv.slice(2);
const i=args.indexOf('--commodity');
const commodity=i>=0?args[i+1]:undefined;
const mode=args.includes('--inspect')?'inspect':args.includes('--free')?'free':null;
if(!COMMODITIES.includes(commodity)||!mode||args.length!==3)throw Error('Only --commodity <known id> plus --inspect/--free is supported');
if(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production')throw Error('Cloud Run blocked until daily paid and publication safeguards are complete');
// No API keys are passed from parent. The underlying runner only executes
// paid stages with mode:'paid', which is NEVER selected here.
const options={commodity,mode:mode==='inspect'?'preview':'free',maxPaid:1,approve:false};
const result=mode==='inspect'?inspect(process.cwd(),commodity):run(process.cwd(),options);
const receipt={commodity,action:result.action,stage:result.stage||null,paidCalls:result.paidCalls||0};
console.log('RMS_SCHEDULED_STEP7_JSON='+JSON.stringify(receipt));
if(receipt.paidCalls!==0)throw Error('Unexpected paid attempt');
