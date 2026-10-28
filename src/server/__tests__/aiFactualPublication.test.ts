/** Real archived evidence; authored positive cases are separate from unchanged
 * provider responses. No transport, key or production state is used. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {mock} from 'node:test';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {splitAnalysisStatements} from '../analysisStatementLanguage.ts';
import {compileAnalysisSection} from '../analysisSections.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const now=new Date(fixture.now),native=globalThis.fetch;mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Offline AI regression: network prohibited');};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-ai-full-publication-'));
const response=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const audit:any={fullPublications:[],unchangedPaidResponses:[]};
const ko:Record<string,string>={wheat:'소맥',corn:'옥수수',soybean:'대두','soybean-oil':'대두유','palm-oil':'팜유',sugar:'설탕'};
try{
 for(const row of fixture.analysis){
  const facts=row.evidence.facts;let market:any,desk:any,watch:any;
  if(ko[row.id]){
   const a=facts.find((f:any)=>f.id==='psd-28'),b=facts.find((f:any)=>f.id==='psd-176'),crop=a.topic;
   market={evidenceIds:[a.id,b.id],text:`USDA PSD에 따르면 2026/27년 세계 ${crop} 생산은 ${a.measure.value} ${a.measure.unit}로 전망됩니다. 2026/27년 세계 ${crop} 기말재고 전망은 ${b.measure.value} ${b.measure.unit}입니다.`};
   desk={evidenceIds:[a.id],text:`세계 ${crop} 생산 전망의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오.`};
   watch={evidenceIds:[b.id],text:`세계 ${crop} 기말재고 전망의 후속 공표치를 모니터링하십시오.`};
  }else if(row.id==='tapioca-starch'){
   market={evidenceIds:['ttsa-2026-10-06','ttsa-2026-10-20'],text:'TTSA 공식 주간 벤치마크 2026-10-06의 695 USD/MT에서 2026-10-20의 690 USD/MT로 하락했습니다.'};
   desk={evidenceIds:['ttsa-2026-10-20'],text:'FOB 방콕 타피오카전분 가격과 공급사 오퍼를 비교하십시오.'};
   watch={evidenceIds:['ttsa-2026-10-20'],text:'타피오카전분 가격의 다음 공표치를 모니터링하십시오.'};
  }else{
   market={evidenceIds:['potato-official-harvest','potato-official-trade'],text:'2025년 독일·프랑스·네덜란드·덴마크 전체 감자(종자용 포함) 생산은 35254.22 천 MT입니다. Eurostat Comext CN11081300 완제품 감자전분: EU27 대 비EU 2025-09~2026-08 연속 12개월 수출은 500.51 천 MT입니다.'};
   desk={evidenceIds:['potato-official-trade'],text:'EU27 대 비EU 감자전분 수출의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오.'};
   watch={evidenceIds:['potato-official-trade'],text:'감자전분 수출의 후속 공표치를 모니터링하십시오.'};
  }
  const body={outputFormat:'evidence-sections-v1',confidenceScore:70,marketAnalysis:market,procurementStrategy:desk,monitoringItems:[watch]};
  const parse=(v:any)=>parseGroundedAnalysis(response(v),row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true});
  if(row.id==='palm-oil'){
   const translated='화물 조사기관 집계에 따르면 말레이시아의 10월 상반기 팜유 수출은 이전 기간 대비 43.2%~58.3% 증가한 것으로 집계됐습니다.';
   const positive={...body,marketAnalysis:{evidenceIds:['article-c28b5041c4320fa1','psd-28'],text:translated+' '+splitAnalysisStatements(market.text)[0]}};
   const rendered=parse(positive),place=path.join(root,'translation');
   assert.equal(publishScheduledContent({'analysis-palm-oil':{success:true,data:rendered}},'offline-translated',place).accepted.length,1);
   assert(readScheduledContent('analysis-palm-oil',place),'translation passes final publication');
  }
  const data=parse(body),target=path.join(root,row.id),key='analysis-'+row.id;
  assert.equal(publishScheduledContent({[key]:{success:true,data}},'offline-supported',target).accepted.length,1,row.id+' FULL publication');
  assert.equal(readScheduledContent(key,target)?.payload.data.executiveSummary,data.executiveSummary,'validated read-back');
  const refreshed=parse({...body,confidenceScore:71});assert.equal(publishScheduledContent({[key]:{success:true,data:refreshed}},'offline-equal-quality',target).accepted.length,1);
  const file=path.join(target,'.rms-stage3/scheduled-content-current.json'),before=fs.readFileSync(file);
  const weaker=parse({...body,monitoringItems:[]});assert.deepEqual(publishScheduledContent({[key]:{success:true,data:weaker}},'offline-weaker',target).accepted,[]);assert.deepEqual(fs.readFileSync(file),before);
  assert.throws(()=>parse({...body,marketAnalysis:{...market,text:market.text+' 가격은 반드시 상승합니다.'}}),'valid assertions cannot hide unsupported conclusions');
  assert.throws(()=>parse({...body,procurementStrategy:{...desk,text:'재고가 부족하므로 전체 소요 물량의 50%를 즉시 구매하십시오.'}}));
  audit.fullPublications.push({id:row.id,body,status:'published-and-read-back',lastGoodProtected:true});
  const sections:any={};for(const field of ['marketAnalysis','procurementStrategy']){
   const item=row.body[field],refs=facts.filter((f:any)=>item.evidenceIds.includes(f.id));
   sections[field]=splitAnalysisStatements(item.text).map(text=>{
    const fact=validateReportedFact(text,refs);let compiled:any;
    try{compiled={accepted:true,kinds:compileAnalysisSection({...item,text},row.evidence,now,field==='marketAnalysis'?'conditional':'recommendation',field==='marketAnalysis').map((p:any)=>p.kind)};}catch(e){compiled={accepted:false,reason:(e as Error).message};}
    return {text,factual:fact,compiler:compiled};
   });
  }
  let full:any;try{parseGroundedAnalysis(response(row.body),row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true});full={accepted:true};}catch(e:any){full={accepted:false,stage:e.stage,issues:e.issues};}
  audit.unchangedPaidResponses.push({id:row.id,sections,full});
 }
 const palm=fixture.analysis.find((r:any)=>r.id==='palm-oil'),tapioca=fixture.analysis.find((r:any)=>r.id==='tapioca-starch');
 const translation='화물 조사기관 집계에 따르면 말레이시아의 10월 상반기 팜유 수출은 이전 기간 대비 43.2%~58.3% 증가한 것으로 집계됐습니다.';
 assert.deepEqual(validateReportedFact(translation,palm.evidence.facts).issues,[],'source-derived English/Korean translation');
 for(const bad of [translation.replace('이전 기간','이전 분기'),translation.replace('말레이시아','브라질'),translation.replace('상반기','하반기'),translation.replace('43.2','44.2'),translation+' 따라서 CPO 가격이 상승했습니다.'])assert(validateReportedFact(bad,palm.evidence.facts).issues.length,bad);
 const originalPalm=splitAnalysisStatements(palm.body.marketAnalysis.text)[0];
 assert.deepEqual(validateReportedFact(originalPalm,palm.evidence.facts).issues,[],'unchanged supported multi-benchmark statement');
 for(const bad of [originalPalm.replace('3.85','3.86'),originalPalm.replace('동일 기간','전월'),originalPalm.replace('1167.5','1267.5'),originalPalm+' 따라서 정제 마진이 개선되었습니다.'])assert(validateReportedFact(bad,palm.evidence.facts).issues.length,bad);
 assert.equal(splitAnalysisStatements('U.S. Wheat Associates 가격입니다. 2026년 관측입니다.').length,2,'abbreviation is not a sentence boundary');
 const comparison='TTSA 공식 주간 벤치마크 2026-10-06의 695 USD/MT에서 2026-10-20의 690 USD/MT로 하락했습니다.';
 for(const bad of [comparison.replace('690','680'),comparison.replace('하락','상승'),comparison.replace('10-20','10-21'),comparison.replaceAll('USD/MT','USD/kg')])assert(validateReportedFact(bad,tapioca.evidence.facts).issues.length,bad);
 assert(validateReportedFact(comparison,tapioca.evidence.facts.map((f:any)=>({...f,measure:{...f.measure,valueKind:'forecast'}}))).issues.length,'forecast not observed close');
 const wheat=fixture.analysis.find((r:any)=>r.id==='wheat'),fact=wheat.evidence.facts.find((f:any)=>f.id==='psd-28');
 const multi='2026/27년 세계 소맥 생산은 822390 천 MT로 전망됩니다. 2026/27년 세계 소맥 기말재고 전망은 276038 천 MT입니다.';
 assert.deepEqual(validateReportedFact(multi,wheat.evidence.facts).issues,[],'independent numeric-leading facts bind separately');
 for(const bad of [multi.replace('276038','276039'),multi.replace('세계','브라질'),multi.replace('2026/27','2025/26'),multi.replace('생산은','소비는')])assert(validateReportedFact(bad,wheat.evidence.facts).issues.length,bad);
 assert(validateReportedFact('2026/27년 세계 소맥 생산은 822390 천 MT로 전망되므로 가격은 반드시 하락합니다.',[fact]).issues.length,'causal connective is not removed');
 if(process.env.RMS_AI_REPLAY_RESULTS)fs.writeFileSync(process.env.RMS_AI_REPLAY_RESULTS,JSON.stringify(audit,null,2));
 console.log('PASS AI-only: 8 realistic reports on real evidence pass parse, source validation, quality, final publication/read-back and last-good guards; original paid responses replayed unchanged. Zero network calls.');
 console.log(JSON.stringify(audit.unchangedPaidResponses.map((r:any)=>({id:r.id,full:r.full.accepted,recognizedFacts:Object.values(r.sections).flat().filter((s:any)=>!s.factual.issues.length).length}))));
}finally{mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
