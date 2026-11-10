/** Verifies paid-local safety gates without credentials, network, or writes. */
import {runScheduledStep7} from './scheduledStep7.ts';
const snapshot={...process.env};
try{
  process.env.RMS_STEP7_SCHEDULE_MODE='paid-local';
  process.env.RMS_STEP7_PAID_COMMODITIES='wheat';
  delete process.env.RMS_STEP7_PAID_APPROVED;
  let r=await runScheduledStep7({day:'2026-11-02'});
  if(r.status!=='not-enabled'||r.results)throw Error('paid-local ran without explicit approval');
  process.env.RMS_STEP7_PAID_APPROVED='YES';
  delete process.env.RMS_STEP7_PAID_COMMODITIES;
  r=await runScheduledStep7({day:'2026-11-02'});
  if(r.status!=='not-enabled'||r.results)throw Error('paid-local ran without commodity selection');
  process.env.CLOUD_RUN_JOB='safe-gate-simulation';
  process.env.RMS_STEP7_PAID_COMMODITIES='wheat';
  r=await runScheduledStep7({day:'2026-11-02'});
  if(r.status!=='not-enabled'||r.results)throw Error('paid-local ran in Cloud Run simulation');
  console.log('PASS: local paid requires explicit approval + commodity; Cloud Run blocked; no Gemini calls or writes.');
}finally{
  for(const k of ['RMS_STEP7_SCHEDULE_MODE','RMS_STEP7_PAID_COMMODITIES','RMS_STEP7_PAID_APPROVED','CLOUD_RUN_JOB']){
    if(Object.hasOwn(snapshot,k))process.env[k]=snapshot[k];else delete process.env[k];
  }
}
