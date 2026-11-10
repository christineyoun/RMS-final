/** FREE stage 5–7 readiness overview. Reads existing local JSON only; no fetch or writes. */
import fs from 'node:fs';
import {commodityFromArgv,resultFolder} from './commodity-config.ts';
import {loadStep5Context} from './step5-local.ts';
import {loadDecisionContext} from './step5-decision-local.ts';
import {loadStep6Context} from './step6-core.ts';
import {buildFinalData} from './step7-core.ts';
const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
console.log('[STEP5-7 COMMON PREVIEW] NO Gemini calls, NO web fetch, NO writes.');
console.log('[STEP5-7 COMMON PREVIEW] Selected:',commodity);
console.log('[STEP5-7 COMMON PREVIEW] Folder:',dir);
if(!fs.existsSync(dir)){
 console.log('[STEP5-7 COMMON PREVIEW] No research data yet; run STEP1-4 for THIS commodity first.');
}else{
 try{
  const ctx=loadStep5Context(process.cwd(),commodity);
  console.log('[STEP5-7 COMMON PREVIEW] STEP4 input:',ctx.file);
  console.log('[STEP5-7 COMMON PREVIEW] STEP5 prompt commodity:',ctx.plan.commodity);
  console.log('[STEP5-7 COMMON PREVIEW] A/B sources:',JSON.stringify(ctx.plan.previousCounts));
 }catch(e){console.log('[STEP5-7 COMMON PREVIEW] STEP5 not ready:',e instanceof Error?e.message:String(e));}
 try{
  const decision=loadDecisionContext(process.cwd(),undefined,commodity);
  console.log('[STEP5-7 COMMON PREVIEW] STEP5 graded input:',decision.graded);
  console.log('[STEP5-7 COMMON PREVIEW] STEP5 decision prompt ready (NO CALL).');
 }catch(e){console.log('[STEP5-7 COMMON PREVIEW] STEP5 decision not ready:',e instanceof Error?e.message:String(e));}
 try{
  const stage=loadStep6Context(process.cwd(),undefined,commodity);
  console.log('[STEP5-7 COMMON PREVIEW] STEP5 route:',stage.decision.decision?.decision);
  console.log('[STEP5-7 COMMON PREVIEW] Next:',stage.route);
  if(stage.route==='step7-final'||stage.route==='step6-search'){
   try{
    const final=buildFinalData(dir);
    console.log('[STEP5-7 COMMON PREVIEW] STEP7 ready:',JSON.stringify(final.counts));
   }catch(e){console.log('[STEP5-7 COMMON PREVIEW] STEP7 awaits input:',e instanceof Error?e.message:String(e));}
  }
 }catch(e){console.log('[STEP5-7 COMMON PREVIEW] Branch not ready:',e instanceof Error?e.message:String(e));}
}
console.log('[STEP5-7 COMMON PREVIEW] Production RMS and old snapshots unchanged.');
