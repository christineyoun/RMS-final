import {scfiReuseAuthorization,SSE_SCFI_URL} from './scfiScraperService.ts';
import {discoverAdditionalNews} from './additionalNewsDiscovery.ts';
import fs from 'node:fs';import path from 'node:path';
import {sharedWeatherScreen} from './originWeatherService.ts';
import type {FreeSourceJob} from './freeSourceRefresh.ts';
import {readFreeJson,writeFreeJson,readFreePublication,observationFingerprint} from './freeDailyPublication.ts';
import {parseDatedDisplayFx} from '../utils/soybeanPriceSnapshot.ts';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const packet=(publication:any,observationDate:any,lastError?:any)=>({publication,verifiedAt:publication?.verifiedAt||publication?.checkedAt||publication?.fetchedAt||publication?.lastSuccessfulFetchAt,observationDate:observationDate?String(observationDate):null,lastError:lastError||undefined});
const sourceError=(s:any)=>s.lastError||s.refreshFailed&&s.message||s.success===false&&(s.message||'No verified source response')||s.status==='last-verified'&&s.message&&!/Previously/.test(s.message)&&s.message;
export function retainedFx(){
 const saved=readFreeJson('free-fx.json');if(saved)return saved;
 // Existing original FX response, verified in the preceding chart implementation.
 try{const dir='.rms-research/potato-exact-parity-2026-10-23/',raw=JSON.parse(fs.readFileSync(dir+'fx-received.json','utf8')),meta=JSON.parse(fs.readFileSync(dir+'visual-parity.json','utf8')).fx;if(parseDatedDisplayFx(raw,meta.retrievedAt))return {raw,verifiedAt:meta.retrievedAt};}catch{}return null;
}
async function fxJob(){const url='https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,MYR';try{const r=await fetch(url);if(!r.ok)throw Error('Frankfurter HTTP '+r.status);const raw=await r.json(),verifiedAt=new Date().toISOString();if(!parseDatedDisplayFx(raw,verifiedAt))throw Error('Invalid official FX date or units');const saved={raw,verifiedAt};writeFreeJson('free-fx.json',saved);return packet(raw,raw.date);}catch(e){const old=retainedFx();if(old){writeFreeJson('free-fx.json',old);return packet(old.raw,old.raw.date,(e as Error).message);}throw e;}}
async function history(id:string){
 if(id==='wheat'){const {usWheatPriceReportService:s}=await import('./usWheatService.ts');const r:any=await s.getPriceHistory(true);return packet(r,r.data?.at(-1)?.date||r.reportDate,r.sourceError||r.sourceStatus==='unavailable'&&'U.S. Wheat report unavailable');}
 if(id==='soybean'||id==='soybean-oil'){
  const r=id==='soybean'?await(await import('./soybeanIntelligenceService.ts')).soybeanIntelligenceService.getSoybeanPriceSnapshot(true,'scheduled'):await(await import('./soybeanOilIntelligenceService.ts')).soybeanOilIntelligenceService.getSoybeanOilPriceSnapshot(true,'scheduled');return packet(r,r.data.at(-1)?.date,r.lastError);
 }
 if(id==='palm-oil'||id==='tapioca-starch'){const {refreshPublicHistory}=await import('./publicPriceHistory.ts');const r=await refreshPublicHistory(id);return packet(r,r.points.map(p=>p.date).sort().at(-1),r.lastError);}
 const r:any=id==='sugar'?await(await import('./sugarPriceSnapshotService.ts')).sugarPriceSnapshotService.getSnapshot(true):await(await import('./historicalPriceService.ts')).fetchHistoricalData(id,'5Y',true);
 await(await import('./savedGraphHistory.ts')).rememberGraphRefresh(id,r);return packet(r,r.data?.at(-1)?.date,r.lastError||r.success===false&&'History unavailable');
}
async function world(id:string){const r=id==='soybean-oil'?await(await import('./usdaSoybeanOilLiveService.ts')).fetchSoybeanOilWorldPsd(false):await(await import('./usdaOtherCommoditiesLiveService.ts')).fetchOtherCommodityWorldPsd(id,false);return {...packet(r.data,r.data?`${r.data.marketYear}-${r.data.releaseMonth||''}`:null,sourceError(r)),verifiedAt:r.verifiedAt};}
async function origin(id:string){const {originRadarService:s}=await import('./originRadarService.ts');const r=id==='wheat'?await s.getWheatOriginRadar(true):id==='corn'?await s.getCornOriginRadar(true):id==='soybean'?await s.getSoybeanOriginRadar(true):await(await import('./all8OriginRadarService.ts')).loadAll8OriginRadar(id,true);
 const weather=originWeatherPublicationStatus(r);const dates=weather.dates,errors=weather.errors;
 writeFreeJson('free-origin-'+id+'.json',r);return packet(r,dates.at(-1),errors?`${errors} origins retain older or incomplete weather evidence`:undefined);
}
async function news(id:string){
 if(['soybean','soybean-oil','palm-oil'].includes(id)){const r=id==='soybean'?await(await import('./soybeanNewsPersistence.ts')).refreshSoybeanNews():id==='soybean-oil'?await(await import('./soybeanOilVerifiedNews.ts')).refreshSoybeanOilNews():await(await import('./palmVerifiedNews.ts')).refreshPalmNews();return packet(r.articles||r,(r.articles||[]).map((a:any)=>a.publishedAt).sort().at(-1),r.lastError);}
 let discovery:any,accepted:any[]=[];
 if(id==='wheat'){const [feed,pages]=await Promise.all([(await import('./wheatFeedDiscovery.ts')).discoverWheatPublisherFeeds(),(await import('./wheatPublicPageDiscovery.ts')).discoverWheatPublicPages()]);discovery={candidates:[...pages.candidates,...feed.candidates]};const seen=new Set();const items=discovery.candidates.filter((x:any)=>{if(seen.has(x.originalUrl))return false;seen.add(x.originalUrl);return true;}).slice(0,12);accepted=(await(await import('./wheatArticleVerification.ts')).verifyWheatNewsLinksReported(items)).accepted;}
 else if(id==='corn'){const m=await import('./cornVerifiedNews.ts');discovery=await m.discoverCornFreeSources();accepted=(await m.verifyCornCandidates(discovery.candidates.slice(0,12))).accepted;}
 else {
  // These commodities have original-article verification but no standalone free index discovery.
  // Recheck the original approved article URLs; preserve Korean editorial summaries and receipts.
  const inputs=await savedOverviewInputs();const prior=inputs.find(i=>i.id===id)?.articles||[];
  const extra=await discoverAdditionalNews(id);
  accepted=await(await import('./all8ArticleVerification.ts')).verifyOtherCommodityArticles([...extra.candidates,...prior.map((a:any)=>({...a,rawTitle:a.sourceHeadline||a.title,rawSnippet:a.summary,rawId:a.id}))].slice(0,12),id);
  discovery={candidates:[...extra.candidates,...prior],limitation:'Bounded original-publisher feeds; missing articles may be researched only within authorized paid context'};
 }
 const value={checkedAt:new Date().toISOString(),candidates:accepted,discoveryCount:discovery.candidates.length,status:'verified-originals-awaiting-editorial-review',limitation:discovery.limitation};writeFreeJson('free-news-candidates-'+id+'.json',value);
 return packet(accepted,accepted.map(a=>a.publishedAt).sort().at(-1),accepted.length?undefined:'No original public articles verified; approved saved news retained');
}
export function originWeatherPublicationStatus(r:any){const errors=r.origins.filter((o:any)=>{const evidence=Array.isArray(o.weatherEvidence)?o.weatherEvidence:[o.weatherEvidence?.shared||o.weatherEvidence];return !evidence.length||evidence.some((e:any)=>!e||e.retrievalFailed||e.history?.length!==28||e.rainfallDays!==7||e.temperatureDays!==7||e.minimumTemperatureDays!==7);}).length;const dates=r.origins.flatMap((o:any)=>Array.isArray(o.weatherEvidence)?o.weatherEvidence:[o.weatherEvidence?.shared||o.weatherEvidence]).map((e:any)=>e?.lastDay).filter(Boolean).sort();return {errors,dates};}
export function dailyFreeSourceJobs():FreeSourceJob[]{return [
 {key:'transport-policy',commodity:'overview / wheat',source:'USDA AMS ocean grain freight + Federal Register (US wheat scope only)',cadenceHours:24,run:async()=>{const r=await(await import('./wheatOriginTransportPolicyService.ts')).wheatOriginTransportPolicyService.getEvidence();writeFreeJson('free-transport-policy.json',r);return packet(r,[r.freight?.observedOn,r.policy?.publishedOn].filter(Boolean).sort().at(-1),!r.freight&&!r.policy?'No currently verified US freight or relevant policy publication; absence is not proof of no restriction':undefined);}},
 {key:'energy',commodity:'overview',source:'Yahoo Finance Brent public quote',run:async()=>{const r=await(await import('./geminiApi.ts')).fetchLiveCrudeOilData('BZ=F',0);if(!r.observationDate||!(r.currentPrice>0))throw Error('No dated verified Brent quote; previous publication retained');saveVerifiedEnergy(r);return packet(r,r.sessionDate||r.observationDate);}},
 {key:'freight',commodity:'overview',source:'Shanghai Shipping Exchange SCFI',cadenceHours:168,retryable:!!scfiReuseAuthorization(),run:async()=>{if(!scfiReuseAuthorization())throw Error('SCFI written display/export authorization not recorded; no source request attempted');const r=await(await import('./scfiScraperService.ts')).scrapeLiveScfiIndex(true);if(!r.observationDate)throw Error('SSE did not provide a verifiable SCFI publication date; retained cache is not a new observation');return packet(r,r.observationDate,r.lastError);}},
 {key:'fx',commodity:'overview',source:'ECB / Frankfurter',run:fxJob},
 ...ids.filter(i=>i!=='potato-starch').map(id=>({key:id+'-history',commodity:id,source:id==='wheat'?'U.S. Wheat Associates':id.includes('starch')?'TTSA':id==='palm-oil'?'Public palm publisher tables':'Yahoo Finance exchange-labelled history',run:()=>history(id)})),
 ...ids.filter(i=>!i.includes('starch')).map(id=>({key:id+'-world',commodity:id,source:'USDA FAS PSD',cadenceHours:24,run:()=>world(id)})),
 {key:'potato-export-quote',commodity:'potato-starch',source:'Eurostat Comext DS-045409',cadenceHours:24,run:async()=>{const r=await(await import('./officialPotatoComextService.ts')).fetchOfficialPotatoExportQuote(true);return packet({data:r.data,changes:r.changes},r.data?.period,sourceError(r));}},
 {key:'potato-production-regions',commodity:'potato-starch',source:'Eurostat apro_cpnh1 + verified JRC MARS',cadenceHours:24,run:async()=>{const r=await(await import('./potatoProductionHistory.ts')).refreshRegionalPotatoProduction();return packet(r,r.points.map(p=>p.year).sort().at(-1),r.lastError);}},
 {key:'potato-production-history',commodity:'potato-starch',source:'Eurostat four-country raw potato harvest',cadenceHours:24,run:async()=>{const r=await(await import('./potatoProductionHistory.ts')).refreshPotatoProductionHistory();const stats=await(await import('./officialPotatoEurostatService.ts')).fetchOfficialPotatoEurostat(false);if(stats.success&&stats.dataStatus==='live-verified')writeFreeJson('free-potato-stats.json',stats);return packet(r,r.years.at(-1)?.year,r.lastError);}},
 ...ids.map(id=>({key:'origin-'+id,commodity:id,source:'Existing country supply services + deduplicated Open-Meteo 28-day evidence',run:()=>origin(id)})),
 ...ids.map(id=>({key:id+'-news',commodity:id,source:'Existing original publisher verification/discovery; no AI summarization',run:()=>news(id)})),
 ];}
export async function savedOverviewInputs(){const {createStage3Gateway}=await import('./stage3DailyUpdates.ts'),gateway=createStage3Gateway();
 const get=(url:string)=>{let value:any;gateway({url,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}} as any,{setHeader(){},end(body:string){value=JSON.parse(body);}} as any,()=>{});return value;};
 return ids.map(id=>{const a=get('/api/ai-analysis/'+id),n=get('/api/market-intelligence?commodity='+id);return {id,analysis:a?.data||null,articles:n?.articles||[],procurementRisk:n?.procurementRisk||null};});
}
// Reuse the repaired point screen; never copy an aggregate country's pills.
export function overviewWeatherFromSaved(now=new Date()) {
 const pick=(id:string,key:string,label:string,lat:number,lon:number,crop:string,policy:{heatDays:number;rainMm?:number})=>{
  const radar=readFreeJson('free-origin-'+id+'.json'),o=radar?.origins?.find((o:any)=>o.originKey===key);
  const evidence=Array.isArray(o?.weatherEvidence)?o.weatherEvidence:[o?.weatherEvidence?.shared||o?.weatherEvidence];
  const e=evidence.find((e:any)=>e?.location===label&&e.coordinates?.[0]===lat&&e.coordinates?.[1]===lon);
  const point={key,label,lat,lon},screen=sharedWeatherScreen(e?[e]:[],[point],policy,now);
  const pills=screen.weatherPills||[],status=pills.some(p=>p.label==='자료 부족')?'판정 보류':pills.map(p=>p.label==='특이 없음'?'양호':p.label).join(' · ')||'판정 보류';
  return {temp:e?.daily?.at(-1)?.tMaxC??null,precip:e?.precip7mm??null,status,asOf:e?.lastDay||'',windowStart:e?.windowStart||'',sourceUrl:e?.sourceUrl||'',coordinates:[lat,lon],crop,basis:pills.map(p=>p.basis).join(' · ')};
 };
 return {usCornBelt:pick('corn','usa','아이오와',42.02,-93.62,'옥수수',{heatDays:3,rainMm:90}),saSoyBelt:pick('soybean','brazil','마투그로수',-13.5,-56.1,'대두',{heatDays:3}),euCropRadar:pick('wheat','eu','프랑스 보스',48.2,1.5,'소맥',{heatDays:3,rainMm:90})};
}
// Saved observations only. A retrieval timestamp is not an SCFI release date.
export function overviewMacroFromSaved(data:any) {
 const fx=data?.fx||retainedFx();let previous:any=null;
 try{const dir='.rms-research/potato-exact-parity-2026-10-23/';const raw=JSON.parse(fs.readFileSync(dir+'fx-received.json','utf8')),meta=JSON.parse(fs.readFileSync(dir+'visual-parity.json','utf8')).fx;if(parseDatedDisplayFx(raw,meta.retrievedAt)&&raw.base===fx?.raw?.base&&raw.date<fx.raw.date&&Date.parse(fx.raw.date)-Date.parse(raw.date)===86400000)previous={raw,verifiedAt:meta.retrievedAt};}catch{}
 const validFx=fx&&parseDatedDisplayFx(fx.raw,fx.verifiedAt);
 const energy=data?.energy,validEnergy=typeof energy?.currentPrice==='number'&&Number.isFinite(energy.currentPrice)&&energy.currentPrice>0&&Number.isFinite(Date.parse(energy.observationDate))&&Date.parse(energy.observationDate)<=Date.now()&&energy.sourceUrl?.includes('/BZ=F?');
 const quote=energy?.quoteDisplay,validQuote=quote&&Number.isFinite(quote.price)&&quote.price>0&&Number.isFinite(Date.parse(quote.observationDate))&&Date.parse(quote.observationDate)<=Date.now();
 const comparison=validEnergy&&validQuote&&quote.comparisonBasis==='provider-reported-quote-change'&&Number.isFinite(quote.pctChange);

 const freight=data?.freight,datedFreight=!!scfiReuseAuthorization()&&freight?.receiptSha256&&freight?.indexIdentity==='SCFI Composite Index'&&freight?.scfiPoints>0&&/^20\d{2}-\d{2}-\d{2}$/.test(freight.observationDate||'')&&Number.isFinite(Date.parse(freight.observationDate))&&Date.parse(freight.observationDate)<=Date.now()&&freight.sourceUrl===SSE_SCFI_URL;
 return {fx:validFx?{usdKrw:fx.raw.rates.KRW,eurKrw:fx.raw.rates.KRW/fx.raw.rates.EUR,date:fx.raw.date,previousDate:previous?.raw.date||null,usdChange:previous?(fx.raw.rates.KRW/previous.raw.rates.KRW-1)*100:null,eurChange:previous?((fx.raw.rates.KRW/fx.raw.rates.EUR)/(previous.raw.rates.KRW/previous.raw.rates.EUR)-1)*100:null}:null,energy:validEnergy?{brent:validQuote?quote.price:energy.currentPrice,brentChange:comparison?quote.pctChange:null,quoteChangeAmount:comparison?quote.changeAmount:null,quoteReferencePrice:comparison?quote.referencePrice:null,observationDate:validQuote?quote.observationDate:energy.observationDate,sessionDate:validQuote?quote.sessionDate:energy.sessionDate,comparisonBasis:comparison?quote.comparisonBasis:'comparison-unavailable',sourceUrl:energy.sourceUrl}:null,freight:datedFreight?{scfi:freight.scfiPoints,observationDate:freight.observationDate,sourceUrl:freight.sourceUrl,previousObservationDate:freight.previousObservationDate,changePct:freight.previousPoints>0&&freight.previousObservationDate<freight.observationDate?(freight.scfiPoints/freight.previousPoints-1)*100:null,retained:true}:null,scfiStatus:scfiReuseAuthorization()?'observation-unavailable':'permission-required'};
}
export function saveVerifiedEnergy(record:any){
 const old=readFreeJson('free-energy.json');
 const attributed=(rows:any[],source:any)=>rows.map((r:any)=>({...r,receiptPath:r.receiptPath||source.receiptPath,receiptSha256:r.receiptSha256||source.receiptSha256}));
 const history=[...attributed(old?.history||[],old),...attributed(old?.observations||[],old),...attributed(record.observations||[],record)];
 const unique=[...new Map(history.map((r:any)=>[r.sessionDate+'|'+r.price+'|'+r.receiptSha256,r])).values()];
 const retainedQuotes=old?.retainedQuotes||[];if(old?.currentPrice&&old?.comparisonBasis!=='provider-daily-close'&&!retainedQuotes.some((r:any)=>r.observationDate===old.observationDate))retainedQuotes.push(old);
 const saved={...record,history:unique,retainedQuotes};writeFreeJson('free-energy.json',saved);return saved;
}
export async function publishDailyOverview(run:any){
 const {savedGraphHistoryResponse}=await import('./savedGraphHistory.ts');const prices:any={};for(const id of ids.filter(i=>i!=='potato-starch')){const route=id==='wheat'?'/api/uswheat/price-history':'/api/history?commodity='+id+'&timeframe=5Y';const r=await savedGraphHistoryResponse(route);if(r?.status===200)prices[id]=r.payload;}
 const cornProcurement=await(await import('./cornIntelligenceService.ts')).CornIntelligenceService.getInstance().getCornProcurementAnalysis(true);
 const fx=retainedFx(),energy=readFreeJson('free-energy.json'),freight=(()=>{try{return JSON.parse(fs.readFileSync('src/data/cache_scfi.json','utf8'));}catch{return null;}})(),inputs=await savedOverviewInputs(),{aggregateOverview}=await import('../utils/overviewIntelligence.ts');
 const potatoQuote=(await import('./officialPotatoComextService.ts')).readSavedPotatoExportQuote();
 const old=readFreePublication(),value={version:1,prices,cornProcurement,fx,energy,freight,weatherOverview:overviewWeatherFromSaved(),transportPolicy:readFreeJson('free-transport-policy.json'),potatoQuote,inputs,overview:aggregateOverview(inputs),unsupported:['BDI: no configured verified public collector; SCFI requires dated SSE publication','Trade policy: existing Federal Register wheat-scope screen only; other commodities retain approved verified publications','Tapioca official global balance: no verified feed configured']};
 const changed=!old||observationFingerprint(value)!==observationFingerprint(old.data);
 const publication={version:1,revision:changed?run.id:old.revision,publishedAt:changed?run.finishedAt:old.publishedAt,lastCheckedAt:run.finishedAt,status:run.status,data:changed?value:old.data};writeFreeJson('free-daily-publication.json',publication);
 const {captureOverviewPublication}=await import('./overviewPublishedInputs.ts'),{createStage3Gateway}=await import('./stage3DailyUpdates.ts'),{retainPublication}=await import('./overviewMarketHistory.ts');retainPublication(captureOverviewPublication(createStage3Gateway()));
 return {revision:publication.revision,publishedAt:publication.publishedAt,changed,commodityCount:Object.keys(prices).length+Number(!!potatoQuote.data)};
}
