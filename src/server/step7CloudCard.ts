/** Private-job only: approved, persistent STEP7 card saved as part of .rms-stage3 state.
 * This reader must not run on the public viewer, which serves the signed bundle only. */
import fs from 'node:fs';
import path from 'node:path';
import {safePublisherOriginal} from '../../scripts/soybean-rebuild/step7-rms-adapter.ts';

const ids=new Set(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
export const cloudStep7Directory='.rms-stage3/step7-cloud-cards';
export function isSafeStep7Data(data:any,commodity:string):boolean {
 if(!ids.has(commodity)||!data||data.rmsStep7Preview!==true||data.status!=='cached'||
    !['deskRecommendation','executiveSummary'].every(k=>typeof data[k]==='string'&&!!data[k].trim())||
    !Number.isFinite(Date.parse(data.generatedAt||''))||
    !Array.isArray(data.purchaseActions)||!data.purchaseActions.every((x:any)=>typeof x==='string'&&!!x.trim())||
    !['bullishFactors','bearishFactors','watchItems'].every(k=>Array.isArray(data[k])&&data[k].every((x:any)=>typeof x==='string'))||
    !Array.isArray(data.sources)||!data.sources.length||!data.sources.every((s:any)=>typeof s?.title==='string'&&safePublisherOriginal(s?.url)))return false;
 const risk=data.procurementRiskPreview;
 if(risk!==undefined && (risk?.commodityId!==commodity||
   !['안정','주의','경계','판정 보류'].includes(risk.level)||
   typeof risk.summarySentenceKo!=='string'||[...risk.summarySentenceKo].length>120||
   !Array.isArray(risk.evidence)||
   (risk.level!=='판정 보류'&&!risk.evidence.length)||
   !risk.evidence.every((e:any)=>safePublisherOriginal(e?.url)&&
     typeof e?.text==='string'&&typeof e?.source==='string'&&typeof e?.date==='string')))return false;
 return true;
}
/** A successful STEP7-2 market outlook alone is not a completed SCM risk card. */
export function hasAcceptedStep7ProcurementRisk(data:any,commodity:string):boolean {
 if(!isSafeStep7Data(data,commodity))return false;
 const risk=data.procurementRiskPreview;
 return Boolean(risk&&risk.commodityId===commodity&&
   ['안정','주의','경계','판정 보류'].includes(risk.level)&&
   typeof risk.summarySentenceKo==='string'&&risk.summarySentenceKo.trim().length>0&&
   [...risk.summarySentenceKo].length<=120&&Array.isArray(risk.evidence)&&
   (risk.level==='판정 보류'||risk.evidence.length>0));
}
export function readCloudStep7Card(commodity:string,root=process.cwd()):any|null {
 if(!ids.has(commodity))return null;
 try {
  const file=path.join(root,cloudStep7Directory,commodity+'.json');
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.stage!=='step7-cloud-card'||record.commodity!==commodity||
     record.approvedForCloudPublication!==true||
     !['complete','review-incomplete'].includes(record.reviewQuality)||
     !isSafeStep7Data(record.data,commodity))return null;
  return record.data;
 }catch{return null;}
}
