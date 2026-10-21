/** Historical recovery ledger only. The temporary sequenced runner is retired.
 * Retain a fail-closed export for old local scripts; it never generates or writes. */
import fs from 'node:fs';
import path from 'node:path';
export function recoveryStatus(){
  const file=path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3/analysis-recovery.json');
  let runs:any[]=[];
  if(fs.existsSync(file)){
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Array.isArray(saved.runs))throw Error('Historical recovery ledger invalid; review required.');
    runs=saved.runs;
  }
  return {retired:true,replacement:'/api/rms/control/standalone-analysis',runs};
}
export async function runAnalysisRecovery(..._legacyArguments:unknown[]):Promise<any>{
  throw Error('Sequenced recovery execution retired. Use the owner-approved standalone analysis control.');
}
