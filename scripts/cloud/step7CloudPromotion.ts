/** The only explicit local-preview -> approved private-job card promotion path.
 * Validates STEP7 report SHA, STEP7-1 provenance, best-effort source gates,
 * and display payload. Failed days never overwrite prior successful cards. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isSafeStep7Data,hasAcceptedStep7ProcurementRisk,cloudStep7Directory} from '../../src/server/step7CloudCard.ts';

const ids=new Set(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
export async function promoteStep7CloudCard(commodity:string,day:string,root=process.cwd()){
 if(!ids.has(commodity)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day))throw Error('Invalid STEP7 promotion identity');
 if(process.env.CLOUD_RUN_JOB && (process.env.RMS_CLOUD_FREE_JOB!=='1'||process.env.RMS_STEP7_CLOUD_EXECUTION!=='YES'||process.env.RMS_STEP7_CLOUD_APPROVED!=='YES'||process.env.K_SERVICE))
   throw Error('Unapproved STEP7 Cloud Run promotion');
 const {validatedLocalCard}=await import('../soybean-rebuild/step7-local-card-status.mjs');
 const dir=commodity==='soybean'?path.join(root,'.rms-soybean-rebuild','daily',day):path.join(root,'.rms-research',commodity,'daily',day);
 if(!validatedLocalCard(dir,commodity))return {commodity,action:'retained-previous',reason:'unverified-step7-receipt'};
 const receipt=JSON.parse(fs.readFileSync(path.join(dir,`step7-rms-preview-${commodity}.json`),'utf8'));
 const quality=receipt.factReviewComplete===true?'complete':receipt.factReviewQuality;
 if(!['complete','review-incomplete'].includes(quality)||!isSafeStep7Data(receipt.data,commodity)||
    !hasAcceptedStep7ProcurementRisk(receipt.data,commodity))
   return {commodity,action:'retained-previous',reason:'invalid-step7-payload'};
 const published={version:1,stage:'step7-cloud-card',commodity,day,reviewQuality:quality,
    reviewComplete:receipt.factReviewComplete,approvedForCloudPublication:true,
    sourceReviewFile:receipt.verifiedResultFile,sourceHash:receipt.originalSha256,
    approvedAt:new Date().toISOString(),data:{...receipt.data, factReviewQuality:receipt.factReviewQuality, factReviewComplete:receipt.factReviewComplete}};
 const dest=path.join(root,cloudStep7Directory,commodity+'.json');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 const tmp=dest+'.tmp-'+process.pid+'-'+Date.now();
 fs.writeFileSync(tmp,JSON.stringify(published),{flag:'wx',mode:0o600});
 fs.renameSync(tmp,dest);
 return {commodity,action:'published',reviewQuality:quality,day};
}
