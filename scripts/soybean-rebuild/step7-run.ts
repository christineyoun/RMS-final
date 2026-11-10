/** One billable final synthesis call after STOP or verified round-2 evidence. No Google Search. */
import fs from 'node:fs';
import path from 'node:path';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import {buildFinalData,buildFinalPrompt,parseFinalResult,auditFinalResult,renderFinal} from './step7-core.ts';
import {assessStep7AiRisk} from './step7-ai-risk.ts';
const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
const data=buildFinalData(dir);
if(data.commodity!==commodity)throw Error('STEP7 commodity mismatch; no paid call or writes.'); // Safeguard before any paid call.
const previous=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x));
if(previous.length&&!process.argv.includes('--force-new'))throw Error('STEP 7 already ran. Avoid another paid call; inspect last result.');
const prompt=buildFinalPrompt(data);
dotenv.config();
const key=process.env.GEMINI_API_KEY?.trim();if(!key)throw Error('GEMINI_API_KEY missing from .env');
const model=process.env.RMS_SOYBEAN_ANALYSIS_MODEL?.trim()||process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
console.log('[STEP 7] Routing:',data.route,'sources:',data.counts.sources,'excerpts:',data.counts.excerpts);
console.log('[STEP 7] ONE Gemini synthesis call, Google Search DISABLED. Model:',model);
const ai=new GoogleGenAI({apiKey:key});
const response=await ai.models.generateContent({model,contents:prompt,config:{
  responseMimeType:'application/json',maxOutputTokens:12000,temperature:0.35,
}});
const raw=typeof response.text==='string'?response.text:'';
const parsed=parseFinalResult(raw),audit=parsed?auditFinalResult(parsed,data):null;
// The public-facing SCM strip is part of STEP7 completion, not an optional
// cosmetic field. Never call a riskless market report a fully accepted result.
const acceptedRisk=parsed?assessStep7AiRisk(data.commodity,parsed.procurementRisk,data.sources):null;
const status=!parsed?'model-json-invalid':(audit?.reviewReasons.length||!acceptedRisk?.risk)?
  'report-review-needed':'report-created';
const now=new Date().toISOString(),stamp=now.replace(/[:.]/g,'-');
const out={stage:'final-market-outlook-and-procurement',recordedAt:now,commodity:data.commodity,
  status,route:data.route,model,modelFinishReason:response.candidates?.[0]?.finishReason||null,
  inputFiles:data.files,counts:data.counts,
  result:parsed,audit,rawText:raw,usageMetadata:response.usageMetadata||null,
  safeguards:{sourceInventoryPreserved:true,GoogleSearchDisabled:true,noMoreResearchRounds:true,
    oldFilesOverwritten:false,rmsAndCloudRunUntouched:true}};
const filename=path.join(dir,`step7-final-${stamp}.json`);
fs.writeFileSync(filename,JSON.stringify(out,null,2),{flag:'wx',mode:0o600});
console.log('[STEP 7] Status:',status,'Finish reason:',response.candidates?.[0]?.finishReason||'unknown','JSON:',filename);
if(audit?.reviewReasons.length)console.log('[STEP 7] REVIEW REASONS (report saved, not approved):\n - '+audit.reviewReasons.join('\n - '));
if(parsed){
  const md=path.join(dir,`step7-final-${stamp}.md`);
  fs.writeFileSync(md,renderFinal(data,parsed),{flag:'wx',mode:0o600});
  console.log('[STEP 7] Review:',md);
}else console.log('[STEP 7] Raw response preserved for offline diagnosis; no invented report.');
if(status!=='report-created')process.exitCode=2;
