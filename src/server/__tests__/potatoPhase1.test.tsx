import fs from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import jrc from '../../data/potato_jrc_monthly_verified.json';
import {PotatoRawSupplyCard} from '../../components/PotatoRawSupplyCard.tsx';
import {readVerifiedPotatoNews} from '../potatoVerifiedNews.ts';
import {assessNewsSummary} from '../../utils/newsSummaryQuality.ts';
import {loadPotatoProductionHistory} from '../potatoProductionHistory.ts';
import {createHash} from 'node:crypto';
const dir='.rms-research/potato-phase1-2026-10-22';
for(const s of jrc.sources){assert.equal(createHash('sha256').update(fs.readFileSync(`${dir}/${s.id}.pdf`)).digest('hex'),s.sha256);const text=fs.readFileSync(`${dir}/${s.id}.txt`,'utf8').split('Page 27 / 41')[1].split('P otatoes')[0];for(const row of jrc.rows){const code=row.code.split('').join('\\s*'),m=new RegExp('^'+code+'\\s+(\\d+[.\\d]*)\\s+(\\d+[.\\d]*)\\s+(\\d+[.\\d]*)','m').exec(text);assert(m,row.code+' official PDF row');assert.equal(Number(m[1]),row.fiveYearMean);assert.equal(Number(m[2]),row.previousYear);assert.equal(Number(m[3]),s.id==='JRC146189'?row.forecast:row.previousForecast);}}
assert.equal(jrc.publishedAt,'2026-09-28');assert.equal(jrc.nextScheduledPublication,'2026-10-26');assert(!jrc.sources.some(s=>s.publishedAt==='2026-10-26'));
const history=loadPotatoProductionHistory(),years=history.years.filter(y=>y.provenance==='source-verified');assert.equal(years.length,5);assert(years.every(y=>y.unit==='MMT'&&y.coverage.join(',')==='DE,FR,NL,DK'));assert(history.years.some(y=>y.year==='2026'&&y.provenance==='manual-import'),'preserve original manual record internally');
const html=renderToStaticMarkup(<PotatoRawSupplyCard data={{harvestYear:'2025',productionMMT:35.25,area1000HA:781.6,weightedYieldMTHA:45.11}}/>),$=load(html);assert.equal($('[data-jrc-potato-table] tbody tr').length,6);assert(html.includes('35.25 MMT'));assert(html.includes('2025 실적')&&html.includes('2026 전망'));assert(!/19.2%|Starch Exports|Starch Imports|500.51/.test(html));assert(html.includes('세계 생산량'));
const articles=readVerifiedPotatoNews();assert.equal(articles.length,4);assert.equal(new Set(articles.map(a=>new URL(a.originalUrl).hostname)).size,4);for(const a of articles){assert(assessNewsSummary(a.summary,a.title,'potato-starch').pass,a.id);assert.equal(a.provenance,'independently-verified-original');assert(a.publishedAt<='2026-10-22');}
assert(readVerifiedPotatoNews('/tmp/nonexistent-potato-test-root').length===0);
const component=fs.readFileSync('src/components/CommodityDetail.tsx','utf8');assert(component.includes("livePotatoData.years.filter((y: any) => y.provenance === 'source-verified')"));assert(!component.includes('27.60 MMT'));console.log('PASS: actual JRC PDFs, six regions/two years/monthly forecasts, four original starch articles, original history preserved, raw-only S&D and verified graph');
