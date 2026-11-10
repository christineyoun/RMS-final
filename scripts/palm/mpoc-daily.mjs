#!/usr/bin/env node
/** Owner-initiated MPOC probe or one-off local CPO/Olein refresh. No Gemini. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MPOC_CPO_URL,parseMpocCpoTable} from '../../src/server/mpocCpoParser.mjs';
const mode=process.argv[2]||'--preview';
if(path.basename(process.cwd())!=='RMS_final_main'||!fs.existsSync('package.json'))throw Error('Run inside ~/Downloads/RMS_final_main');
if(!['--preview','--apply'].includes(mode))throw Error('Use --preview or --apply');
if(mode==='--preview'){
 const r=await fetch(MPOC_CPO_URL,{headers:{Accept:'text/html','User-Agent':'RMS-Procurement/1.0'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('MPOC HTTP '+r.status+'; no files modified');
 if(!/text\/html/i.test(r.headers.get('content-type')||''))throw Error('MPOC response is not HTML');
 const parsed=parseMpocCpoTable(await r.text());
 console.log(JSON.stringify({sourceUrl:MPOC_CPO_URL,priceType:'Bursa settlement (not Investing.com close)',unit:'MYR/MT',contractMonth:parsed.contractMonth,observationCount:parsed.rows.length,earliest:parsed.rows[0],latest:parsed.rows.at(-1),writes:0,paidGeminiCalls:0},null,2));
}else{
 // Do not race the long-running local server's history writer.
 try{const r=await fetch('http://localhost:3000/api/rms/refresh-status',{signal:AbortSignal.timeout(700)});if(r.ok)throw Error('Port 3000 RMS server is running. Stop it with Ctrl+C before --apply.');}catch(e){if(String(e?.message||'').includes('Port 3000 RMS server'))throw e;}
 const file=path.join(process.cwd(),'.rms-price-history','palm-oil.json');
 if(fs.existsSync(file)){
   const dir=path.join(os.homedir(),'Desktop','RMS_MI_backups','palm-mpoc-'+new Date().toISOString().replace(/[:.]/g,'-'));
   fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,'palm-oil.json');fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL);console.log('Backup:',dest);
 }
 const {refreshPublicHistory,palmHistoryPayload,PRICE_SOURCES}=await import('../../src/server/publicPriceHistory.ts');
 const result=await refreshPublicHistory('palm-oil');
 const c=result.sourceChecks?.[PRICE_SOURCES.mpocCpo],o=result.sourceChecks?.[PRICE_SOURCES.olein];
 const payload=palmHistoryPayload(result);
 console.log(JSON.stringify({mpoc:{lastSuccessAt:c?.lastSuccessAt||null,error:c?.error||null,lastObservationDate:c?.lastObservationDate||null},olein:{lastSuccessAt:o?.lastSuccessAt||null,error:o?.error||null,lastObservationDate:o?.lastObservationDate||null},cpoObservationDate:payload.cpoObservationDate,cpoMyr:payload.priceMyr,cpoSourceUrl:payload.cpoSourceUrl,cpoContractMonth:payload.cpoContractMonth,fxError:result.fxError||null,paidGeminiCalls:0},null,2));
 if(c?.error||!c?.lastSuccessAt)process.exitCode=1;
}
