/** No API; no writes. Preview dispatch and round-2 English prompt if necessary. */
import {loadStep6Context} from './step6-core.ts';
const c=loadStep6Context();
console.log('[STEP 6 PREVIEW] Gemini API calls: 0. Existing files unchanged.');
console.log('[STEP 6 PREVIEW] STEP 5 decision:',c.decisionFile);
console.log('[STEP 6 PREVIEW] Decision:',c.decision.decision?.decision);
if(c.route==='step7-final')console.log('[STEP 6 PREVIEW] SKIP STEP 6 → STEP 7. No second search needed.');
else if(c.route==='manual-review')console.log('[STEP 6 PREVIEW] STOP: decision invalid/uncertain. Human review required.');
else {
  console.log('[STEP 6 PREVIEW] SEARCH → second and LAST Google search.');
  console.log('[STEP 6 PREVIEW] Existing sources:',c.priorInventory?.length);
  console.log('\n=== SHARED ENGLISH PROMPT FOR FINAL GOOGLE SEARCH ROUND ===\n'+c.prompt+'\n=== END ===');
}
