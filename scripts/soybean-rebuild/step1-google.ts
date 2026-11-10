/**
 * RMS soybean research reboot – step 1: a single Gemini Google Search discovery.
 * No RMS state access, no posting, no Bing/Brave/RSS, no report synthesis.
 * Run in the normal RMS project root: npx.cmd tsx scripts/soybean-rebuild/step1-google.ts
 * Google grounding/search calls can incur real charges.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import {extractGrounding} from './grounding.ts';
import {commodityFromArgv,COMMODITY_NAMES,resultFolder} from './commodity-config.ts';

dotenv.config();
const commodity=commodityFromArgv();
const commodityName=COMMODITY_NAMES[commodity];

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) throw new Error('GEMINI_API_KEY is missing from .env');
// Use a documented Google Search-capable model by default. Override explicitly
// if the account has another proven Google Search-capable model.
const model = process.env.RMS_RESEARCH_SEARCH_MODEL?.trim() || process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim() || 'gemini-3.8-flash';
const now = new Date();
const dateParts = new Intl.DateTimeFormat('en-US', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).formatToParts(now);
const date = (key: string) => dateParts.find(p => p.type === key)?.value || '';
const koreaDate = `${date('year')}-${date('month')}-${date('day')}`;

const prompt = `As of ${koreaDate} (KST), use Google Search to find 3–5 distinct, credible sources on the global ${commodityName} market. Focus on the past 12 months; include older official reports only when useful for context. Cover supply, demand, prices, and trade as relevant. Prefer original government and exchange reports, followed by reputable industry news.

Give a brief Korean list of the sources, with one-line descriptions and actual Google Search citations. Do not invent links, dates, or figures. This is source discovery only: no market forecast, purchasing advice, or follow-up questions.`;

const resultDirectory = resultFolder(commodity);
fs.mkdirSync(resultDirectory, {recursive:true});
const filename = path.join(resultDirectory, `step1-google-${now.toISOString().replace(/[:.]/g,'-')}.json`);

console.log('[STEP 1] One Google Search discovery request (potentially paid).');
console.log('[STEP 1] Model:',model);
console.log('[STEP 1] Old RMS data and publication are not accessed.');
const ai = new GoogleGenAI({apiKey});
const response = await ai.models.generateContent({
  model,
  contents:prompt,
  config: {tools:[{googleSearch:{}}], maxOutputTokens:3200},
});

const grounding = extractGrounding(response);
const state = grounding.hasGoogleCitations ? 'google-citations-found' : 'no-google-citations';
const output = {
  recordedAt:new Date().toISOString(),
  commodity,
  stage:'google-discovery-only',
  model,
  status:state,
  grounding,
  responseText:typeof response.text==='string' ? response.text : '',
  usageMetadata:response.usageMetadata||null,
  note:'Grounded URLs are candidates only; A/B grade and original verification are not performed yet.',
};
fs.writeFileSync(filename,JSON.stringify(output,null,2),{encoding:'utf8',mode:0o600});
console.log('[STEP 1] Results saved:', filename);
console.log('[STEP 1] Provider web search queries:',grounding.webSearchQueries.length);
console.log('[STEP 1] Provider grounded URLs:',grounding.sources.length);
console.log('[STEP 1] Grounding supports:',grounding.groundingSupportCount);
for(const s of grounding.sources) console.log(`- ${s.title}\n  ${s.uri}\n  ${s.needsRedirectResolution?'  [Google redirect: resolve in step 2]':''}`);
if (!grounding.hasGoogleCitations) {
  console.error('[STEP 1] FAILED: Gemini answer did not include provider Google citations. The text may still contain URLs; those are NOT counted.');
  process.exitCode=2;
} else {
  console.log('[STEP 1] PASSED: actual provider Google citation metadata exists. Step 2 will verify originals and grade A/B.');
}
