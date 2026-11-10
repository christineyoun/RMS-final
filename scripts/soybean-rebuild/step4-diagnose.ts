/**
 * Free STEP 4 postmortem: read LAST step4-analysis JSON locally, diagnose and
 * optionally salvage completed JSON objects from a truncated model reply.
 * IMPORTANT: no network/API, no edits or deletion of original snapshots.
 * Run: npx.cmd tsx scripts/soybean-rebuild/step4-diagnose.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {integrate,toMarkdown} from './step4-pipeline.ts';
import {recoverSavedResponse} from './step4-recovery.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';
import type {ReviewItem} from './step3-evidence.ts';

const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
if(!fs.existsSync(dir))throw Error('STEP 4 result directory missing: '+dir);
const filename=fs.readdirSync(dir).filter(x=>/^step4-analysis-.*\.json$/.test(x)).sort().at(-1);
if(!filename)throw Error('No existing step4-analysis-*.json was found; no API call will be made.');
const saved=JSON.parse(fs.readFileSync(path.join(dir,filename),'utf8')) as {
  status?:string;model?:string;rawModelResponse?:string;usageMetadata?:Record<string,unknown>|null;
  error?:string|null;step3File?:string;
};
assertSnapshotCommodity(saved,commodity,'4');
const raw=typeof saved.rawModelResponse==='string'?saved.rawModelResponse:'';
const usage=saved.usageMetadata||{};
const recovered=recoverSavedResponse(raw);
const head=raw.slice(0,150).replace(/\s+/g,' ');
const tail=raw.slice(-150).replace(/\s+/g,' ');
console.log('[STEP 4 DIAG] Gemini API calls: 0. Existing files unchanged.');
console.log('[STEP 4 DIAG] Source:',filename);
console.log('[STEP 4 DIAG] Previous status:',saved.status||'unknown');
console.log('[STEP 4 DIAG] Model:',saved.model||'unknown');
console.log('[STEP 4 DIAG] Raw model response length:',raw.length,'characters');
console.log('[STEP 4 DIAG] Usage metadata:',JSON.stringify(usage));
console.log('[STEP 4 DIAG] Saved API error:',saved.error||'none');
console.log('[STEP 4 DIAG] First 150 characters:',JSON.stringify(head));
console.log('[STEP 4 DIAG] Last 150 characters:',JSON.stringify(tail));
console.log('[STEP 4 DIAG] Offline parse mode:',recovered.parseMode);
console.log('[STEP 4 DIAG] Recovered completed JSON objects:',JSON.stringify(recovered.counts));
for(const warning of recovered.warnings)console.log('[STEP 4 DIAG] Note:',warning);
if(!recovered.modelResult){
  console.log('[STEP 4 DIAG] No recoverable analysis. Do not repeat a paid call until reviewing this diagnostic.');
  process.exit(0);
}
if(!saved.step3File||!/^step3-evidence-.*\.json$/.test(saved.step3File))throw Error('Missing safe STEP 3 reference in saved STEP 4 JSON.');
const originalStep3=JSON.parse(fs.readFileSync(path.join(dir,saved.step3File),'utf8')) as {items:ReviewItem[]};
assertSnapshotCommodity(originalStep3,commodity,'3');
if(!Array.isArray(originalStep3.items))throw Error('Invalid STEP 3 archive.');
const merged=integrate(originalStep3.items,recovered.modelResult,commodity);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const jsonPath=path.join(dir,`step4-recovered-${stamp}.json`);
const mdPath=path.join(dir,`step4-recovered-${stamp}.md`);
const metadata={model:saved.model||'unknown',step3File:saved.step3File,commodity,
  apiStatus:recovered.parseMode==='complete'?'offline-full-json-reparse':'offline-partial-json-recovery',
  notes:'진단용 부분 복구: 닫힌 JSON 항목만 보존. 모델 원본 응답과 STEP1~4 파일은 변경하지 않았습니다.'};
fs.writeFileSync(jsonPath,JSON.stringify({
  recoveredAt:new Date().toISOString(),commodity,sourceFile:filename,recoveryMode:recovered.parseMode,
  recoveredObjectCounts:recovered.counts,warnings:recovered.warnings,
  analysis:merged,originalModelResponseIsUnchanged:true,paidCalls:0,
},null,2),{mode:0o600});
fs.writeFileSync(mdPath,toMarkdown(merged,metadata),{mode:0o600});
console.log('[STEP 4 DIAG] Saved recovered JSON:',jsonPath);
console.log('[STEP 4 DIAG] Saved recovered report:',mdPath);
console.log('[STEP 4 DIAG] Source candidates preserved:',merged.audit.candidateCount);
console.log('[STEP 4 DIAG] Model-reviewed candidates recovered:',merged.audit.modelReviewedCount);
console.log('[STEP 4 DIAG] Recovered findings:',merged.findings.length);
console.log('[STEP 4 DIAG] Original model response and all STEP 1-4 files were NOT overwritten.');
