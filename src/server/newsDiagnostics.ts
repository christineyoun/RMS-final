/** Private immutable replay receipts; never credentials or provider transport. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {getStage3RunContext} from './stage3Runtime.ts';
function saveNewsReceipt(commodity:string,verifiedInputs:any[],response?:any,stage?:string){
 const ctx=getStage3RunContext();if(!ctx?.permitted)return;
 const payload={version:1,commodity,runId:ctx.runId,attempt:ctx.attempts,recordedAt:new Date().toISOString(),stage:stage||(response?'independently-verified-inputs-and-unaccepted-model-output':'independently-verified-extracted-publisher-inputs'),verifiedInputs,...(response?{response:{text:typeof response.text==='string'?response.text:'',usageMetadata:response.usageMetadata,groundingMetadata:response.candidates?.map((c:any)=>c.groundingMetadata)}}:{})};
 const bytes=JSON.stringify(payload),sha256=createHash('sha256').update(bytes).digest('hex');
 const dir=path.join(process.cwd(),'.rms-stage3/diagnostics/news-summaries');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,sha256+'.json');if(!fs.existsSync(file))fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
 return {file,sha256};
}
export const recordNewsInputs=(commodity:string,inputs:any[])=>saveNewsReceipt(commodity,inputs);
export const recordNewsSummary=(commodity:string,inputs:any[],response:any)=>saveNewsReceipt(commodity,inputs,response);

export const recordNewsDiscovery=(commodity:string,response:any)=>saveNewsReceipt(commodity,[],response,'unverified-discovery-only');
