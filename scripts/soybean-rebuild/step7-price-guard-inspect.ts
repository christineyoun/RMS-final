/** Read-only offline recheck of the latest saved STEP7 report; NEVER approves or publishes. */
import fs from 'node:fs';
import path from 'node:path';
import {commodityFromArgv,resultFolder} from './commodity-config.ts';
import {auditFinalResult,buildFinalData,type FinalResult} from './step7-core.ts';

const args=process.argv.slice(2);
const commodity=commodityFromArgv(args);
if(args.length!==2||args[0]!=='--commodity')throw Error('Usage: --commodity tapioca-starch');
const root=process.cwd(),dir=resultFolder(commodity,root);
const latest=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x)).sort().at(-1);
if(!latest)throw Error('No STEP7 report for '+commodity);
const saved=JSON.parse(fs.readFileSync(path.join(dir,latest),'utf8'));
if(saved.stage!=='final-market-outlook-and-procurement'||saved.commodity!==commodity||!saved.result)
  throw Error('No valid STEP7 result for the selected commodity. No writes performed.');
const data=buildFinalData(dir);
if(data.commodity!==commodity)throw Error('Evidence commodity mismatch; no writes performed.');
const oldReasons=Array.isArray(saved.audit?.reviewReasons)?saved.audit.reviewReasons:[];
const newAudit=auditFinalResult(saved.result as FinalResult,data);
console.log('[STEP7 PRICE GUARD] READ ONLY. NO API, NO FILE MODIFICATION, NO RMS PUBLICATION.');
console.log('[STEP7 PRICE GUARD] Commodity:',commodity,'file:',latest);
console.log('[STEP7 PRICE GUARD] Stored status:',saved.status,'(not changed)');
console.log('[STEP7 PRICE GUARD] Prior reasons:',oldReasons.length?oldReasons.join(' | '):'none');
console.log('[STEP7 PRICE GUARD] Current reasons:',newAudit.reviewReasons.length?newAudit.reviewReasons.join(' | '):'none');
console.log('[STEP7 PRICE GUARD] Result:',newAudit.reviewReasons.length?'HOLD':'OFFLINE CHECK PASS');
console.log('[STEP7 PRICE GUARD] Saved status is NOT upgraded and this command does NOT publish.');
