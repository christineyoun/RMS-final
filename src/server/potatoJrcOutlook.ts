/** Free original-JRC HTML extraction only. No legacy JRC samples, AI or guessed table values. */
import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const JRC_POTATO_INDEX='https://joint-research-centre.ec.europa.eu/monitoring-agricultural-resources-mars/jrc-mars-bulletin_en';
const HOST='joint-research-centre.ec.europa.eu';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
export type JrcPotatoOutlook={sourceUrl:string;publishedAt:string;harvestYear:number;scope:'EU';comparison:'five-year-average';yieldChangePct:number;evidence:string;rawHtml:string;sha256:string;verifiedAt:string};
export type JrcPotatoDiscovery={outlook:JrcPotatoOutlook|null;latestReportDate:string;latestReportUrl:string;checkedAt:string;status:'verified'|'unsupported'};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function official(url:string):boolean{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname===HOST&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function discoverJrcPotatoReports(html:string,now=new Date()):{url:string;date:string}[]{
 const $=load(html),seen=new Set<string>(),reports:{url:string;date:string}[]=[];
 $('main a[href]').each((_i,a)=>{
  const href=$(a).attr('href')||'',label=clean($(a).text());let url:string;try{url=new URL(href,JRC_POTATO_INDEX).href;}catch{return;}
  if(!official(url)||!/\/jrc-news-and-updates\//.test(url)||/ukraine|global outlook/i.test(label+' '+url)||seen.has(url))return;
  const date=url.match(/-(20\d{2}-\d{2}-\d{2})_en(?:$|\?)/)?.[1];
  if(!date||!Number.isFinite(Date.parse(date))||Date.parse(date)>+now)return;
  seen.add(url);reports.push({url,date});
 });
 return reports.sort((a,b)=>b.date.localeCompare(a.date));
}
export function parseJrcPotatoHtml(html:string,sourceUrl:string,now=new Date()):JrcPotatoOutlook|null {
 if(!official(sourceUrl)||!/\/jrc-news-and-updates\//.test(sourceUrl)||html.length>3_000_000)return null;
 const $=load(html);const main=$('main');if(!main.length)return null;
 const published=html.match(/"datePublished"\s*:\s*"([^"\s]+)"/)?.[1]||$('meta[property="article:published_time"]').attr('content')||'';
 const publishedAt=published.slice(0,10),urlDate=sourceUrl.match(/-(20\d{2}-\d{2}-\d{2})_en/)?.[1];
 if(!urlDate||publishedAt!==urlDate||!Number.isFinite(Date.parse(published))||Date.parse(published)>+now)return null;
 main.find('script,style,nav,aside,.ecl-featured-item,.ecl-content-item-block').remove();
 const text=clean(main.text());if(!/JRC MARS/i.test(text))return null;
 // Never treat a publication year, five-year baseline, or a different crop's year as the potato harvest year.
 const yearMatch=text.match(/growing season (?:for|in) (20\d{2})|(?:yield forecasts|crop forecasts) (?:for major summer crops )?in (20\d{2})/i);
 const harvestYear=Number(yearMatch?.[1]||yearMatch?.[2]);
 if(!Number.isInteger(harvestYear)||harvestYear>now.getUTCFullYear()||harvestYear<now.getUTCFullYear()-1)return null;
 const matches:{value:number;evidence:string}[]=[];
 main.find('p').each((_i,p)=>{
  const context=clean($(p).text());
  if(!/JRC MARS forecasts for the EU/i.test(context)||!/five.year average/i.test(context))return;
  const list=$(p).next('ul');list.children('li').each((_j,li)=>{
   const line=clean($(li).text()),m=line.match(/^potatoes\s+(\d+(?:[.,]\d+)?)\s*%\s*(lower|higher)\s*[,.;]?$/i);
   if(!m)return;const n=Number(m[1].replace(',','.'));if(!Number.isFinite(n)||n>100)return;
   matches.push({value:m[2].toLowerCase()==='lower'?-n:n,evidence:context+' '+line});
  });
 });
 if(matches.length!==1)return null;
 return {sourceUrl,publishedAt,harvestYear,scope:'EU',comparison:'five-year-average',yieldChangePct:matches[0].value,evidence:matches[0].evidence,rawHtml:html,sha256:sha(html),verifiedAt:now.toISOString()};
}
export async function fetchLatestJrcPotatoOutlook(options:{fetcher?:typeof fetch;now?:Date}={}):Promise<JrcPotatoDiscovery> {
 const now=options.now||new Date(),fetcher=options.fetcher||fetch;
 const get=async(url:string)=>{
  if(!official(url))throw Error('Untrusted JRC source');
  const r=await fetcher(url,{redirect:'error',headers:{Accept:'text/html'},signal:AbortSignal.timeout(15000)});
  if(!r.ok||!String(r.headers.get('content-type')).includes('text/html'))throw Error('JRC HTML unavailable');
  const html=await r.text();if(html.length>3_000_000)throw Error('JRC HTML too large');return html;
 };
 const reports=discoverJrcPotatoReports(await get(JRC_POTATO_INDEX),now),latest=reports[0];
 if(!latest)throw Error('No dated European JRC report discovered');
 const outlook=parseJrcPotatoHtml(await get(latest.url),latest.url,now);
 return {outlook,latestReportDate:latest.date,latestReportUrl:latest.url,checkedAt:now.toISOString(),status:outlook?'verified':'unsupported'};
}
// Graph-only absolute yield table extraction; existing SCM outlook API above is unchanged.
import {PDFParse} from 'pdf-parse';
import type {PotatoYieldForecast} from '../utils/potatoProductionChart.ts';
export type PotatoChartJrcPacket={forecasts:PotatoYieldForecast[];latestReportDate:string;latestReportUrl:string;checkedAt:string;message:string;documents?:{sourceUrl:string;sha256:string;text:string}[]};
/** Reuse the same verified JRC publication as RMS, without collecting on views.
 * Parse the hash-verified original PDF, rather than treating yield as production. */
export async function readRetainedPotatoChartYields(root=process.cwd(),now=new Date()):Promise<PotatoChartJrcPacket>{
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'src/data/potato_jrc_monthly_verified.json'),'utf8'));
 const source=metadata.sources?.find((s:any)=>s.publishedAt===metadata.publishedAt);
 if(!source||!/^JRC\d+$/.test(source.id)||metadata.unit!=='t/ha'||!metadata.scope?.includes('R1000')||!Number.isFinite(Date.parse(metadata.verifiedAt))||Date.parse(metadata.verifiedAt)>+now)throw Error('Invalid retained JRC provenance');
 const bytes=fs.readFileSync(path.join(root,'.rms-research/potato-phase1-2026-10-22',source.id+'.pdf'));
 if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Retained JRC original hash mismatch');
 const parser=new PDFParse({data:new Uint8Array(bytes)});let text:string;
 try{text=(await parser.getText()).text;}finally{await parser.destroy();}
 const forecasts=parseJrcPotatoYieldTable(text,source.url,source.publishedAt,now).filter(f=>['DE','NL','DK'].includes(f.region));
 if(forecasts.length!==3||forecasts.some(f=>f.year!==metadata.forecastYear||metadata.rows.find((r:any)=>r.code===f.region)?.forecast!==f.yieldMTHA))throw Error('Retained JRC table and RMS metadata disagree');
 return {forecasts:forecasts.map(f=>({...f,verifiedAt:metadata.verifiedAt})),latestReportDate:source.publishedAt,latestReportUrl:source.url,checkedAt:now.toISOString(),message:'Retained original JRC yield table verified',documents:[{sourceUrl:source.url,sha256:source.sha256,text}]};
}
/** Match the potato table, explicit R1000 crop-definition concordance and the latest-forecast column. */
export function parseJrcPotatoYieldTable(text:string,sourceUrl:string,publishedAt:string,now=new Date()):PotatoYieldForecast[]{
 if(!/^https:\/\/publications\.jrc\.ec\.europa\.eu\/repository\/bitstream\//.test(sourceUrl)||!Number.isFinite(Date.parse(publishedAt))||Date.parse(publishedAt)>+now)return [];
 const normalized=text.replace(/\b([A-Z])\s+(?=[a-z])/g,'$1').replace(/inc\s+luding/g,'including').replace(/s\s+eed/g,'seed').replace(/R\s+1000/g,'R1000');
 if(!/Potatoes\s+Potatoes\s*\(including seed potatoes\s*\)\s+R1000/i.test(normalized))return [];
 const date=normalized.match(/JRC MARS Bulletin[^\n]*[–-]\s*(\d{1,2}\s+[A-Za-z]+\s+20\d{2})/i)?.[1];
 if(!date||!Number.isFinite(Date.parse(date+' UTC'))||new Date(date+' UTC').toISOString().slice(0,10)!==publishedAt)return [];
 const results:PotatoYieldForecast[]=[];
 for(const match of normalized.matchAll(/^\s*Potatoes\s*$/gm)){
  const start=match.index!,tail=normalized.slice(start,start+220);
  const header=tail.match(/last\s*5yrs\s*avg\s*yield\s*(20\d{2})\s*yield\s*EU yield forecasts for (20\d{2})\s*\[t\/ha\]/i);
  if(!header)continue;const year=Number(header[2]);
  if(Number(header[1])!==year-1||year>now.getUTCFullYear()||year<now.getUTCFullYear()-1)continue;
  const before=normalized.slice(Math.max(0,start-6000),start),euMatches=[...before.matchAll(/^\s*E\s*U\s+\d/gm)];
  if(!euMatches.length)continue;const block=before.slice(euMatches.at(-1)!.index);
  const rows=[...block.matchAll(/^\s*([A-Z]\s*[A-Z])\s+(\d+(?:[.,]\d+)?|—)\s+(\d+(?:[.,]\d+)?|—)\s+(\d+(?:[.,]\d+)?|—)[^\n]*$/gm)];
  const eu27=['AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
  const observed=rows.map(r=>r[1].replace(/\s/g,''));
  // EU is mapped to EU27 only when the table explicitly enumerates the 27 member countries.
  const euScope=observed.length===28&&eu27.every(code=>observed.filter(c=>c===code).length===1);
  for(const [code,region] of [['NL','NL'],['DK','DK'],['DE','DE'],['EU','EU27_2020']] as const){
   if(code==='EU'&&!euScope)continue;const values=rows.filter(r=>r[1].replace(/\s/g,'')===code);if(values.length!==1||values[0][4]==='—')continue;
   const yieldMTHA=Number(values[0][4].replace(',','.'));if(!Number.isFinite(yieldMTHA)||yieldMTHA<5||yieldMTHA>100)continue;
   results.push({region,year,yieldMTHA,crop:'R1000',sourceUrl,publishedAt,verifiedAt:now.toISOString(),definitionEvidence:'JRC crop concordance: Potatoes (including seed potatoes), Eurostat R1000; '+values[0][0].trim()+'; columns: 5-year average / previous year / latest forecast [t/ha]'});
  }
 }
 return results.filter(p=>results.filter(q=>q.region===p.region&&q.year===p.year).length===1);
}
export async function fetchLatestPotatoChartYields(options:{fetcher?:typeof fetch;now?:Date}={}):Promise<PotatoChartJrcPacket>{
 const now=options.now||new Date(),fetcher=options.fetcher||fetch,discovery=await fetchLatestJrcPotatoOutlook({fetcher,now});
 const packet:PotatoChartJrcPacket={forecasts:[],latestReportDate:discovery.latestReportDate,latestReportUrl:discovery.latestReportUrl,checkedAt:now.toISOString(),message:'검증 가능한 절대 단수 전망 미확보 · 평균 대비 변화율로 생산량 추정하지 않음'};
 if(!discovery.outlook)return packet;
 const $=load(discovery.outlook.rawHtml),handles=new Set<string>();
 $('main a[href]').each((_i,a)=>{try{const u=new URL($(a).attr('href')!,discovery.latestReportUrl);if(u.protocol==='https:'&&u.hostname==='publications.jrc.ec.europa.eu'&&/^\/repository\/handle\/JRC\d+$/.test(u.pathname))handles.add(u.href);}catch{}});
 const trusted=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='publications.jrc.ec.europa.eu'&&!u.username&&!u.password&&!u.port;}catch{return false;}};
 for(const handle of [...handles].slice(0,2)){
  const page=await fetcher(handle,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!page.ok)throw Error('JRC publication unavailable');
  const html=await page.text();if(html.length>3_000_000)throw Error('JRC publication too large');const meta=load(html),pdf=meta('meta[name="citation_pdf_url"]').attr('content');
  if(!pdf||!trusted(pdf)||!/^\/repository\/bitstream\//.test(new URL(pdf).pathname))continue;
  const response=await fetcher(pdf,{redirect:'error',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('JRC PDF unavailable');
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>50_000_000||Buffer.from(bytes.slice(0,5)).toString()!=='%PDF-')throw Error('Invalid JRC PDF: '+bytes.length+' bytes');
  const parser=new PDFParse({data:bytes.slice()});let text:string;try{text=(await parser.getText()).text;}finally{await parser.destroy();}
  const forecasts=parseJrcPotatoYieldTable(text,pdf,discovery.latestReportDate,now);
  if(forecasts.length){packet.forecasts=forecasts;packet.documents=[{sourceUrl:pdf,sha256:createHash('sha256').update(bytes).digest('hex'),text}];packet.message='공식 PDF의 R1000 정의·연도·지역·최신 절대 단수 열 검증 완료 · 같은 연도 면적이 있는 지역만 생산량 추정';break;}
 }
 return packet;
}
