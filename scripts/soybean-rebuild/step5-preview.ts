/** Free STEP 5 prompt preview. No dotenv, network, Gemini, Google or file writes. */
import {loadStep5Context} from './step5-local.ts';
const {file,plan,prompt}=loadStep5Context();
console.log('[STEP5 PREVIEW] Gemini API calls: 0. No files changed.');
console.log('[STEP5 PREVIEW] Based on:',file);
console.log('[STEP5 PREVIEW] Prior inventory:',JSON.stringify(plan.previousCounts));
console.log('[STEP5 PREVIEW] AI-generated gap leads (not fixed questions):',plan.gapLeads.length);
console.log('\n=== GEMINI GOOGLE SEARCH PROMPT FOR ROUND 1 ===\n');
console.log(prompt);
console.log('\n=== END OF PREVIEW ===');
