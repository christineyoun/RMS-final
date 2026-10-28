/** OFFLINE. Immutable real paid responses; no provider construction or network. */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {mock} from 'node:test';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {splitAnalysisStatements} from '../analysisStatementLanguage.ts';
import {materializeClaimText} from '../analysisClaimText.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {compileAnalysisSection} from '../analysisSections.ts';
import {canonicalAnalysisQualityIssues} from '../analysisPublicationQuality.ts';
const bytes=fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url)),old=JSON.parse(bytes.toString());
const current=JSON.parse(fs.readFileSync(new URL('./fixtures/oct28PaidAnalysis.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),current.evidenceFixtureSha256);
const now=new Date('2026-10-28T01:00:00Z'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-section-prices-')),native=globalThis.fetch;mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Offline; real network prohibited');};
const envelope=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const parse=(body:any,row:any)=>parseGroundedAnalysis(envelope(body),row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true});
const results:any={archived:[],supportedPriceStatements:[],authoredPublications:[]};
try{
 for(const row of old.analysis){
  const next=current.analysis.find((r:any)=>r.id===row.id),evidence=row.evidence;
  if(['wheat','corn','soybean','soybean-oil','palm-oil','tapioca-starch'].includes(row.id)){
   const statement=splitAnalysisStatements(next.body.marketAnalysis.text)[0],refs=evidence.facts.filter((f:any)=>next.body.marketAnalysis.evidenceIds.includes(f.id));
   assert.deepEqual(validateReportedFact(statement,refs).issues,[],row.id+' real dated price statement');
   for(const suffix of [' 따라서 가격은 계속 하락합니다.',' 매수자 우위가 확실하므로 즉시 구매하십시오.'])assert(validateReportedFact(statement+suffix,refs).issues.length,'a verified price does not authorize a conclusion');
   const number=statement.match(/(?:229\.64|179\.12|460\.49|66\.8|4797|695)/)![0];
   for(const invalid of [statement.replace(number,'999999999'),statement.replace('2026','2025'),statement.replace(/USD\/MT|MYR\/MT|US¢\/lb|달러/,'EUR/kg')])assert(validateReportedFact(invalid,refs).issues.length,invalid);
   results.supportedPriceStatements.push({id:row.id,text:statement,evidenceIds:validateReportedFact(statement,refs).evidenceIds});
  }
  // Replay both bodies unchanged. Successful parses must also pass final
  // publication/read-back; a schema success alone is not report acceptance.
  for(const [date,body]of [['2026-10-27',row.body],['2026-10-28',next.body]] as const){
   const outcome:any={id:row.id,date};try{const data=parse(body,row),dest=path.join(root,date,row.id),key='analysis-'+row.id;const p=publishScheduledContent({[key]:{success:true,data}},'offline-real-replay',dest);outcome.accepted=p.accepted.includes(key)&&!!readScheduledContent(key,dest);}catch(e:any){outcome.accepted=false;outcome.stage=e.stage??'publication';outcome.issues=e.issues??[e.message];}
   outcome.sections={};for(const field of ['marketAnalysis','procurementStrategy'])outcome.sections[field]=splitAnalysisStatements(body[field].text).map((text:string)=>{try{compileAnalysisSection({...body[field],text},evidence,now,field==='marketAnalysis'?'conditional':'recommendation',field==='marketAnalysis');return {text,accepted:true};}catch(e:any){return {text,accepted:false,reason:e.message};}});
   results.archived.push(outcome);
  }
  const production=evidence.facts.find((f:any)=>f.id==='psd-28'),stocks=evidence.facts.find((f:any)=>f.id==='psd-176');let market:any,desk:any;
  if(production){const crop=production.topic;market={evidenceIds:[production.id,stocks.id],text:`2026/27년 세계 ${crop} 생산은 ${production.measure.value} ${production.measure.unit}로 전망됩니다. 2026/27년 세계 ${crop} 기말재고 전망은 ${stocks.measure.value} ${stocks.measure.unit}입니다.`};desk={evidenceIds:[production.id],text:`세계 ${crop} 생산 전망의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오.`};}
  else if(row.id==='potato-starch'){market={evidenceIds:['potato-official-harvest','potato-official-trade'],text:'2025년 독일·프랑스·네덜란드·덴마크 전체 감자(종자용 포함) 생산은 35254.22 천 MT입니다. Eurostat Comext CN11081300 완제품 감자전분: EU27 대 비EU 2025-09~2026-08 연속 12개월 수출은 500.51 천 MT입니다.'};desk={evidenceIds:['potato-official-trade'],text:'EU27 대 비EU 감자전분 수출의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오.'};}
  else{market={evidenceIds:['ttsa-2026-10-06','ttsa-2026-10-20'],text:'TTSA 공식 주간 벤치마크 2026-10-06의 695 USD/MT에서 2026-10-20의 690 USD/MT로 하락했습니다.'};desk={evidenceIds:['ttsa-2026-10-20'],text:'FOB 방콕 타피오카전분 가격과 공급사 오퍼를 비교하십시오.'};}
  const body={outputFormat:'evidence-sections-v1',confidenceScore:70,marketAnalysis:market,procurementStrategy:desk};
  const data=parse(body,row),key='analysis-'+row.id,dest=path.join(root,'authored',row.id);
  assert.equal(data.executiveSummary,market.text,'visible prose excludes all raw evidence prefixes');assert.equal(data.deskRecommendation,desk.text);
  const facts=data.evidenceAudit?.facts,claims=data.evidenceAudit?.claims;
  assert(Array.isArray(facts)&&facts.length>=2,'evidence retained internally');assert(Array.isArray(claims));assert(claims.flatMap((c:any)=>c.segments).some((s:any)=>s.kind==='fact'&&evidence.facts.some((f:any)=>f.text===s.text)),'full original records retained in audit');
  assert.equal(publishScheduledContent({[key]:{success:true,data}},'offline-prose-only',dest).accepted.length,1);assert.equal(readScheduledContent(key,dest)?.payload.data.executiveSummary,market.text);
  assert.throws(()=>parse({...body,marketAnalysis:{...market,text:''}},row),'raw references cannot manufacture a visible core analysis');
  results.authoredPublications.push({id:row.id,accepted:true,visibleProseExact:true,evidencePreserved:true});
 }
 const corn=old.analysis.find((r:any)=>r.id==='corn'),source=current.analysis.find((r:any)=>r.id==='corn'),sentence=splitAnalysisStatements(source.body.marketAnalysis.text)[0];
 const refs=corn.evidence.facts.filter((f:any)=>source.body.marketAnalysis.evidenceIds.includes(f.id));
 for(const unit of ['USD/tonne','USD per tonne','USD per metric ton','USD/metric tonne','USD/t','미달러/톤']){const text=sentence.replace('톤당 179.12달러','179.12 '+unit).replace('톤당 178.53달러','178.53 '+unit);assert.deepEqual(validateReportedFact(text,refs).issues,[],unit);}
 for(const invalid of [sentence.replace('US¢/bu','US¢/lb'),sentence.replace('옥수수','대두'),sentence.replace('ZC=F','ZS=F'),sentence.replace('10월 27일','10월 25일'),sentence.replace('톤당 179.12달러','179.12 USD/Mt'),sentence.replace('톤당 179.12달러','179.12 USD/short ton')])assert(validateReportedFact(invalid,refs).issues.length,invalid);
 const report={outputFormat:'evidence-sections-v1',confidenceScore:70,marketAnalysis:{evidenceIds:source.body.marketAnalysis.evidenceIds,text:sentence},procurementStrategy:{evidenceIds:['corn-zc-2026-10-27'],text:'옥수수 선물가격과 실제 공급사 오퍼를 비교하십시오.'}};
 const priceReport=parse(report,corn),key='analysis-corn',dest=path.join(root,'real-price-publication');assert.equal(publishScheduledContent({[key]:{success:true,data:priceReport}},'offline-dated-price',dest).accepted.length,1);assert.equal(readScheduledContent(key,dest)?.payload.data.executiveSummary,sentence);
 assert(canonicalAnalysisQualityIssues({factBinding:'verified-records-v1',sectionFormat:'evidence-sections-v1',evidenceClaims:[{field:'executiveSummary',segments:[{kind:'fact',text:'raw 1',evidenceIds:['a']},{kind:'fact',text:'raw 2',evidenceIds:['b']},{kind:'reported-fact',text:'원문 인용: raw English dump',evidenceIds:['a']}]}]}).includes('raw-evidence-only-summary'),'model-written source dumps still rejected');
 // Existing legacy typed-claim rendering still expands fact references.
 const legacy=materializeClaimText({outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:70,evidenceClaims:[{field:'executiveSummary',segments:[{kind:'fact',text:'',evidenceIds:['corn-zc-2026-10-27'],support:[]}]},{field:'deskRecommendation',segments:[{kind:'fact',text:'',evidenceIds:['corn-zc-2026-10-26'],support:[]}]}]},corn.evidence,now);assert.equal(legacy.executiveSummary,corn.evidence.facts.find((f:any)=>f.id==='corn-zc-2026-10-27').text);
 if(process.env.RMS_SECTION_PRICE_RESULTS)fs.writeFileSync(process.env.RMS_SECTION_PRICE_RESULTS,JSON.stringify(results,null,2));
 console.log('PASS: six real dated-price statements; equivalent units and strict mutations; all-eight prose-only publication/read-back with internal evidence; unchanged October 27/28 full replay '+JSON.stringify(['2026-10-27','2026-10-28'].map(date=>({date,accepted:results.archived.filter((r:any)=>r.date===date&&r.accepted).length,total:8}))));
}finally{mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
