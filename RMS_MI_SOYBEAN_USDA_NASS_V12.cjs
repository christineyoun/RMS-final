'use strict';
const fs=require('node:fs');
const f='src/server/soybeanVerifiedNews.ts';
if(!fs.existsSync(f))throw Error('Run this inside RMS_final_main; soybean collector not found.');
const old=fs.readFileSync(f,'utf8');
const tag='RMS_MI_SOYBEAN_NASS_V12';
if(old.includes(tag)){console.log('V12 already applied. No changes.');process.exit(0)}
function once(s,a,b,name){
 if(s.split(a).length!==2)throw Error('Expected anchor not found exactly once: '+name+'; no changes.');
 return s.replace(a,b);
}
const adapter=`/** ${tag}: independent, monthly USDA NASS original TXT release. */
const nassIndex='https://esmis.nal.usda.gov/publication/fats-and-oils-oilseed-crushings-production-consumption-and-stocks';
const nassTitle='Fats and Oils: Oilseed Crushings, Production, Consumption and Stocks';
function nassReportUrl(raw:string):URL|null {
 try {
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.hostname!=='esmis.nal.usda.gov'||u.username||u.password||u.port||u.search||u.hash||
     !/^\\/sites\\/default\\/release-files\\/\\d{4,10}\\/cafo\\d{4}\\.txt$/.test(u.pathname))return null;
  return u;
 }catch{return null;}
}
async function discoverNassSoybeanReport(retrievedAt:string):Promise<{candidates:RetrievedSourceMetadata[];error?:string}>{
 try {
  const r=await fetch(nassIndex,{redirect:'error',signal:AbortSignal.timeout(9000),headers:{Accept:'text/html'}});
  if(!r.ok||!/html/i.test(r.headers.get('content-type')||''))throw Error('USDA index HTTP '+r.status);
  const html=await r.text();if(html.length>1_000_000)throw Error('USDA index too large');
  const $=load(html),options:RetrievedSourceMetadata[]=[];
  $('a[href]').each((i,el)=>{
   const label=strip($(el).text());
   const match=label.match(/^([A-Za-z]{3}\\s+\\d{1,2}\\s+20\\d{2})\\s*[-–]\\s*txt$/i);
   if(!match)return;
   let raw:string;try{raw=new URL($(el).attr('href')||'',nassIndex).href;}catch{return;}
   const url=nassReportUrl(raw),day=dateISO(match[1]);
   if(!url||!inWindow(day,Date.parse(retrievedAt)))return;
   options.push({rawId:'soy-nass-'+day,rawTitle:nassTitle,rawSnippet:'',
    sourceName:'USDA NASS',sourceType:'official',publishedAt:day,originalUrl:url.href,
    retrievedAt,category:'수급 전망',affectedRegion:'미국'});
  });
  options.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  return {candidates:options.slice(0,1)};
 }catch(e){return {candidates:[],error:String((e as Error).message||e)};}
}
async function verifyNassSoybeanOriginal(c:RetrievedSourceMetadata):Promise<{allowed:boolean;reason:string;verified?:RetrievedSourceMetadata}>{
 const url=nassReportUrl(c.originalUrl);if(!url)return {allowed:false,reason:'nass-url-invalid'};
 try {
  const r=await fetch(url.href,{redirect:'error',signal:AbortSignal.timeout(9000),headers:{Accept:'text/plain'}});
  if(!r.ok||!/text\\/plain/i.test(r.headers.get('content-type')||''))return {allowed:false,reason:'nass-text-http-'+r.status};
  const raw=await r.text();if(raw.length>160_000) return {allowed:false,reason:'nass-report-too-large'};
  const head=raw.slice(0,2500).replace(/\\s+/g,' ');
  if(!/Fats and Oils: Oilseed Crushings/i.test(head)||
     !/National Agricultural Statistics Service/i.test(head)||
     !/United States Department of Agriculture/i.test(head))return {allowed:false,reason:'nass-publisher-unverified'};
  const release=head.match(/\\bReleased\\s+([A-Za-z]+\\s+\\d{1,2},?\\s+20\\d{2})\\b/i);
  const day=dateISO(release?.[1]||'');
  if(!inWindow(day)||day!==c.publishedAt)return {allowed:false,reason:'nass-publication-date-mismatch'};
  const flattened=raw.replace(/\\s+/g,' ');
  const start=flattened.search(/\\bSoybeans crushed for crude oil\\b/i);
  const end=start>=0?flattened.indexOf('Canola seeds crushed for crude oil',start):-1;
  if(start<0||end<=start||end-start>2500)return {allowed:false,reason:'nass-soybean-evidence-missing'};
  const excerpt=flattened.slice(start,end).trim();
  if(!/million bushels/i.test(excerpt)||!/compared with/i.test(excerpt)||!/20\\d{2}/.test(excerpt))
   return {allowed:false,reason:'nass-numbers-unverified'};
  return {allowed:true,reason:'verified',verified:{...c,rawTitle:nassTitle,
   rawSnippet:excerpt,sourceName:'USDA NASS',sourceType:'official',publishedAt:day,
   originalUrl:url.href,unavailable:false}};
 }catch(e){return {allowed:false,reason:'nass-fetch:'+String((e as Error).message||e).slice(0,80)};}
}
`;
let next=once(old,'export async function discoverSoybeanFreeSources(retrievedAt=new Date().toISOString()){',adapter+'\nexport async function discoverSoybeanFreeSources(retrievedAt=new Date().toISOString()){','NASS helper insertion');
next=once(next,'  const seen=new Set<string>(),counts=new Map<string,number>(),candidates:RetrievedSourceMetadata[]=[];',
  '  const nass=await discoverNassSoybeanReport(retrievedAt);\n  const seen=new Set<string>(),counts=new Map<string,number>(),candidates:RetrievedSourceMetadata[]=[];', 'NASS discovery');
next=once(next,'const raw=results.flatMap(r=>r.items).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));',
 'const raw=[...results.flatMap(r=>r.items),...nass.candidates].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));','NASS candidate pool');
next=once(next,'diagnostics:{sourcesTried:results.length,sourcesRead:results.filter(r=>r.okay).length,',
 'diagnostics:{sourcesTried:results.length+1,sourcesRead:results.filter(r=>r.okay).length+Number(!nass.error),','NASS count telemetry');
next=once(next,'sourceResults:results.map(r=>({publisher:r.src.publisher,kind:r.src.kind,url:r.src.url,',
 "sourceResults:[...results.map(r=>({publisher:r.src.publisher,kind:r.src.kind,url:r.src.url,",'NASS source telemetry');
next=once(next,`discovered:r.items.length,okay:r.okay,error:r.error||undefined})),`,
 `discovered:r.items.length,okay:r.okay,error:r.error||undefined})),\n      {publisher:'USDA NASS',kind:'official-txt',url:nassIndex,discovered:nass.candidates.length,okay:!nass.error,error:nass.error}],`, 'NASS source telemetry end');
next=once(next,`errors:results.filter(r=>!r.okay).map(r=>\`\${r.src.publisher}: \${r.error}\`)}};`,
 `errors:[...results.filter(r=>!r.okay).map(r=>\`\${r.src.publisher}: \${r.error}\`),...(nass.error?[\`USDA NASS: \${nass.error}\`]:[])]} };`,'NASS errors');
next=once(next,'export async function verifySoybeanOriginal(candidate:RetrievedSourceMetadata):Promise<{allowed:boolean;reason:string;verified?:RetrievedSourceMetadata}>{\n  const url=validUrl(candidate.originalUrl);',
  'export async function verifySoybeanOriginal(candidate:RetrievedSourceMetadata):Promise<{allowed:boolean;reason:string;verified?:RetrievedSourceMetadata}>{\n  if(nassReportUrl(candidate.originalUrl))return verifyNassSoybeanOriginal(candidate);\n  const url=validUrl(candidate.originalUrl);','NASS verifier routing');
fs.writeFileSync(f,next);
console.log('APPLIED: '+tag+'; soybean original TXT verification + monthly discovery.');
console.log('No Gemini calls, publication, or persisted runtime data changes.');
