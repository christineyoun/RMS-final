/** Audit existing saved STEP7 JSON again, offline and without modifying stored reports. */
import fs from 'node:fs';
import path from 'node:path';
import {auditFinalResult,buildFinalData,parseFinalResult} from './step7-core.ts';
const dir=path.join(process.cwd(),'.rms-soybean-rebuild');
const name=process.argv.find(s=>s.startsWith('--file='))?.slice(7)||
  fs.readdirSync(dir).filter(s=>/^step7-final-[\w.-]+\.json$/.test(s)).sort().at(-1);
if(!name||!/^step7-final-[\w.-]+\.json$/.test(name))throw Error('No STEP7 JSON in local evidence directory');
const saved=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const parsed=saved.result||parseFinalResult(saved.rawText||'');
if(!parsed)throw Error('Saved report has no parseable result; raw content remains in original file');
const data=buildFinalData(dir);
if(saved.commodity!==data.commodity)throw Error('Commodity mismatch');
const audit=auditFinalResult(parsed,data);
console.log('[STEP7 QUALITY REVIEW] OFFLINE / Gemini calls: 0 / files changed: 0');
console.log('[STEP7 QUALITY REVIEW] File:',name);
console.log('[STEP7 QUALITY REVIEW] Original status:',saved.status);
console.log('[STEP7 QUALITY REVIEW] Source inventory:',data.counts.sources,'Excerpts:',data.counts.excerpts);
console.log('[STEP7 QUALITY REVIEW] Claim traces:',audit.claimEvidenceCount);
console.log('[STEP7 QUALITY REVIEW] Recommendation:',audit.reviewReasons.length?'REVIEW-NEEDED':'PASS');
for(const reason of audit.reviewReasons)console.log(' -',reason);
