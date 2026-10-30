/** Unchanged real Oct 29 provider text. OFFLINE; no approval or provider imports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {compileAnalysisSection,compileAnalysisSections} from '../analysisSections.ts';
import {splitAnalysisStatements} from '../analysisStatementLanguage.ts';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {parseGroundedAnalysis,acceptedBriefEvidenceIssues} from '../groundedAnalysisResponse.ts';
import {materializeClaimText} from '../analysisClaimText.ts';
import {canonicalAnalysisQualityIssues} from '../analysisPublicationQuality.ts';
import {briefPresentationIssues} from '../analysisBriefContract.ts';
const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/oct29PaidSoybean.json',import.meta.url),'utf8'));
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const evidence=structuredClone(archive.analysis.find((r:any)=>r.id==='soybean').evidence);
evidence.facts=evidence.facts.filter((f:any)=>!f.text.includes('원문 검증 요약:'));
const sorted=(x:any):any=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
assert.equal(crypto.createHash('sha256').update(JSON.stringify(sorted(evidence))).digest('hex'),saved.evidenceSha256,'same original verified evidence, no augmentation');
const body=JSON.parse(saved.responseText),now=new Date(saved.recordedAt),native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Offline only: no paid requests or source refresh');};
try{
 const statements=splitAnalysisStatements(body.marketAnalysis.text),facts=statements.slice(0,4),outlook=splitAnalysisStatements(body.priceOutlook.text);
 const originalText=saved.responseText;
 const scoped=(text:string,ids:string[])=>({...body.marketAnalysis,text,evidenceIds:ids});
 const compile=(text:string,ids=body.marketAnalysis.evidenceIds)=>compileAnalysisSection(scoped(text,ids),evidence,now,'conditional');
 for(const text of facts)assert.equal(validateReportedFact(text,evidence.facts).issues.length,0,text);
 for(const [section,value]of Object.entries(body)){
  if(!['marketAnalysis','procurementStrategy','priceOutlook','bullishFactors','bearishFactors','monitoringItems'].includes(section))continue;
  for(const item of Array.isArray(value)?value:[value] as any[])for(const [paragraph,text]of (item as any).text.split(/\n\s*\n/).entries()){
   const kind=['procurementStrategy','monitoringItems'].includes(section)||section==='marketAnalysis'&&paragraph===1?'recommendation':'conditional';
   assert.doesNotThrow(()=>compileAnalysisSection({...item,text},evidence,now,kind));
  }
 }
 assert.doesNotThrow(()=>compileAnalysisSections(body,evidence,now));
 const mapped=materializeClaimText(body,evidence,now);
 const ids=new Set(mapped.evidenceClaims.flatMap((c:any)=>c.segments.flatMap((s:any)=>s.evidenceIds)));
 const used=evidence.facts.filter((f:any)=>ids.has(f.id));
 const sources=[...new Map(used.map((f:any)=>[f.sourceUrl,{url:f.sourceUrl,title:f.sourceTitle}])).values()];
 assert.deepEqual(canonicalAnalysisQualityIssues(mapped,evidence),[]);
 assert.deepEqual(acceptedBriefEvidenceIssues({...mapped,generatedAt:now.toISOString(),sources,evidenceAudit:{reportStyle:body.reportStyle,claims:mapped.evidenceClaims,facts:used}},'soybean'),[],'independent final evidence check does not override presentation rejection');
 const plant=evidence.facts.find((f:any)=>f.measure?.metric==='planting-progress'),offer=evidence.facts.find((f:any)=>f.id.endsWith('export-offer'));
 assert.deepEqual(validateReportedFact(facts[0],evidence.facts).evidenceIds,[plant.id]);
 for(const wrong of [facts[0].replace('52%','53%'),facts[0].replace('43%','44%'),facts[0].replace('5년','6년'),facts[0].replace('2026/27','2027/28'),facts[0].replace('마토그로소','파라나'),facts[0].replace('브라질','미국'),facts[0].replace('북부','남부'),facts[0].replace('건조 우려','확정 수확 손실'),facts[0]+' 따라서 감산과 가격 상승이 확실합니다.'])assert.throws(()=>compile(wrong),wrong);
 for(const change of [{measure:{...plant.measure,unit:'ha'}},{measure:{...plant.measure,scope:'US:2026/27'}},{sourceUrl:'https://www.example.com/unrelated'},{referenceContext:{...plant.referenceContext,receiptSha256:'0'.repeat(64)}},{referenceContext:{...plant.referenceContext,quote:plant.referenceContext.quote.replace('though some northern areas complain about dryness.','')}}]){
  const bad={...evidence,facts:[{...plant,...change}]};assert.throws(()=>compileAnalysisSection(scoped(facts[0],[plant.id]),bad,now,'conditional'));
 }
 for(const wrong of [facts[1].replace('4.56','4.57'),facts[1].replace('billion','million'),facts[1].replace('미국 대두','세계 대두'),facts[1].replace('2026/27','2027/28'),facts[1]+' 따라서 공급 과잉이 확정되었습니다.',facts[2].replace('505.23','505.24'),facts[2].replace('517.38','517.39'),facts[2].replace('10월 15일','10월 16일'),facts[2].replace('11월','12월'),facts[2].replace('USD/MT','MYR/MT'),facts[2].replace('산투스','파라나과'),facts[2]+' 이 오퍼가 한국 도착원가입니다.',facts[3].replace('460.49','460.50'),facts[3].replace('27일','28일'),facts[3].replace('대두','옥수수'),facts[3].replace('USD/MT','USD/kg'),facts[3]+' 따라서 구매량의 50%를 즉시 확보하십시오.'])assert.throws(()=>compile(wrong),wrong);
 assert.throws(()=>compile(facts[0],[offer.id]),'unrelated price ID cannot prove planting/weather');
 assert.throws(()=>compile(facts[1],[plant.id]),'planting ID cannot prove USDA production');
 assert.throws(()=>compile(facts[2],[plant.id]),'planting ID cannot prove export offers');
 assert.throws(()=>compile(facts[3],[offer.id]),'FOB price is not CBOT daily-bar evidence');
 for(const text of outlook)assert.doesNotThrow(()=>compile(text,body.priceOutlook.evidenceIds));
 for(const wrong of [outlook[0].replace('458.65','458.66'),outlook[0].replace('473.35','473.36'),outlook[0].replace('2026-09-28','2026-09-29'),outlook[0].replace('상승했으나','하락했으나'),outlook[0].replace('하락을 기록','상승을 기록'),outlook[0].replace('USD/MT','MYR/MT'),outlook[0]+' 선물 강세가 지속되므로 선제 매수하십시오.',outlook[1].replace('나타내지 않습니다','입증합니다')])assert.throws(()=>compile(wrong,body.priceOutlook.evidenceIds),wrong);
 assert.throws(()=>compile(outlook[0],[body.priceOutlook.evidenceIds[1]]),'both comparison intervals are independently necessary');
 const rawPresentation={deskRecommendation:body.procurementStrategy.text,executiveSummary:body.marketAnalysis.text,bullishFactors:body.bullishFactors.map((x:any)=>x.text),bearishFactors:body.bearishFactors.map((x:any)=>x.text),watchItems:body.monitoringItems.map((x:any)=>x.text)};
 assert.deepEqual(body.marketAnalysis.text.split(/\n\s*\n/).map((s:string)=>Array.from(s).length),[288,54]);
 assert.deepEqual(briefPresentationIssues(rawPresentation),['brief-paragraph-1:300-540-characters','brief-paragraph-2:80-180-characters']);
 assert.throws(()=>parseGroundedAnalysis({candidates:[{finishReason:'STOP',content:{parts:[{text:saved.responseText}]}}]},saved.model,now,evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true}),(error:any)=>error.stage==='schema'&&JSON.stringify(error.issues)===JSON.stringify(briefPresentationIssues(rawPresentation)));
 assert.equal(saved.responseText,originalText,'never pad or repair the paid response to manufacture acceptance');
 console.log('PASS exact Oct29 response: every sentence/section binds independently; full report still rejects both short paragraphs; wrong values, scopes, weather, IDs, causal suffixes and interval directions reject.');
}finally{globalThis.fetch=native;}
