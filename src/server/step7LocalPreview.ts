/** Explicit dev-only read of a stand-alone STEP7 local preview; no publication mutation. */
import fs from 'node:fs';
import path from 'node:path';
import {isIP} from 'node:net';
const known=new Set(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
const localRemote=(address:string|undefined)=>address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
const publisher=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&
  !u.username&&!u.password&&!u.port&&!isIP(u.hostname)&&!/(?:^|\.)(?:local|internal|test|example)$/.test(u.hostname)&&
  u.hostname!=='vertexaisearch.cloud.google.com'&&!!u.pathname.replace(/\//g,'');}catch{return false;}};
export function readStep7LocalPreview(commodity:string,remoteAddress?:string,cwd=process.cwd()):any|null{
  if(process.env.RMS_STEP7_LOCAL_PREVIEW!=='1'||process.env.NODE_ENV==='production'||
    process.env.RMS_PUBLIC_READONLY==='1'||!localRemote(remoteAddress)||!known.has(commodity))return null;
  // Older approved local previews are stored at the root; newer STEP 7
  // runs may save the exact same receipt under daily/YYYY-MM-DD/. Locate
  // either layout, without copying data or changing the publication gate.
  const dir=commodity==='soybean'?'.rms-soybean-rebuild':path.join('.rms-research',commodity);
  const name=`step7-rms-preview-${commodity}.json`;
  const candidates=[path.join(cwd,dir,name)];
  const dailyRoots=commodity==='soybean'
    ?[path.join(cwd,dir,'daily'),path.join(cwd,'.rms-research',commodity,'daily')]
    :[path.join(cwd,dir,'daily')];
  for(const dailyRoot of dailyRoots){
    let dates:string[]=[];
    try{
      dates=fs.readdirSync(dailyRoot,{withFileTypes:true})
        .filter(entry=>entry.isDirectory()&&/^20\d{2}-\d{2}-\d{2}$/.test(entry.name))
        .map(entry=>entry.name).sort().reverse();
    }catch(error){
      if((error as {code?:string}).code!=='ENOENT')throw error;
    }
    for(const date of dates)candidates.push(path.join(dailyRoot,date,name));
  }
  const results:any[]=[];
  const problems:Error[]=[];
  for(const f of candidates){
    try{if(!fs.statSync(f).isFile())continue;}catch{continue;}
    try{
      const receipt=JSON.parse(fs.readFileSync(f,'utf8'));
      validateReceipt(receipt,commodity);
      results.push({data:receipt.data,file:f});
    }catch(error){problems.push(error instanceof Error?error:new Error('Malformed STEP7 receipt'));}
  }
  // Never splice an older risk opinion onto a newer market report: use ONE
  // cohesive, previously accepted report. Prefer dated risk-bearing reports
  // over old direct/root snapshots, or fall back to the legacy market report.
  // Keep a coherent approved report: no splicing an older SCM opinion onto newer text.
  // Prefer the newest *complete* risk-bearing receipt by its actual generatedAt,
  // not folder location. Legacy receipts without generatedAt retain old precedence.
  const generatedMs=(x:any):number|null=>{
    const t=Date.parse(x.data?.generatedAt||'');
    return Number.isFinite(t)?t:null;
  };
  const withRisk=results.filter(x=>x.data.procurementRiskPreview?.summarySentenceKo?.trim());
  if(withRisk.length){
    const newest=withRisk.sort((x,y)=>{
      const a=generatedMs(x),b=generatedMs(y);
      if(a!==null||b!==null)return (b??-Infinity)-(a??-Infinity);
      const dated=(v:any)=>/daily\/(20\d{2}-\d{2}-\d{2})\//.exec(v.file)?.[1]||'';
      return dated(y).localeCompare(dated(x));
    });
    return newest[0].data;
  }
  // A newer complete market-only receipt may be selected if no risk-bearing
  // reports exist; never prioritize old root snapshots over fresh dated reports.
  const timed=results.filter(x=>generatedMs(x)!==null);
  if(timed.length)return timed.sort((x,y)=>generatedMs(y)!-generatedMs(x)!)[0].data;
  if(results.length)return results[0].data;
  if(problems.length)throw new Error('Malformed local STEP7 preview receipt; never silently publish it.');
  return null;
}
function validateReceipt(receipt:any,commodity:string){
  const a=receipt?.data;
  if(receipt.stage!=='step7-local-ui-preview'||receipt.approvedForPublication!==false||
    receipt.commodity!==commodity||a?.rmsStep7Preview!==true||a?.status!=='cached'||
    ![a?.deskRecommendation,a?.executiveSummary].every(x=>typeof x==='string'&&!!x.trim())||
    !Array.isArray(a?.purchaseActions)||!a.purchaseActions.every((x:unknown)=>typeof x==='string')||
    !['bullishFactors','bearishFactors','watchItems'].every(k=>Array.isArray(a[k])&&a[k].every((x:unknown)=>typeof x==='string'))||
    !Array.isArray(a.sources)||!a.sources.length||!a.sources.every((s:any)=>typeof s?.title==='string'&&publisher(s.url))||
    (a.procurementRiskPreview!==undefined && (
      a.procurementRiskPreview?.commodityId!==commodity||
      !['안정','주의','경계','판정 보류'].includes(a.procurementRiskPreview?.level)||
      typeof a.procurementRiskPreview?.summarySentenceKo!=='string'||
      [...a.procurementRiskPreview.summarySentenceKo].length>120||
      !Array.isArray(a.procurementRiskPreview.evidence)||
      (a.procurementRiskPreview.level!=='판정 보류'&&!a.procurementRiskPreview.evidence.length)||
      !a.procurementRiskPreview.evidence.every((e:any)=>publisher(e?.url)&&
        typeof e?.text==='string'&&typeof e?.source==='string'&&typeof e?.date==='string')
    ))){
    throw Error('Malformed local STEP7 preview receipt; never silently publish it.');
  }
}
