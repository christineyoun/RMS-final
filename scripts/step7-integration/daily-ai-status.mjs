// RMS-STEP7-WEEKDAY-20261109
/** Read-only: assess freshness of cached/approved STEP7 outputs for all 8 commodities. */
import fs from 'node:fs';
import path from 'node:path';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const root=process.cwd();
const flag=(s)=>process.argv.includes(s);
const opt=(s)=>process.argv.find(a=>a.startsWith(s+'='))?.slice(s.length+1);
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const kstDay=(d)=>{
 const p=Object.fromEntries(formatter.formatToParts(d).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
};
const day=opt('--day')||kstDay(new Date());
if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))throw Error('Invalid --day');
const weekday=new Date(day+'T12:00:00+09:00').getUTCDay();
const expected=weekday!==0&&weekday!==6;
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}}
function entries(id){
 const paths=[];
 const roots=id==='soybean'?['.rms-soybean-rebuild','.rms-research/soybean']:[`.rms-research/${id}`];
 for(const base of roots){
   paths.push(path.join(base,`step7-rms-preview-${id}.json`));
   const d=path.join(base,'daily');
   if(fs.existsSync(d))for(const entry of fs.readdirSync(d,{withFileTypes:true})){
     if(entry.isDirectory()&&/^20\d{2}-\d{2}-\d{2}$/.test(entry.name))
       paths.push(path.join(d,entry.name,`step7-rms-preview-${id}.json`));
   }
 }
 return paths.flatMap(file=>{
   const r=readJson(file),data=r?.data;
   if(r?.stage!=='step7-local-ui-preview'||r.commodity!==id||!data||data.rmsStep7Preview!==true)return [];
   const ms=Date.parse(data.generatedAt||'');
   if(!Number.isFinite(ms))return [];
   return [{file,generatedAt:data.generatedAt,ms,hasRisk:!!(
     data.procurementRiskPreview?.commodityId===id&&
     data.procurementRiskPreview?.summarySentenceKo?.trim()&&
     Array.isArray(data.procurementRiskPreview?.evidence)&&
     (data.procurementRiskPreview.level==='판정 보류'||data.procurementRiskPreview.evidence.length>0)
   ),hasMarket:!!(data.deskRecommendation?.trim()&&data.executiveSummary?.trim()),localPreview:true}];
 });
}
function cloud(id){
 const file=path.join('.rms-stage3','step7-cloud-cards',id+'.json');
 const r=readJson(file);if(r?.stage!=='step7-cloud-card'||r.commodity!==id||r.approvedForCloudPublication!==true)return null;
 const t=Date.parse(r.data?.generatedAt||'');
 if(!Number.isFinite(t))return null;
 return {file,generatedAt:r.data.generatedAt,ms:t,hasRisk:!!r.data.procurementRiskPreview?.summarySentenceKo?.trim()};
}
const rows=ids.map(id=>{
 const saved=entries(id).sort((a,b)=>b.ms-a.ms);
 const complete=saved.filter(x=>x.hasMarket&&x.hasRisk);
 const latest=complete[0]||null;
 const promoted=cloud(id);
 const fresh=Boolean(latest&&kstDay(new Date(latest.ms))===day);
 const cloudFresh=Boolean(promoted&&kstDay(new Date(promoted.ms))===day&&promoted.hasRisk);
 return {commodity:id,completeSaved:complete.length,latestCompleteAt:latest?.generatedAt??null,localReadyToday:fresh,cloudApprovedToday:cloudFresh,localFile:latest?.file??null,cloudFile:promoted?.file??null};
});
const result={dayKST:day,weekday:expected,completeToday:rows.filter(x=>x.localReadyToday).length,cloudApprovedToday:rows.filter(x=>x.cloudApprovedToday).length,commodities:rows};
if(flag('--json'))console.log(JSON.stringify(result,null,2));
else{
 console.log(`RMS STEP7 weekday status — ${day} KST (${expected?'weekday':'weekend'})`);
 for(const r of rows)console.log(`${r.commodity.padEnd(16)} ${r.localReadyToday?'LOCAL-COMPLETE':'STALE/MISSING'} ${r.cloudApprovedToday?'CLOUD-APPROVED':'NOT-CLOUD-APPROVED'} last=${r.latestCompleteAt??'none'}`);
 console.log(`Fresh local: ${result.completeToday}/8; fresh cloud cards in this workspace: ${result.cloudApprovedToday}/8`);
 console.log('READ ONLY: no model calls, saved-state writes, or Cloud access.');
}
if(flag('--strict')&&expected&&rows.some(r=>!r.localReadyToday))process.exitCode=2;
