/** Free stage7 router and common final prompt preview, never calls Gemini. */
import path from 'node:path';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';
import {buildFinalData,buildFinalPrompt} from './step7-core.ts';
const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
const data=buildFinalData(dir);
if(data.commodity!==commodity)throw Error('STEP7 commodity mismatch; no paid call or writes.');
const prompt=buildFinalPrompt(data);
console.log('[STEP 7 PREVIEW] No Gemini calls. No old files changed.');
console.log('[STEP 7 PREVIEW] Route:',data.route,'/ Commodity:',data.commodity);
console.log('[STEP 7 PREVIEW] Input files:',JSON.stringify(data.files));
console.log('[STEP 7 PREVIEW] A/B/excerpt totals:',JSON.stringify(data.counts));
console.log('[STEP 7 PREVIEW] Prompt length:',prompt.length,'chars');
console.log('\n=== SHARED ENGLISH FINAL PROMPT (instruction portion only) ===\n'+
  prompt.split('\nEVIDENCE DATA')[0]+'\n=== EVIDENCE DATA APPENDED AT RUNTIME ===');
