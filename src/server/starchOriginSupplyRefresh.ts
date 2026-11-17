import {createHash} from 'node:crypto';
import path from 'node:path';
import {load} from 'cheerio';
import {PDFParse} from 'pdf-parse';
import {readFreeJson,writeFreeJson} from './freeDailyPublication.ts';
import {THAI_CASSAVA_SURVEYS,cassavaSurveyMetrics,readThaiCassavaSupply} from '../utils/thaiCassavaSupply.ts';

export {THAI_CASSAVA_SURVEYS};
export const AFSIS_ACO_INDEX='https://www.aptfsis.org/publication/aco/';
const EUROSTAT='https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/apro_cpnh1';
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthPattern=monthNames.join('|');
type SourceId='thai-survey'|'afsis-aco'|'poland-eurostat';
type Scope={scope:'national';crop:'fresh-cassava-roots'|'raw-potatoes-including-seed';unit:'tonnes'};
export type OriginSupplyRecord=Scope&{commodityId:'potato-starch'|'tapioca-starch';originKey:string;
 reportingYear:string;productionTonnes:number;estimateStatus:'forecast'|'estimated'|'actual';
 harvestedAreaRai?:number;yieldTonnesPerRai?:number;
 previous?:Scope&{reportingYear:string;productionTonnes:number;harvestedAreaRai?:number;yieldTonnesPerRai?:number};
 source:{name:string;url:string;reportDate:string|null;retrievedAt:string;sha256:string;dataUpdatedAt?:string;edition?:string;issue?:number;
  harvestedAreaRai?:number;yieldTonnesPerRai?:number;previousHarvestedAreaRai?:number;previousYieldTonnesPerRai?:number}};
type Provenance=OriginSupplyRecord['source'];
const trim=(s:string)=>s.replace(/\s+/g,' ').trim();
const tonnes=(s:string)=>/^[0-9][0-9,]*(?:\.\d+)?\*?$/.test(s)?Number(s.replace(/[,\*]/g,'')):NaN;
const usable=(v:number)=>Number.isFinite(v)&&v>0&&v<100_000_000;
const cropYear=(end:number)=>`${end-1}/${String(end).slice(-2)}`;
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const monthDate=(month:string,year:string)=>year+'-'+String(monthNames.findIndex(m=>m.toLowerCase()===month.toLowerCase())+1).padStart(2,'0');
const site=(u:string,host:string,prefix:string)=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname===host&&!x.port&&!x.username&&!x.password&&x.pathname.startsWith(prefix);}catch{return false;}};
function record(originKey:string,reportingYear:string,productionTonnes:number,priorYear:string,priorTonnes:number,source:Provenance,estimateStatus:OriginSupplyRecord['estimateStatus'],potato=false):OriginSupplyRecord{
 const scope:Scope={scope:'national',crop:potato?'raw-potatoes-including-seed':'fresh-cassava-roots',unit:'tonnes'};
 return {...scope,commodityId:potato?'potato-starch':'tapioca-starch',originKey,reportingYear,productionTonnes,estimateStatus,
  ...(usable(priorTonnes)?{previous:{...scope,reportingYear:priorYear,productionTonnes:priorTonnes}}:{}),source};
}
export function parseThaiCassavaSurvey(html:string,now=new Date()):OriginSupplyRecord[]{
 const $=load(html),main=$('body');
 const dates=[...new Set(main.find('p').toArray().flatMap(p=>{
  const m=trim($(p).text()).match(new RegExp('Tapioca Crop Survey in ('+monthPattern+')\\s+(20\\d{2})','i'));
  return m?[monthDate(m[1],m[2])]:[];
 }))];
 const result:OriginSupplyRecord[]=[];
 if(dates.length!==1||dates[0]>now.toISOString().slice(0,7)||!/cassava crop surveys/i.test(main.text()))return [];
 $('table').each((_,table)=>{
  const rows=$(table).find('tr').toArray().map(r=>$(r).find('td,th').toArray().map(x=>trim($(x).text())));
  const years=rows.filter(r=>/^Year \(A\.D\.\)$/i.test(r[0])),values=rows.filter(r=>/^Total Production \(Ton\)$/i.test(r[0]));
  if(years.length!==1||values.length!==1||years[0].length!==values[0].length||years[0].length<3)return;
  const aligned=(label:RegExp)=>{
   const matching=rows.filter(r=>label.test(r[0]));
   return matching.length===1&&matching[0].length===years[0].length?matching[0]:[];
  };
  const area=aligned(/^Harvesting Acreage \(Rai\)$/i),yieldRow=aligned(/^Yield Per Rai \(Ton\/Rai\)$/i);
  const entries=years[0].slice(1).map((y,i)=>({period:y.replace(/^\*/,''),forecast:y.startsWith('*'),value:tonnes(values[0][i+1]),
   area:tonnes(area[i+1]||''),yieldPerRai:tonnes(yieldRow[i+1]||'')}));
  if(entries.some(x=>!/^20\d{2}\/\d{2}$/.test(x.period)||!usable(x.value)||cropYear(+x.period.slice(0,4)+1)!==x.period)||new Set(entries.map(x=>x.period)).size!==entries.length)return;
  const row=entries.sort((a,b)=>b.period.localeCompare(a.period))[0],prior=entries.find(x=>x.period===cropYear(+row.period.slice(0,4)));
  if(!prior||+row.period.slice(0,4)>now.getUTCFullYear()+1)return;
  const saved=record('thailand',row.period,row.value,prior.period,prior.value,{name:'TTTA · 생산조사단',url:new URL(THAI_CASSAVA_SURVEYS).href,
   reportDate:dates[0],retrievedAt:now.toISOString(),sha256:digest(html)},row.forecast?'forecast':'actual');
  result.push({...saved,...cassavaSurveyMetrics(row.period,row.value,row.area,row.yieldPerRai),previous:{...saved.previous!,
   ...cassavaSurveyMetrics(prior.period,prior.value,prior.area,prior.yieldPerRai)}});
 });
 return result.length===1?result:[];
}
export function discoverAfsisIssue(html:string){
 const $=load(html);
 const links=$('a[href]').toArray().flatMap(a=>{
  try{
   const u=new URL($(a).attr('href')!,AFSIS_ACO_INDEX).href;
   const match=decodeURIComponent(new URL(u).pathname).split('/').at(-1)?.match(/(?:\bACO[ ._-]*(?:No[ ._-]*)?|\bOutlook[ ._-]*)(\d+)\b/i);
   return site(u,'www.aptfsis.org','/wp-content/uploads/')&&new URL(u).pathname.toLowerCase().endsWith('.pdf')&&match?[{url:u,issue:+match[1]}]:[];
  }catch{return [];}
 });
 return links.sort((a,b)=>b.issue-a.issue)[0];
}
const afsisOrigins={Cambodia:'cambodia','Lao PDR':'laos',Vietnam:'vietnam','Viet Nam':'vietnam'} as const;
export function parseAfsisCassavaIssue(text:string,url:string,issue:number,sha256:string,now=new Date()):OriginSupplyRecord[]{
 if(!site(url,'www.aptfsis.org','/wp-content/uploads/')||!/^[a-f0-9]{64}$/.test(sha256))return [];
 const cover=text.slice(0,2200);
 const m=cover.match(new RegExp('No\\.\\s*(\\d+),?\\s+('+monthPattern+'),?\\s+(20\\d{2})','i'));
 const date=m&&monthDate(m[2],m[3]);
 if(!m||+m[1]!==issue||!date||date>now.toISOString().slice(0,7)||!/ASEAN Agricultural Commodity\s+Outlook/i.test(cover)||
    !/cassava\s*\(fresh root\)/i.test(text))return [];
 const matches=[...text.matchAll(/^\s*Table \d+\. Cassava production in ASEAN countries from (20\d{2}) to (20\d{2})\.\s*\n\s*Unit:\s*1,000\s+tons\s*\n/gmi)];
 if(matches.length!==1)return [];
 const h=matches[0],year=+h[2];
 if(year!==+h[1]+2||year!==+m[3]+1)return [];
 const block=text.slice(h.index!+h[0].length,h.index!+h[0].length+3300).split(/\n\s*(?:Remarks:|Table \d+\.)/i)[0];
 const header=block.split(/\n\s*ASEAN\s+\d/)[0];
 for(const n of [year-2,year-1,year]){
  if(!header.includes('('+(n-1)+'/'+n+')'))return [];
 }
 const out:OriginSupplyRecord[]=[];
 for(const line of block.split(/\n/)){
  const row=trim(line).match(/^(Cambodia|Lao PDR|Vietnam|Viet Nam)\s+(.+)$/);
  if(!row)continue;
  const cols=row[2].split(/\s+/);
  if(cols.length!==7)continue;
  const current=tonnes(cols[4])*1000,prior=tonnes(cols[1])*1000;
  if(!usable(current)||!usable(prior))continue;
  out.push(record(afsisOrigins[row[1] as keyof typeof afsisOrigins],cropYear(year),Math.round(current),cropYear(year-1),Math.round(prior),
   {name:'AFSIS',url,reportDate:date,retrievedAt:now.toISOString(),sha256,edition:date,issue},'forecast'));
 }
 return out.length===3&&new Set(out.map(x=>x.originKey)).size===3?out:[];
}
export function parsePolandPotatoSupply(raw:any,url:string,sha256:string,now=new Date()):OriginSupplyRecord[]{
 const keys=['freq','geo','crops','strucpro','time'];
 if(!raw?.id?.length||raw.id.length!==keys.length||!keys.every(k=>raw.id.includes(k))||!Number.isFinite(Date.parse(raw.updated))||Date.parse(raw.updated)>+now)return [];
 const codes=(k:string)=>{const obj=raw.dimension?.[k]?.category?.index;return Array.isArray(obj)?obj:Object.keys(obj||{}).sort((a,b)=>obj[a]-obj[b]);};
 const fixed:Record<string,string>={freq:'A',geo:'PL',crops:'R1000',strucpro:'HPRD_THS_T'};
 if(Object.entries(fixed).some(([k,v])=>codes(k).join()!==v))return [];
 if(!/harvested production.*thousand tonnes/i.test(raw.dimension?.strucpro?.category?.label?.HPRD_THS_T||''))return [];
 const periods=codes('time');
 if(!Array.isArray(raw.size)||raw.size.length!==keys.length||raw.id.some((k:string,i:number)=>codes(k).length!==raw.size[i])||new Set(periods).size!==periods.length)return [];
 const points=periods.flatMap((y:string,i:number)=>{
  const x=raw.value?.[i],flags=String(raw.status?.[i]||'');
  return /^20\d{2}$/.test(y)&&+y<=now.getUTCFullYear()&&typeof x==='number'&&usable(x*1000)&&!/[^ep\s]/i.test(flags)?[{y,v:Math.round(x*1000),flags}]:[];
 }).sort((a:{y:string},b:{y:string})=>b.y.localeCompare(a.y));
 const current=points[0];
 if(!current)return [];
 const prior=points.find((x:{y:string})=>+x.y===+current.y-1);
 return [record('poland',current.y,current.v,prior?.y||'',prior?.v??NaN,{name:'Eurostat (원료감자)',url,reportDate:null,
  retrievedAt:now.toISOString(),sha256,dataUpdatedAt:raw.updated},/[ep]/i.test(current.flags)?'estimated':'actual',true)];
}
const retainedFile='free-starch-origin-supply.json';
const baseline=(root:string)=>{const rows=readFreeJson('starch_origin_supply_verified.json',path.join(root,'src/data'))?.records;return Array.isArray(rows)?rows:[];};
const key=(r:OriginSupplyRecord)=>r.commodityId+'/'+r.originKey;
const period=(r:OriginSupplyRecord)=>r.reportingYear.split('/')[0];
const release=(r:OriginSupplyRecord)=>r.source.reportDate||r.source.dataUpdatedAt||'';
const usableRecord=(r:any):r is OriginSupplyRecord=>!!r&&r.scope==='national'&&r.unit==='tonnes'&&usable(r.productionTonnes)&&
 !!r.source?.url&&typeof r.source.retrievedAt==='string'&&/^[a-f0-9]{64}$/.test(r.source.sha256)&&
 (r.commodityId==='potato-starch'?r.originKey==='poland'&&r.crop==='raw-potatoes-including-seed'&&/^20\d{2}$/.test(r.reportingYear):
  r.commodityId==='tapioca-starch'&&['thailand','vietnam','cambodia','laos'].includes(r.originKey)&&r.crop==='fresh-cassava-roots'&&/^20\d{2}\/\d{2}$/.test(r.reportingYear));
export function readStarchOriginSupply(root=process.cwd()):OriginSupplyRecord[]{
 const records=new Map<string,OriginSupplyRecord>(baseline(root).filter(usableRecord).map((r:OriginSupplyRecord)=>[key(r),r]));
 const saved=readFreeJson(retainedFile,path.join(root,'.rms-stage3'));
 for(const r of Array.isArray(saved?.records)?saved.records:[]){
  if(!usableRecord(r))continue;
  const old=records.get(key(r));
  if(!old||period(r)>period(old)||period(r)===period(old)&&release(r)>=release(old))records.set(key(r),r);
 }
 return [...records.values()];
}
/** The detail card and Origin Radar share the same already verified national crop record. */
export function readSavedThaiCassavaSupply(root=process.cwd(),now=new Date()){
 const r=readStarchOriginSupply(root).find(r=>r.commodityId==='tapioca-starch'&&r.originKey==='thailand');
 if(!r)return null;
 const {source,previous}=r;
 return readThaiCassavaSupply({scope:'thailand-cassava',source,estimateStatus:r.estimateStatus,
  current:{reportingYear:r.reportingYear,productionTonnes:r.productionTonnes,
   harvestedAreaRai:r.harvestedAreaRai??source.harvestedAreaRai,yieldTonnesPerRai:r.yieldTonnesPerRai??source.yieldTonnesPerRai},
  ...(previous?.scope===r.scope&&previous.crop===r.crop&&previous.unit===r.unit?{
   previous:{...previous,harvestedAreaRai:previous.harvestedAreaRai??source.previousHarvestedAreaRai,
    yieldTonnesPerRai:previous.yieldTonnesPerRai??source.previousYieldTonnesPerRai}
  }:{})},now);
}
const thaiMetrics=(r:OriginSupplyRecord)=>[
 r.harvestedAreaRai,r.yieldTonnesPerRai,r.previous?.reportingYear,r.previous?.productionTonnes,
 r.previous?.harvestedAreaRai,r.previous?.yieldTonnesPerRai
];
export async function refreshStarchOriginSupply(id:'potato-starch'|'tapioca-starch',options:{
 root?:string;now?:Date;fetcher?:typeof fetch;extractPdf?:(bytes:Uint8Array)=>Promise<string>;
}={}){
 const root=options.root||process.cwd(),dir=path.join(root,'.rms-stage3'),now=options.now||new Date(),fetcher=options.fetcher||fetch;
 const prior=readFreeJson(retainedFile,dir)||{},oldMap=new Map<string,OriginSupplyRecord>((Array.isArray(prior.records)?prior.records:[]).filter(usableRecord).map((r:OriginSupplyRecord)=>[key(r),r]));
 const old=readStarchOriginSupply(root);
 const get=async(url:string)=>{const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(18000)});if(!r.ok||r.redirected)throw Error('Official source HTTP '+r.status);return r;};
 const tasks:Partial<Record<SourceId,()=>Promise<OriginSupplyRecord[]>>>=id==='potato-starch'?{
  'poland-eurostat':async()=>{
   const url=EUROSTAT+'?lang=EN&freq=A&geo=PL&crops=R1000&strucpro=HPRD_THS_T&sinceTimePeriod='+(now.getUTCFullYear()-3);
   const b=await(await get(url)).text();return parsePolandPotatoSupply(JSON.parse(b),url,digest(b),now);
  }
 }:{
  'thai-survey':async()=>parseThaiCassavaSurvey(await(await get(new URL(THAI_CASSAVA_SURVEYS).href)).text(),now),
  'afsis-aco':async()=>{
   const item=discoverAfsisIssue(await(await get(AFSIS_ACO_INDEX)).text());
   if(!item)return [];
   const existing=old.filter(r=>r.source.name==='AFSIS'&&r.source.url===item.url&&r.source.issue===item.issue);
   if(existing.length===3)return existing;
   const b=new Uint8Array(await(await get(item.url)).arrayBuffer());
   if(b.length>50_000_000||Buffer.from(b.subarray(0,5)).toString()!=='%PDF-')return [];
   const sha=digest(b),extract=options.extractPdf||(async(data:Uint8Array)=>{
    const parser=new PDFParse({data});try{return (await parser.getText()).text;}finally{await parser.destroy();}
   });
   return parseAfsisCassavaIssue(await extract(b),item.url,item.issue,sha,now);
  }
 };
 const failures:string[]=[];
 const results=await Promise.allSettled(Object.entries(tasks).map(async([name,work])=>({name,rows:await work()})));
 for(const [i,result] of results.entries()){
  if(result.status!=='fulfilled'||!result.value.rows.length){failures.push(Object.keys(tasks)[i]);continue;}
  for(const r of result.value.rows){
   const prev=old.find(p=>key(p)===key(r));
   if(prev&&(period(prev)>period(r)||period(prev)===period(r)&&release(prev)>release(r)))continue;
   if(prev&&period(prev)===period(r)&&release(prev)===release(r)&&prev.productionTonnes===r.productionTonnes&&prev.source.url===r.source.url){
    if(result.value.name!=='thai-survey'||JSON.stringify(thaiMetrics(prev))===JSON.stringify(thaiMetrics(r)))continue;
    // A same-release incomplete response must not erase a reported metric or prior period.
    if(thaiMetrics(prev).some((value,i)=>value!==undefined&&thaiMetrics(r)[i]===undefined))continue;
   }
   oldMap.set(key(r),r);
  }
 }
 // The two starch tasks can run concurrently under the daily runner. Merge
 // the other commodity's committed rows again immediately before writing.
 const current=readFreeJson(retainedFile,dir);
 const outside=(Array.isArray(current?.records)?current.records:[]).filter((r:OriginSupplyRecord)=>r.commodityId!==id);
 const inside=[...oldMap.values()].filter(r=>r.commodityId===id);
 if(inside.length)writeFreeJson(retainedFile,{records:[...outside,...inside]},dir);
 return failures;
}
