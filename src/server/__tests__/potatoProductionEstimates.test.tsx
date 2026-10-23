import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {readRetainedPotatoChartYields} from '../potatoJrcOutlook.ts';
import {createRegionalPotatoHistory,parseRegionalPotatoProduction} from '../potatoProductionHistory.ts';
import {potatoChartDisplay} from '../../utils/potatoProductionChart.ts';
import {PotatoProductionChartView} from '../../components/PotatoProductionChart.tsx';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-potato-estimates-'));
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Offline retained-evidence test');};
try{
 const packet=await readRetainedPotatoChartYields();
 assert.deepEqual(packet.forecasts.map(f=>[f.region,f.year,f.yieldMTHA]),[['NL',2026,40.8],['DK',2026,44.7],['DE',2026,36.9]]);
 const raw=JSON.parse(fs.readFileSync('.rms-research/potato-top-integration-2026-10-23/production-original.json','utf8'));
 const official=parseRegionalPotatoProduction(raw);
 assert.equal(official.points.filter(p=>p.year===2026).length,0,'retained source has no direct production estimates');
 const saved=JSON.parse(fs.readFileSync('.rms-price-history/potato-production-regions-v2.json','utf8'));
 saved.points=saved.points.filter((p:any)=>p.year!==2026);
 const file=path.join(root,'chart.json');fs.writeFileSync(file,JSON.stringify(saved));
 const result=await createRegionalPotatoHistory({file,jrc:async()=>packet}).reconcileSaved();
 assert.equal(result.lastSuccessfulFetchAt,saved.lastSuccessfulFetchAt,'reconciliation is not a new provider fetch');
 for(const old of saved.points)assert.deepEqual(result.points.find(p=>p.region===old.region&&p.year===old.year),old);
 for(const [region,expected] of [['DE',10.34676],['NL',6.12408],['DK',3.036918]] as const){
  const p=result.points.find(p=>p.region===region&&p.year===2026)!;
  assert(p);assert.equal(p.status,'Derived Estimate');assert(Math.abs(p.productionMMT-expected)<1e-10);
  const area=official.areas.find(a=>a.region===region&&a.year===2026)!;
  assert.equal(p.area1000HA,area.area1000HA);assert.equal(p.crop,area.crop);
  assert.equal(p.productionMMT,p.area1000HA!*p.yieldMTHA!/1000);
  assert.equal(p.sourceUrl,packet.latestReportUrl);assert.equal(p.areaSourceUrl,area.sourceUrl);
 }
 for(const period of [3,5,10,'all'] as const)for(const mode of ['absolute','indexed'] as const){
  const display=potatoChartDisplay(result.points,period,mode);
  assert.deepEqual(display.regions,['DE','NL','DK']);
  assert.equal(display.rows.filter(p=>p.year===2026).length,mode==='absolute'?3:0);
 }
 const $=load(renderToStaticMarkup(createElement(PotatoProductionChartView,{snapshot:result})));
 assert.deepEqual($('[data-summary]').map((_,e)=>$(e).attr('data-summary')).get(),['DE','NL','DK']);
 assert.equal($('path[stroke-dasharray="5 4"][data-from-year="2025"][data-to-year="2026"]').length,3);
 assert.equal($('path[data-to-year="2025"][stroke-dasharray]').length,0);
 assert.equal($('g[data-region="EU27_2020"]').length,0);
 assert(!$('button').text().includes('EU27'));assert.equal($('button').filter((_,e)=>/^(독일|네덜란드|덴마크)$/.test($(e).text())).length,0);
 assert.equal($('[data-summary]').filter((_,e)=>$(e).text().includes('2026 추정')).length,3);
 assert(!$.text().includes('동적 공통'));assert(!$.text().includes('수집 없음'));
 // A previous-year area is not an admissible replacement for missing 2026 area.
 saved.areas=saved.areas.filter((a:any)=>!(a.region==='NL'&&a.year===2026));
 fs.writeFileSync(file,JSON.stringify(saved));
 const missing=await createRegionalPotatoHistory({file,jrc:async()=>packet}).reconcileSaved();
 assert(!missing.points.some(p=>p.region==='NL'&&p.year===2026));
 // Retained receipt hash is enforced before extracting forecasts.
 const metadataDir=path.join(root,'src/data'),pdfDir=path.join(root,'.rms-research/potato-phase1-2026-10-22');
 fs.mkdirSync(metadataDir,{recursive:true});fs.mkdirSync(pdfDir,{recursive:true});
 fs.copyFileSync('src/data/potato_jrc_monthly_verified.json',path.join(metadataDir,'potato_jrc_monthly_verified.json'));
 fs.writeFileSync(path.join(pdfDir,'JRC146189.pdf'),'tampered');
 await assert.rejects(readRetainedPotatoChartYields(root),/hash mismatch/);
 assert.equal(calls,0);
 console.log('PASS retained PDF/hash/table, same-year official areas, three 2026 derived estimates, dotted 2025–2026 segments, observed-only index, missing-area exclusion and zero requests');
}finally{globalThis.fetch=originalFetch;fs.rmSync(root,{recursive:true,force:true});}
