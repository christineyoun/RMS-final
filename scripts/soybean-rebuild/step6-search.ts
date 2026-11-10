/** Gemini Google Search call only when STEP5 explicitly recommends 'search'. */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import {extractGrounding} from './grounding.ts';
import {loadStep6Context} from './step6-core.ts';
const c=loadStep6Context();
if(c.route==='step7-final'){
  console.log('[STEP 6] SKIPPED: STEP 5 chose STOP. Proceed directly to STEP 7. Gemini API calls: 0.');
}else if(c.route!=='step6-search'){
  throw Error('STEP 5 decision is UNCERTAIN/invalid. No paid Google Search.');
}else{
  if(fs.readdirSync(c.dir).some(x=>/^step6-round2-search-.*\.json$/.test(x))&&!process.argv.includes('--force-new'))
    throw Error('STEP 6 round 2 already completed. Inspect previous results; prevent duplicate paid request.');
  dotenv.config();
  const key=process.env.GEMINI_API_KEY?.trim();if(!key)throw Error('GEMINI_API_KEY missing in .env.');
  const model=process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
  console.log('[STEP 6] ONE Gemini Google Search request. SECOND AND FINAL ROUND. Model:',model);
  const ai=new GoogleGenAI({apiKey:key});
  const response=await ai.models.generateContent({model,contents:c.prompt!,config:{tools:[{googleSearch:{}}],maxOutputTokens:3200}});
  const grounding=extractGrounding(response);
  const now=new Date().toISOString(),stamp=now.replace(/[:.]/g,'-');
  const result={stage:'additional-google-discovery-round2',round:2,maxRounds:2,commodity:c.context!.commodity,
    recordedAt:now,status:grounding.hasGoogleCitations?'google-citations-found':'no-google-citations',
    decisionFile:c.decisionFile,inputFiles:c.inputFiles,model,prompt:c.prompt,grounding,
    responseText:response.text||'',usageMetadata:response.usageMetadata||null,
    protection:{existingSourcesPreserved:c.priorInventory!.length,previousFilesOverwritten:false,
      GoogleOnly:true,lastSearchRound:true,marketOutlookNotGenerated:true,rmsAndCloudUntouched:true}};
  const saved=path.join(c.dir,`step6-round2-search-${stamp}.json`);
  fs.writeFileSync(saved,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
  console.log('[STEP 6] Saved:',saved);
  console.log('[STEP 6] Grounded URLs:',grounding.sources.length,'Google queries:',grounding.webSearchQueries.length);
  if(!grounding.hasGoogleCitations){console.error('[STEP 6] No provider citations; keep prior evidence. Do not invent links.');process.exitCode=2;}
}
