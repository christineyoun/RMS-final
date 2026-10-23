import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {parseOriginalPotatoSeries,parseRegionalPotatoProduction,deriveRegionalPotatoProduction,createRegionalPotatoHistory} from '../potatoProductionHistory.ts';
import {parseJrcPotatoYieldTable,fetchLatestPotatoChartYields,JRC_POTATO_INDEX} from '../potatoJrcOutlook.ts';
import {potatoChartDisplay,potatoChartYears,potatoPointYoY,POTATO_CHART_REGIONS} from '../../utils/potatoProductionChart.ts';
import {PotatoProductionChartView} from '../../components/PotatoProductionChart.tsx';
const now=new Date('2026-10-22T08:00:00Z');
// Synthetic fixtures only, isolated from production source caches.
function fixture(lastYear=2026){const years=Array.from({length:12},(_,i)=>String(lastYear-11+i));const entries={freq:['A'],crops:['R1000'],geo:[...POTATO_CHART_REGIONS],strucpro:['HPRD_THS_T','AR_THS_HA'],time:years};
 const raw:any={id:Object.keys(entries),size:Object.values(entries).map(a=>a.length),dimension:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,{category:{index:Object.fromEntries(v.map((code,i)=>[code,i])),label:k==='strucpro'?{HPRD_THS_T:'Harvested production - thousand tonnes',AR_THS_HA:'Area - thousand hectares'}:{}}}])),updated:new Date(Date.UTC(lastYear,8,28)).toISOString(),value:{},status:{}};
 for(let g=0;g<4;g++)for(let t=0;t<12;t++){raw.value[g*24+t]=(g+1)*1000+t*10;raw.value[g*24+12+t]=100+g*10;}raw.status[11]='p';raw.status[35]='e';delete raw.value[59];delete raw.value[83];return raw;
}
const parsed=parseRegionalPotatoProduction(fixture(),now);
const absolute=potatoChartDisplay(parsed.points,5,'absolute'),indexed=potatoChartDisplay(parsed.points,5,'indexed');
assert.equal(absolute.regions.length,3);assert.ok(absolute.rows.every(p=>p.displayValue===p.productionMMT));assert.ok(indexed.rows.every(p=>p.status==='Actual'||p.status==='Provisional'));for(const [region,base] of indexed.bases){if(base){assert.equal(indexed.rows.find(p=>p.region===region&&p.year===base.year)?.displayValue,100);for(const p of indexed.rows.filter(p=>p.region===region))assert.equal(p.displayValue,p.productionMMT/base.productionMMT*100);}}
assert.ok(indexed.high-indexed.low>=40,'minimum index range prevents exaggeration');assert.ok(absolute.rows.every(p=>p.displayValue>=absolute.low&&p.displayValue<=absolute.high));assert.ok(!absolute.regions.includes('EU27_2020'));assert.equal(potatoChartDisplay([],5,'indexed').rows.length,0);
const shifted=parsed.points.filter(p=>p.region!=='NL'||p.year>=2024);assert.equal(potatoChartDisplay(shifted,5,'indexed').bases.get('NL')?.year,2024,'actual first available year, no fabricated baseline');
assert.equal(parsed.points.find(p=>p.region==='NL'&&p.year===2026)?.status,'Provisional');assert.equal(parsed.points.find(p=>p.region==='DK'&&p.year===2026)?.status,'Official Estimate');
assert.equal(parsed.points.find(p=>p.region==='EU27_2020'&&p.year===2025)?.productionMMT,4.1,'official aggregate, never country sum');
assert.deepEqual(potatoChartYears(parsed.points,5),[2022,2023,2024,2025,2026]);assert.equal(potatoChartYears(parsed.points,3).length,3);assert.equal(potatoChartYears(parsed.points,10).length,10);assert.equal(potatoChartYears(parsed.points,'all').length,12);
const p=parsed.points.find(p=>p.region==='NL'&&p.year===2025)!;assert.ok(potatoPointYoY(p,parsed.points)!>0);assert.equal(potatoPointYoY(p,[p]),null);
for(const period of [3,5,10,'all'] as const)for(const mode of ['absolute','indexed'] as const){
 const display=potatoChartDisplay(parsed.points,period,mode);
 assert.deepEqual(display.regions,['DE','NL','DK']);
 for(const region of ['DE','NL','DK'])assert(display.rows.some(p=>p.region===region),'country remains visible: '+region);
}
const countries=['EU','AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
const pdfUrl='https://publications.jrc.ec.europa.eu/repository/bitstream/JRC999/JRC999.pdf';
function table(year=2026){return `JRC MARS Bulletin Vol. 1 No. 1 – 28 September ${year}\nlatest\nforecast\n`+countries.map(c=>`${c} 40.0 41.0 35.0 -5 -6 -1`).join('\n')+`\nPotatoes\nCountry last 5yrs\navg yield\n${year-1}\nyield\nEU yield forecasts for ${year} [t/ha]\nPotatoes Potatoes (including seed potatoes) R1000`;}
const forecasts=parseJrcPotatoYieldTable(table(),pdfUrl,'2026-09-28',now);assert.equal(forecasts.length,4);assert.equal(forecasts[0].yieldMTHA,35,'latest absolute yield, not average or percent');
assert.equal(parseJrcPotatoYieldTable(table().replace('R1000','R2000'),pdfUrl,'2026-09-28',now).length,0);assert.equal(parseJrcPotatoYieldTable(table().replace('t/ha','percent'),pdfUrl,'2026-09-28',now).length,0);
const derived=deriveRegionalPotatoProduction(parsed.areas,forecasts);assert.equal(derived.length,4);assert.equal(derived[0].productionMMT,3.5);assert.equal(deriveRegionalPotatoProduction(parsed.areas,forecasts.map(f=>({...f,year:2030}))).length,0);
assert.equal(deriveRegionalPotatoProduction(parsed.areas.filter(a=>a.region!=='EU27_2020'),forecasts).some(p=>p.region==='EU27_2020'),false,'no EU substitute or national aggregation');
let calls=0,fail=false,year=2026,jrcFail=false;let clock=now;
const fetcher=(async()=>{calls++;if(fail)throw Error('certificate failure');return new Response(JSON.stringify(fixture(year)));}) as typeof fetch;
const packet=async()=>{if(jrcFail)throw Error('offline');return {forecasts:parseJrcPotatoYieldTable(table(year),pdfUrl,year+'-09-28',clock),latestReportDate:year+'-09-28',latestReportUrl:pdfUrl,checkedAt:clock.toISOString(),message:'SYNTHETIC test packet'};};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rms-potato-chart-'));
try{
 const file=path.join(dir,'regions.json'),options={file,fetcher,jrc:packet,now:()=>clock},service=createRegionalPotatoHistory(options);
 const [a,b]=await Promise.all([service.refresh(),service.refresh()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.points.find(p=>p.region==='DE'&&p.year===2026)?.status,'Derived Estimate');assert.equal(a.points.find(p=>p.region==='DK'&&p.year===2026)?.status,'Official Estimate','official has precedence');
 const old=a.points.map(p=>({...p}));fail=true;jrcFail=true;const fallback=await createRegionalPotatoHistory(options).get(true);assert.deepEqual(fallback.points,old);assert.ok(fallback.lastError);assert.equal(fallback.lastSuccessfulFetchAt,a.lastSuccessfulFetchAt);
 fail=false;jrcFail=false;year=2027;clock=new Date('2027-10-22T08:00:00Z');const next=await service.refresh();assert.equal(Math.max(...next.points.map(p=>p.year)),2027);assert.deepEqual(potatoChartYears(next.points,5),[2023,2024,2025,2026,2027]);
 const aggregateRaw=fixture();aggregateRaw.dimension.geo.category.index.FR=4;aggregateRaw.size[2]=5;for(let t=0;t<12;t++)aggregateRaw.value[96+t]=2000+t*10;
 const originalSeries=parseOriginalPotatoSeries(aggregateRaw,now);assert.equal(originalSeries.at(-1)?.year,2025);assert.equal(originalSeries.at(-1)?.productionMMT,8.4);assert.equal(parseOriginalPotatoSeries(fixture(),now).length,0,'incomplete country coverage must not sum');
 const markup=renderToStaticMarkup(createElement(PotatoProductionChartView,{snapshot:{...a,originalSeries}}));for(const name of ['네덜란드','덴마크','독일','3년','5년','10년','전체','Actual'])assert.ok(markup.includes(name),name);assert.ok(markup.includes('data-production-line'));for(const region of POTATO_CHART_REGIONS.filter(r=>r!=='EU27_2020'))assert.ok(markup.includes('data-region="'+region+'"'));assert.ok(markup.includes('stroke-dasharray="5 4"'));assert.ok(!markup.includes('동적 공통 선형축'));assert.ok(!markup.includes('EU27'));assert.ok(!markup.includes('JRC 조회')); assert.ok(markup.includes('#DF0029'));assert.ok(!markup.includes('<table'));assert.ok(!markup.includes('checkbox'));assert.ok(!markup.includes('27.60'));assert.ok(!markup.includes('6M'));
 const aggregateFile=path.join(dir,'aggregate.json');const aggregateService=createRegionalPotatoHistory({...options,file:aggregateFile,fetcher:(async()=>new Response(JSON.stringify(aggregateRaw))) as typeof fetch});const saved=await aggregateService.refresh();assert.equal(saved.originalSeries?.length,originalSeries.length);const restored=await createRegionalPotatoHistory({...options,file:aggregateFile,fetcher:(async()=>{throw Object.assign(Error('TLS failed'),{code:'SELF_SIGNED_CERT_IN_CHAIN'});}) as typeof fetch,jrc:async()=>{throw Error('offline');}}).get(true);assert.deepEqual(restored.originalSeries,saved.originalSeries);assert.ok(restored.lastError?.includes('tls'));assert.equal(restored.lastSuccessfulFetchAt,saved.lastSuccessfulFetchAt);
 const manual=path.join(dir,'manual.json');fs.writeFileSync(manual,JSON.stringify({version:1,years:[{year:2026,productionMMT:27.6}]}));fail=true;jrcFail=true;const empty=await createRegionalPotatoHistory({...options,file:manual}).get(true);assert.equal(empty.points.length,0,'manual imports never enter regional graph');
 const original=globalThis.fetch;globalThis.fetch=(async()=>{throw Error('No external calls in scheduler test');}) as typeof fetch;
 try{const {createFreeSourceRunner}=await import('../freeSourceRefresh.ts');fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({freeAutoEnabled:true,scheduleHourKST:9}));let scheduled=0;
 const runner=createFreeSourceRunner({directory:dir,now:()=>clock,jobs:()=>[{key:'potato-production-regions',run:async()=>{scheduled++;return service.refresh();}}]});await Promise.all([runner.check(),runner.check()]);await runner.check();assert.equal(scheduled,1);assert.equal(createFreeSourceRunner({directory:dir,now:()=>clock,jobs:()=>[]}).check() instanceof Promise,true);
 }finally{globalThis.fetch=original;}
 console.log('PASS: regional official aggregate/status, strict JRC table definition/columns, derived alignment, periods/toggles/YoY, new year, legacy exclusion, restart/API fallback and scheduled dedup');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
if(process.argv[2]){
 const folder=process.argv[2],raw=JSON.parse(fs.readFileSync(path.join(folder,'eurostat.json'),'utf8')),official=parseRegionalPotatoProduction(raw);
 const index=fs.readFileSync(path.join(folder,'index.html'),'utf8'),article=fs.readFileSync(path.join(folder,'article.html'),'utf8'),publication=fs.readFileSync(path.join(folder,'publication.html'),'utf8'),pdf=fs.readFileSync(path.join(folder,'bulletin.pdf'));
 const fetcher=(async(input:any)=>{const u=String(input);if(u.includes('/api/dissemination/'))return new Response(JSON.stringify(raw));if(u===JRC_POTATO_INDEX)return new Response(index,{headers:{'content-type':'text/html'}});if(u.includes('/jrc-news-and-updates/'))return new Response(article,{headers:{'content-type':'text/html'}});if(u.includes('/repository/handle/'))return new Response(publication);if(u.includes('/repository/bitstream/'))return new Response(pdf);throw Error('Unexpected official source '+u);}) as typeof fetch;
 const actualPacket=await fetchLatestPotatoChartYields({fetcher});assert.equal(actualPacket.forecasts.length,4);
 const actual=await createRegionalPotatoHistory({file:null,fetcher,jrc:async()=>actualPacket}).get(true);
 const latest=POTATO_CHART_REGIONS.map(region=>({region,actual:actual.points.filter(p=>p.region===region&&p.status==='Actual').at(-1),latest:actual.points.filter(p=>p.region===region).at(-1)}));
 console.log('OFFICIAL SOURCES VERIFIED:',JSON.stringify({regionalObservations:official.points.length,forecasts:actualPacket.forecasts,latest}));
 fs.writeFileSync(path.join(folder,'verified-chart.json'),JSON.stringify(actual));
}
