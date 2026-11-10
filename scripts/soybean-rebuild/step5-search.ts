/**
 * STEP 5 ROUND 1 ONLY: one potentially-billable Gemini generateContent request
 * equipped with GOOGLE SEARCH ONLY. May run several search queries internally.
 * Does NOT invoke other providers, fetch publishers, repeat research round,
 * rewrite STEP 1-4 files or touch RMS/Cloud Run/publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import {extractGrounding} from './grounding.ts';
import {loadStep5Context} from './step5-local.ts';
import {markPossibleOverlaps} from './step5-plan.ts';

const {dir,file,snapshot,plan,prompt}=loadStep5Context(); // Validate before any paid call.
const previousRound1=fs.readdirSync(dir).filter(name=>/^step5-round1-(?:search|google)-.*\.json$/.test(name));
if(previousRound1.length && !process.argv.includes('--force-new')){
  throw Error(`STEP5 round 1 was already run (${previousRound1.sort().at(-1)}). Avoid repeated paid calls. Only use --force-new intentionally.`);
}
dotenv.config();
const apiKey=process.env.GEMINI_API_KEY?.trim();
if(!apiKey)throw Error('GEMINI_API_KEY missing from .env. Do not paste it into chat.');
const model=process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
console.log('[STEP 5] FIRST additional discovery round. Gemini requests: ONE (may cost money).');
console.log('[STEP 5] Only Google Search; no Bing/Brave/RSS/other providers.');
console.log('[STEP 5] Previous STEP4:',file);
console.log('[STEP 5] Prior source/candidate preservation:',plan.previousCounts.sources,'/',plan.previousCounts.candidates);
console.log('[STEP 5] Model:',model);

const ai=new GoogleGenAI({apiKey});
let response:any;
try{
  response=await ai.models.generateContent({model,contents:prompt,config:{tools:[{googleSearch:{}}],maxOutputTokens:3200}});
}catch(e){
  console.error('[STEP 5] Google search call failed; previous files untouched:',e instanceof Error?e.message:String(e));
  process.exitCode=2;
}
if(response){
  const grounding=extractGrounding(response);
  const prior=snapshot.analysis.originalInventory;
  const overlaps=markPossibleOverlaps(grounding.sources,prior);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const out=path.join(dir,`step5-round1-search-${stamp}.json`);
  const state=grounding.hasGoogleCitations?'google-citations-found':'no-google-citations';
  const saved={recordedAt:new Date().toISOString(),commodity:plan.commodity,stage:'additional-google-discovery-round1',round:1,maxRounds:2,
    status:state,model,step4InputFile:file,
    prompt,plan,grounding,overlaps,responseText:typeof response.text==='string'?response.text:'',usageMetadata:response.usageMetadata||null,
    priorSnapshot:{originalInventory:snapshot.analysis.originalInventory,
      candidateAssessments:snapshot.analysis.candidateAssessments||[],findings:snapshot.analysis.findings,
      researchGaps:snapshot.analysis.researchGaps},
    protection:{olderFilesOverwritten:false,originalSourcesPreserved:prior.length,
      GoogleOnly:true,noOtherSearchProvider:true,originalReadingNotPerformed:true,gradedNewSources:false,
      secondRoundNotRun:true,marketOutlookNotGenerated:true,rmsAndCloudUntouched:true},
    note:'New grounded URLs are candidates only. Do not promote to A without fetching publisher originals. Keep all B sources.'};
  fs.writeFileSync(out,JSON.stringify(saved,null,2),{mode:0o600});
  console.log('[STEP 5] Saved:',out);
  console.log('[STEP 5] Google search queries:',grounding.webSearchQueries.length);
  console.log('[STEP 5] Provider-grounded URLs:',grounding.sources.length);
  console.log('[STEP 5] Grounding supports:',grounding.groundingSupportCount);
  console.log('[STEP 5] Exactly matching previous URLs:',overlaps.filter(x=>x.exactUrlSeenEarlier).length,'(may not detect identical publisher behind different Google redirects)');
  for(const s of grounding.sources)console.log(`- ${s.title} :: ${s.uri}${s.needsRedirectResolution?' [Google redirect]':''}`);
  console.log('[STEP 5] Previous A/B and all excerpts preserved, no publisher verification or A/B changes this round.');
  if(!grounding.hasGoogleCitations){console.error('[STEP 5] No actual Google grounding citations. Do NOT use text-only URLs.');process.exitCode=2;}
}
