import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createRegionalPotatoHistory} from '../potatoProductionHistory.ts';
import {JRC_POTATO_INDEX,fetchLatestPotatoChartYields} from '../potatoJrcOutlook.ts';

// Synthetic publication and values for an issue announced under a differently
// dated URL. This fixture never enters a production publication or cache.
const article=(date:string)=>'https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/crop-monitoring-'+date+'_en';
const repo='https://publications.jrc.ec.europa.eu/repository/';
const document=(id:string)=>repo+'bitstream/'+id+'/'+id+'.pdf';
const countries=['EU','AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','NL','MT','PL','PT','RO','SI','SK','SE'];
function table(day:string,yieldValue:number) {
 return 'JRC MARS Bulletin Vol. 1 No. 1 – '+day+'\n'+
  countries.map(c=>c+' 40.0 41.0 '+yieldValue.toFixed(1)+' -5 -6 -1').join('\n')+
  '\nPotatoes\nCountry last 5yrs\navg yield\n2025\nyield\nEU yield forecasts for 2026 [t/ha]\nPotatoes Potatoes (including seed potatoes) R1000';
}
function eurostat(now:Date,official:boolean){
 const dimensions={freq:['A'],crops:['R1000'],geo:['DE','NL','DK'],strucpro:['HPRD_THS_T','AR_THS_HA'],time:['2025','2026']};
 const dimension=Object.fromEntries(Object.entries(dimensions).map(([key,values])=>[key,{category:{
  index:Object.fromEntries(values.map((v,i)=>[v,i])),
  label:key==='strucpro'?{HPRD_THS_T:'Harvested production - thousand tonnes',AR_THS_HA:'Area - thousand hectares'}:{}
 }}]));
 const value:Record<string,number>={};
 for(let i=0;i<3;i++){value[i*4]=5000+i*100;value[i*4+2]=100+i;value[i*4+3]=110+i;if(official)value[i*4+1]=5100+i*100;}
 return {id:Object.keys(dimensions),size:Object.values(dimensions).map(v=>v.length),dimension,updated:now.toISOString(),value};
}

test('scheduled collector verifies the true issue date, persists updates and keeps verified values on failure',async()=>{
 let clock=new Date('2026-11-02T00:00:00Z');
 let issue={articleDate:'2026-09-28',pdfDate:'2026-09-28',dateText:'28 September 2026',id:'JRC901',yieldValue:40.0};
 let withoutTable=false,fail=false,official=false,pdfHits=0;
 const fetcher:typeof fetch=async(input)=>{
  const url=String(input);
  if(url===JRC_POTATO_INDEX){if(fail)throw Error('JRC offline');return new Response('<main><a href="'+article(issue.articleDate)+'">Crop bulletin</a></main>');}
  if(url===article(issue.articleDate))return new Response('<script type="application/ld+json">{"datePublished":"'+issue.pdfDate+'T10:00:00Z"}</script>'+
   '<p class="ecl-page-header__description">Read the <a href="'+repo+'handle/'+issue.id+'">JRC MARS Bulletin</a></p><main>Crop season report</main>');
  if(url===repo+'handle/'+issue.id)return new Response('<meta name="citation_pdf_url" content="'+document(issue.id)+'">');
  if(url===document(issue.id)){pdfHits++;return new Response('%PDF-fixture');}
  throw Error('Unexpected request '+url);
 };
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'potato-graph-audit-')),file=path.join(dir,'chart.json');
 try{
  const options={file,now:()=>clock,fetcher:async()=>new Response(JSON.stringify(eurostat(clock,official))),jrcFetcher:fetcher,
   extractJrcPdfText:async(bytes:Uint8Array)=>{
    structuredClone(bytes,{transfer:[bytes.buffer]});
    return withoutTable?'JRC MARS Bulletin Vol. 1 No. 1 – '+issue.dateText:table(issue.dateText,issue.yieldValue);
   }};
  let service=createRegionalPotatoHistory(options);
  const p=(d:Awaited<ReturnType<typeof service.refresh>>)=>d.points.find(row=>row.region==='DE'&&row.year===2026);
  const before=await service.refresh();
  assert.equal(p(before)?.yieldMTHA,40);
  assert.equal(before.jrc?.latestReportDate,'2026-09-28');
  clock=new Date('2026-11-03T00:00:00Z');
  issue={articleDate:'2026-10-23',pdfDate:'2026-10-26',dateText:'26 October 2026',id:'JRC902',yieldValue:42};
  const after=await service.refresh();
  assert.equal(after.lastError,undefined);
  assert.equal(after.jrc?.latestReportDate,'2026-10-26');
  assert.equal(after.potatoJrcPublication?.current.publishedAt,'2026-10-26');
  assert.equal(after.potatoJrcPublication?.previous?.publishedAt,'2026-09-28');
  assert.equal(after.potatoJrcPublication?.current.rows.length,6);
  assert.equal(after.potatoJrcPublication?.current.pdfSha256,createHash('sha256').update('%PDF-fixture').digest('hex'));
  assert.equal(p(after)?.sourceUrl,document(issue.id));
  assert.equal(p(after)?.publishedAt,'2026-10-26');
  assert.equal(p(after)?.productionMMT,110*42/1000);
  assert.equal(p(after)?.status,'Derived Estimate');
  assert.equal(pdfHits,2);
  service=createRegionalPotatoHistory(options);
  clock=new Date('2026-11-04T00:00:00Z');
  const unchanged=await service.refresh();
  assert.equal(p(unchanged)?.yieldMTHA,42);
  assert.equal(pdfHits,2,'unchanged issue skips PDF download even after restart');
  clock=new Date('2026-11-25T00:00:00Z');
  issue={articleDate:'2026-11-23',pdfDate:'2026-11-23',dateText:'23 November 2026',id:'JRC903',yieldValue:44};
  withoutTable=true;
  const noPotato=await service.refresh();
  assert.equal(noPotato.jrc?.latestReportDate,'2026-11-23');
  assert.deepEqual(noPotato.potatoJrcPublication,after.potatoJrcPublication,'no potato table never advances the display date');
  assert.equal(p(noPotato)?.sourceUrl,document('JRC902'));
  assert.equal(p(noPotato)?.yieldMTHA,42);
  withoutTable=false;
  issue={articleDate:'2026-11-24',pdfDate:'2026-11-24',dateText:'23 November 2026',id:'JRC904',yieldValue:99};
  await assert.rejects(fetchLatestPotatoChartYields({now:clock,fetcher,extractPdfText:options.extractJrcPdfText}),/matching publication date/);
  fail=true;
  const fallback=await service.refresh();
  assert.match(fallback.lastError||'',/JRC/);
  assert.deepEqual(p(fallback),p(unchanged));
  official=true;
  const actual=await service.refresh();
  assert.equal(p(actual)?.status,'Actual');
  assert.equal(p(actual)?.productionMMT,5.1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
