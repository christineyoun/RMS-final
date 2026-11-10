/** LOCAL ONLY: matches the exact STEP7 source, STEP7-1 review and STEP7-2 preview.
 * Review-incomplete is allowed ONLY after deterministic source/format checks pass.
 * This is never an approval for Cloud Run / publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function validatedLocalCard(dir,commodity){
 try{
  const names=fs.readdirSync(dir);
  const final=names.filter(n=>/^step7-final-.*\.json$/.test(n)).sort().at(-1);
  if(!final)return false;
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,final))).digest('hex');
  const reviews=names.filter(n=>/^step7-fact-verified-.*\.json$/.test(n)).sort().reverse();
  const matching=reviews.map(n=>{try{return{name:n,record:JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'))};}catch{return null;}})
    .find(x=>x?.record?.sourceFile===final&&x.record.originalSha256===hash&&x.record.commodity===commodity);
  if(!matching)return false;
  const {record,name}=matching;
  if(record.stage!=='step7-fact-verification'||record.status!=='verified'||
     record.completionPolicy!=='best-effort-v2'||record.approvalScope!=='local-RMS-preview-only'||
     record.approvedForCloudPublication!==false||
     !Array.isArray(record.criticalAuditReasons)||record.criticalAuditReasons.length>0)return false;
  if(record.reviewComplete!==true && !(record.reviewComplete===false&&record.reviewQuality==='review-incomplete'))return false;
  const preview=JSON.parse(fs.readFileSync(path.join(dir,`step7-rms-preview-${commodity}.json`),'utf8'));
  return preview.commodity===commodity&&preview.verifiedResultFile===name&&
    preview.originalSha256===hash&&preview.factReviewComplete===record.reviewComplete&&
    preview.factReviewQuality===record.reviewQuality&&preview.approvedForPublication===false&&
    preview.data?.rmsStep7Preview===true&&typeof preview.data?.executiveSummary==='string'&&
    preview.data.executiveSummary.trim().length>0;
 }catch{return false;}
}

/** Full refresh completion requires a genuinely Gemini-authored, source-bound
 * SCM risk in this SAME verified STEP7 receipt. Never infer one from other data. */
export async function validatedLocalRiskCard(dir,commodity){
 if(!validatedLocalCard(dir,commodity))return false;
 try{
  const {hasAcceptedStep7ProcurementRisk}=await import('../../src/server/step7CloudCard.ts');
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,`step7-rms-preview-${commodity}.json`),'utf8'));
  return hasAcceptedStep7ProcurementRisk(receipt.data,commodity);
 }catch{return false;}
}
