/** Offline source-policy replay of genuine retained outputs. No SDK, grant or
 * snapshot persistence. Mutations below are explicitly synthetic guard probes. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {acceptPublisherResearchReport,parsePublisherResearchResponse} from '../liveAiAnalysisService.ts';
import {retainedOilPublisherCitations} from '../soybeanOilAnalysisEvidence.ts';
import {publisherResearchIntegrityIssues} from '../cornAiQuality.ts';
import {RMS_PROCUREMENT_POLICY} from '../../utils/rmsProcurementCondition.ts';
const files:string[]=[];function walk(p:string){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else files.push(f);}}walk('.rms-stage3');
const digest=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hashes=()=>files.map(digest),before=hashes();
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('OFFLINE: real network prohibited');};
const first=read('.rms-stage3/diagnostics/standalone-soybean-oil-af2df5f4fd65-1-soybean-oil.json'),latest=read('.rms-stage3/diagnostics/standalone-soybean-oil-f0d79222ad12-1-soybean-oil.json');
const oldSources=read('.rms-stage3/diagnostics/rejected-analysis/standalone-soybean-oil-af2df5f4fd65-analysis-soybean-oil.json').payload.data.sources;
const latestSources=read('.rms-research/soybean-oil-final-genuine-2026-10-22/publication-source-verification.json').resolvedSources;
const latestReport=JSON.parse(latest.response.text),asOf=new Date(latest.recordedAt),fields=['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'];
const result:any={providerCalls:0,productionGrants:0,publication:false};
try{
 for(const id of ['soybean','corn','wheat']){const s=read('.rms-stage3/snapshots/analysis-'+id+'.json'),a=s.payload.data,r=acceptPublisherResearchReport(JSON.stringify(a),id,a.model,a.sources,a.generatedAt);for(const k of fields)assert.deepEqual((r as any)[k],a[k]);}
 // Production proof, not an assumption based on mock tests or an HTTP route.
 const soy=read('.rms-stage3/snapshots/analysis-soybean.json'),promotion=read('.rms-stage3/retained-promotions/standalone-soybean-a874e58ab620.json.result.json');
 assert.equal(promotion.status,'saved');assert.equal(promotion.geminiHttpAttempts,0);assert.equal(digest('.rms-stage3/snapshots/analysis-soybean.json'),promotion.saved.sha256);
 const soyOriginal=JSON.parse(read('.rms-stage3/diagnostics/standalone-soybean-a874e58ab620-1-soybean.json').response.text);for(const k of fields)assert.deepEqual(soy.payload.data[k],soyOriginal[k]);
 result.soybeanProduction={promotionId:promotion.promotionId,originalRunId:promotion.originalRunId,snapshotHashMatches:true,originalSixFieldsPreserved:true};

 assert.throws(()=>acceptPublisherResearchReport(latest.response.text,'soybean-oil',latest.model,latestSources,latest.recordedAt),/missing-original-publisher-citation/);
 const context={evidence:latest.request.evidence},accepted=acceptPublisherResearchReport(latest.response.text,'soybean-oil',latest.model,latestSources,latest.recordedAt,context);
 for(const k of fields)assert.deepEqual((accepted as any)[k],latestReport[k],'original genuine fields unchanged');
 const supplements=accepted.sources.filter(s=>s.provenance);assert.equal(supplements.length,2);
 for(const s of supplements){assert.equal(s.provenance!.kind,'verified-retained-original');assert(/^[a-f0-9]{64}$/.test(s.provenance!.receiptSha256));assert(s.provenance!.evidenceIds.length);assert(s.provenance!.supportedClaims.length);assert(!latestSources.some((g:any)=>g.url===s.url));}
 assert.throws(()=>acceptPublisherResearchReport(first.response.text,'soybean-oil',first.model,oldSources,first.recordedAt,{evidence:first.request.evidence}),/unsupported-numerical-buying-target/,'source repair does not excuse the first response');
 assert(retainedOilPublisherCitations(JSON.parse(first.response.text),first.request.evidence,process.cwd(),new Date(first.recordedAt)).length===2);

 const redirects=new Map(latest.response.candidates[0].groundingMetadata.groundingChunks.map((c:any,i:number)=>[c.web.uri,latestSources[i].url]));let mockedRedirects=0;
 globalThis.fetch=async(input:any)=>{const location=redirects.get(String(input));assert(location,'only original retained grounding redirects');mockedRedirects++;return new Response(null,{status:302,headers:{location:String(location)}});};
 const parsed=await parsePublisherResearchResponse(latest.response,'soybean-oil',latest.model,context);
 assert.equal(mockedRedirects,3);assert.deepEqual(parsed.citationProvenance!.geminiGroundedUrls,latestSources.map((s:any)=>s.url));
 assert.deepEqual(parsed.citationProvenance!.verifiedRetainedOriginalUrls,supplements.map(s=>s.url));
 assert(parsed.citationProvenance!.verifiedRetainedOriginalUrls.every(url=>!parsed.citationProvenance!.geminiGroundedUrls.includes(url)));
 globalThis.fetch=async()=>{throw Error('OFFLINE: no external network');};
 await assert.rejects(parsePublisherResearchResponse({text:latest.response.text,candidates:[]},'soybean-oil',latest.model,context),/근거 링크/,'retained docs cannot manufacture Gemini grounding');

 const forged=structuredClone(latest.request.evidence);forged.facts.find((f:any)=>f.id==='article-oil-nopa-stocks').recordSha256='0'.repeat(64);
 assert(!retainedOilPublisherCitations(latestReport,forged,process.cwd(),asOf).some(s=>/fastmarkets/.test(s.url)));
 const missing={...latest.request.evidence,facts:[]};assert.deepEqual(retainedOilPublisherCitations(latestReport,missing,process.cwd(),asOf),[]);
 assert.deepEqual(retainedOilPublisherCitations(latestReport,{...latest.request.evidence,commodity:'soybean'},process.cwd(),asOf),[],'grain facts cannot serve as Oil evidence');
 const badNumber=structuredClone(latestReport);badNumber.bullishFactors[0]=badNumber.bullishFactors[0].replace('1.05','1.06');
 assert(!retainedOilPublisherCitations(badNumber,latest.request.evidence,process.cwd(),asOf).some(s=>/fastmarkets/.test(s.url)),'correct summary cannot launder changed factor quantity');
 assert.throws(()=>acceptPublisherResearchReport(JSON.stringify(badNumber),'soybean-oil',latest.model,latestSources,latest.recordedAt,context),/missing-original-publisher-citation:nopa/);

 // Tamper only isolated copies. Existing receipt verifier must reject changes
 // to original HTML, PDF text, wrong paths and missing source records.
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-oil-sources-OFFLINE-'));
 fs.mkdirSync(temp+'/.rms-stage3/evidence/articles',{recursive:true});fs.copyFileSync('.rms-stage3/soybean-oil-news-verified.json',temp+'/.rms-stage3/soybean-oil-news-verified.json');
 for(const s of supplements){const p='.rms-stage3/evidence/articles/article-'+s.provenance!.receiptSha256+'.json';fs.copyFileSync(p,temp+'/'+p);}
 assert.equal(retainedOilPublisherCitations(latestReport,latest.request.evidence,temp,asOf).length,2);
 for(const s of supplements){const p=temp+'/.rms-stage3/evidence/articles/article-'+s.provenance!.receiptSha256+'.json',original=fs.readFileSync(p,'utf8'),doc=JSON.parse(original);if(doc.document)doc.document.text+=' altered';else doc.html+=' altered';fs.writeFileSync(p,JSON.stringify(doc));assert(!retainedOilPublisherCitations(latestReport,latest.request.evidence,temp,asOf).some(c=>c.url===s.url));fs.writeFileSync(p,original);}
 assert.deepEqual(retainedOilPublisherCitations(latestReport,latest.request.evidence,temp,new Date('2027-01-01')),[],'old article cannot certify new current research');

 const unsafe={...latestReport,deskRecommendation:'65~66 US¢/lb 선에서 매수 및 베이시스 약세 구간 계약 체결'};
 assert.throws(()=>acceptPublisherResearchReport(JSON.stringify(unsafe),'soybean-oil',latest.model,latestSources,latest.recordedAt,context),/unsupported/);
 const duplicateSources=[{url:'https://www.zyotwdhon.com/en/news/us-soybean-oil-stocks-hit-12-year-low-i9x0'},{url:supplements.find(s=>/fastmarkets/.test(s.url))!.url}];
 assert(publisherResearchIntegrityIssues(latestReport,duplicateSources,'soybean-oil',RMS_PROCUREMENT_POLICY).includes('at-least-two-independent-direct-publisher-links-required'));
 const plut=[{url:'https://www.hellenicshippingnews.com/brazil-soybean-oil-exports-rise-as-conab-forecasts-record-2026-27-soybean-crop/'},{url:'https://www.spglobal.com/energy/en/news-research/latest-news/agriculture/101526-brazil-soybean-oil-exports-rise-as-conab-forecasts-record-2026-27-soybean-crop'}];
 assert(publisherResearchIntegrityIssues(latestReport,plut,'soybean-oil',RMS_PROCUREMENT_POLICY).includes('at-least-two-independent-direct-publisher-links-required'));
 assert.deepEqual(hashes(),before,'all original paid, promotion, source, rejection and snapshot records unchanged');
 result.latestSixFieldSourceValidation='PASS, offline only';result.originalFieldsUnchanged=true;result.firstResponseStillRejected=true;result.provenance=parsed.citationProvenance;
 result.completePublicationApproval=false;result.remainingReview=['Provisional Yahoo bar status absent from original prose','No executable FX quote; qualification not explicit','Abiove production forecast is CY2026; capacity is raw-seed processing, not oil output or actual throughput','NOPA member stocks do not establish refined-oil shortage'];
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'rms-oil-retained-sources-results-'));fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));fs.writeFileSync('/tmp/rms-oil-retained-sources-results-pointer',out);
 console.log('PASS: actual Soybean production promotion verified; unchanged Wheat/Corn/Soybean; actual Oil six-field source replay with distinct retained/Gemini provenance; first response still rejects; tamper and procurement checks; NO publication approval. '+out);
}finally{globalThis.fetch=native;}
