/** Optional one-shot orchestrator for existing STEP1-7 -> STEP7-1 -> STEP7-2 (local only). */
import path from 'node:path';import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspect,run,parseOptions,researchDir} from './research-pipeline-runner.mjs';
import {validatedLocalCard,validatedLocalRiskCard} from './step7-local-card-status.mjs';
const argv=process.argv.slice(2),allowReview=argv.includes('--allow-review-paid');
const cleaned=argv.filter(x=>x!=='--allow-review-paid');
const opts=parseOptions(cleaned);const root=process.cwd();
if(opts.help){console.log('Usage: node scripts/soybean-rebuild/research-verified-runner.mjs --commodity <id> --run-paid --approve-paid --max-paid 6 --allow-review-paid');process.exit(0);}
const cloudStep7Approved=process.env.CLOUD_RUN_JOB&&process.env.RMS_CLOUD_FREE_JOB==='1'&&process.env.RMS_STEP7_CLOUD_EXECUTION==='YES'&&!process.env.K_SERVICE;
if((process.env.NODE_ENV==='production'||process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)&&!cloudStep7Approved)throw Error('Only explicitly approved private Cloud Run Job permitted');
const codeRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 const tsxCli=path.join(codeRoot,'node_modules','tsx','dist','cli.mjs');
function call(script,...args){if(!fs.existsSync(tsxCli))throw Error('Local tsx CLI missing: npm install');
 const p=spawnSync(process.execPath,[tsxCli,path.join(codeRoot,'scripts','soybean-rebuild',script),'--commodity',opts.commodity,...args],
 {cwd:root,stdio:'inherit',shell:false,env:process.env});
 if(p.error)throw p.error;return p.status??1;}
console.log('[VERIFIED RUNNER] Commodity:',opts.commodity,'/ mode:',opts.mode,'/ review paid approved:',allowReview&&opts.approve);
if(opts.mode==='preview'){
 const status=inspect(root,opts.commodity);
 console.log('[VERIFIED RUNNER] Current:',status.action,status.reason||status.message||status.stage);
 if(fs.existsSync(researchDir(root,opts.commodity))){const code=call('step7-fact-review.ts','--inspect');if(code!==0)console.log('[VERIFIED RUNNER] No reviewable STEP7 yet.');}
 process.exit(0);
}
const base=run(root,opts);console.log('[VERIFIED RUNNER] Original pipeline:',base.action,base.reason||base.message||'');
const after=inspect(root,opts.commodity);
const hasReport=after.progress?.some(s=>s.startsWith('step7: '));
if(!hasReport){console.log('[VERIFIED RUNNER] No completed STEP7 text. No preview change.');process.exit(base.action==='done'?0:2);}
// A Step7 report-review-needed is a reviewable INPUT, not approval; never bypass STEP7-1.
if(!allowReview||!opts.approve||opts.mode!=='paid'){
 console.log('[VERIFIED RUNNER] Paid evidence review not approved; report remains unchanged.');process.exit(0);
}
// Reuse an earlier verified receipt for the current exact source report; no repeated Gemini billing.
const dir=researchDir(root,opts.commodity);
const originals=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x)).sort();
const originalFile=originals.at(-1);
const originalHash=originalFile?crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,originalFile))).digest('hex'):null;
const receipts=fs.readdirSync(dir).filter(x=>/^step7-fact-verified-.*\.json$/.test(x)).sort().reverse();
const matching=receipts.map(x=>{try{return {name:x,record:JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'))};}catch{return null;}}).find(x=>x?.record?.sourceFile===originalFile&&x.record.originalSha256===originalHash);
const verified=matching?.record?.status==='verified'&&matching?.record?.completionPolicy==='best-effort-v2'&&
 Array.isArray(matching.record.criticalAuditReasons)&&matching.record.criticalAuditReasons.length===0&&
 (matching.record.reviewComplete===true||(matching.record.reviewComplete===false&&matching.record.reviewQuality==='review-incomplete'));
console.log('[VERIFIED RUNNER] STEP7-1 already verified for this exact report:',verified?'YES (no new paid call)':'NO');
const step71=verified?0:matching?call('step7-fact-review.ts','--resume'):call('step7-fact-review.ts','--verify-paid','--approve-review-paid');
if(step71!==0){console.error('[VERIFIED RUNNER] STEP7-1 incomplete; local RMS retains old data.');process.exit(2);}
const step72=call('step7-fact-to-rms.ts','--apply-local');
if(step72!==0||!validatedLocalCard(dir,opts.commodity)){console.error('[VERIFIED RUNNER] STEP7-2 not accepted; old local card retained.');process.exit(2);}
if(!await validatedLocalRiskCard(dir,opts.commodity)){
 console.error('[VERIFIED RUNNER] Market report saved, but SCM risk is missing or lacks verified evidence. No false STEP7 completion and no automatic paid retry.');
 process.exit(2);
}
console.log('[VERIFIED RUNNER] DONE: fact-reviewed STEP7 with source-bound SCM risk -> LOCAL RMS card. NO Cloud Run publication.');
