#!/usr/bin/env node
// Explicit, local-only free probe. --preview never writes; --apply saves only
// independently publisher-verified government results and checks source health.
import {screenOfficialTradePolicy} from '../../src/server/officialTradePolicyMonitor.ts';
import {readFreeJson,writeFreeJson} from '../../src/server/freeDailyPublication.ts';

const mode=process.argv[2]||'--preview';
if(!['--preview','--apply'].includes(mode)){
 console.error('Usage: node --import tsx scripts/step7-integration/official-trade-policy.mjs --preview|--apply');
 process.exit(2);
}
if(mode==='--apply' && process.env.RMS_PUBLIC_READONLY==='1'){
 console.error('Public/read-only viewer cannot write local policy monitoring state.');
 process.exit(2);
}
const report=await screenOfficialTradePolicy();
console.log('RMS FREE OFFICIAL TRADE-POLICY MONITOR');
console.log(JSON.stringify({mode,checkedAt:report.checkedAt,status:report.status,reviewedCount:report.reviewedCount,
 policy:report.policy,coverage:report.coverage,sourceChecks:report.sourceChecks},null,2));
if(mode==='--apply'){
 if(report.status==='sources-unavailable'){
  console.error('No official source was reachable; previous saved publication preserved, not presented as newly verified.');
  process.exitCode=2;
 }else{
  const old=readFreeJson('free-transport-policy.json')||{};
  writeFreeJson('free-transport-policy.json',{...old,policy:report.policy,
   policyMonitor:report,checkedAt:report.checkedAt});
  console.log('SAVED OFFICIAL SCREENING RESULT. No MI, Gemini or Cloud changes.');
 }
}else console.log('PREVIEW ONLY — no data, Gemini, or Cloud writes.');
