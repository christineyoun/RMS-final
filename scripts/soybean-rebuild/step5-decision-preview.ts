/** FREE preview. No Gemini call, no new files, no changes to RMS. */
import {loadDecisionContext} from './step5-decision-local.ts';
const c=loadDecisionContext();
console.log('[STEP5 DECISION PREVIEW] Gemini API requests: 0. Files unchanged.');
console.log('[STEP5 DECISION PREVIEW] STEP4:',c.prior);
console.log('[STEP5 DECISION PREVIEW] STEP5:',c.graded);
console.log('[STEP5 DECISION PREVIEW] Source and evidence counts:',JSON.stringify(c.input.counts));
console.log('[STEP5 DECISION PREVIEW] One short decision JSON; NO Google search; second round NOT executed.');
console.log('\n=== ENGLISH INSTRUCTIONS (BEFORE AUTO-ATTACHED EVIDENCE DATA) ===\n');
console.log(c.prompt.split('\nEVIDENCE INVENTORY ')[0]);
console.log('\n=== RUNTIME INPUT SUMMARY (all evidence is attached in actual request) ===');
console.log(`Prior findings: ${c.input.priorFindings.length}; prior gaps: ${c.input.priorGaps.length}; old excerpts: ${c.input.previouslyReviewed.length}; new excerpts: ${c.input.newSources.reduce((n,s)=>n+s.passages.length,0)}; new sources: ${c.input.newSources.length}`);
console.log(`Actual prompt size: ${c.prompt.length} characters. Full prompt is sent to Gemini but not dumped to the terminal.`);
