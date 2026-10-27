/** OFFLINE-MOCK only. No unavailable October 27 cloud response is represented here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mock} from 'node:test';
import {extractNewsQuantities,newsNumbersIssue,newsPercentagesGrounded,reviewMarketSummary} from '../newsEvidenceQuality.ts';
import {newsSourceEvidence,newsSourceBindingIssue} from '../newsSourceFacts.ts';
import {evaluateSavedNewsSummaries} from '../marketIntelligenceService.ts';
import {wheatSummaryRisk} from '../wheatNewsQuality.ts';
import {assessNewsSummary} from '../../utils/newsSummaryQuality.ts';
import {canonicalAnalysisQualityIssues,analysisReplacementIssues} from '../analysisPublicationQuality.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {isDirectAiFooterSource} from '../../utils/aiSourcePresentation.ts';
const now=new Date('2026-10-27T00:05:00Z'),native=fetch,root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-source-first-OFFLINE-MOCK-'));
mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Network and Gemini prohibited');};
const commodities=[['wheat','wheat','소맥'],['corn','corn','옥수수'],['soybean','soybean','대두'],['soybean-oil','soybean oil','대두유'],['palm-oil','palm oil','팜유'],['sugar','sugar','설탕'],['potato-starch','potato starch','감자전분'],['tapioca-starch','tapioca starch','타피오카전분']];
try{
 assert.equal(newsNumbersIssue('옥수수 수출은 2,320만 톤이며 5% 증가했습니다.','Corn exports reached 23.2 million tonnes, up 5.0 percent.'),null);
 assert.equal(newsNumbersIssue('대두 수출은 1,076만 톤이며 22.1% 증가했습니다.','Soybean exports reached 10.76 million tonnes, up 22.10 percent.'),null);
 assert.equal(newsNumbersIssue('대두 수출은 100만 톤입니다.','Soybean exports reached 1 million tonnes.'),null);
 assert.equal(newsNumbersIssue('옥수수 생산은 4억 730만 톤입니다.','Corn production reached 407.3 million tonnes.'),null);
 assert.equal(newsNumbersIssue('생산은 24억 2,700만 톤입니다.','Production reached 2.427 billion tonnes.'),null);
 assert(newsNumbersIssue('대두 수출은 100만 톤입니다.','Soybean exports reached 1.2 million tonnes.'));
 assert(newsNumbersIssue('옥수수 수출은 2,320만 부셸입니다.','Corn exports reached 23.2 million tonnes.'));
 assert(newsNumbersIssue('옥수수 수출은 5 톤입니다.','Corn exports rose five tonnes.'));
 assert.deepEqual(extractNewsQuantities('Corn exports reached 23.2 million tonnes, up 5.0 percent.').map(q=>[q.n,q.unit]),[[23200000,'tonne'],[5,'percent']]);
 assert.equal(extractNewsQuantities('2026-10-27 and 2026/27').length,0);
 assert.equal(newsNumbersIssue('가격은 톤당 100 달러입니다.','The price was 100 USD/MT.',{strictUnits:true}),null);
 assert(newsNumbersIssue('가격은 100 USD/kg입니다.','The price was 100 USD/MT.',{strictUnits:true}));
 assert(newsNumbersIssue('가격은 100 센트/파운드입니다.','The price was 100 cents/bushel.',{strictUnits:true}));
 assert.equal(wheatSummaryRisk('밀 가격지수는 5% 하락했습니다.','The wheat price index fell 5.0 percent.'),null);
 assert.equal(wheatSummaryRisk('밀 가격지수는 5.1% 하락했습니다.','The wheat price index fell 5.0 percent.'),'unsupported-summary-percentage');
 assert(newsPercentagesGrounded('22.1%','22.10 per cent'));assert(!newsPercentagesGrounded('22.1%','22.0 percent'));assert(!newsPercentagesGrounded('5%','0.05 ratio'));
 assert.equal(assessNewsSummary('밀 시장의 수급 및 선물 가격과 관련된 사항을 검토하기 위해 여러 분야의 전문 자료와 시장 배경을 함께 설명하고 있습니다.','밀 시장 배경과 자료 검토','wheat').reason,'no-specific-market-development');
 assert.equal(assessNewsSummary('밀 시장 보고서는 일반적인 곡물 시장에 대한 여러 정보를 다루고 있으며 자세한 내용은 원문을 참조할 수 있습니다.','밀 보고서 안내','wheat').pass,false);
 for(const [id,en,ko] of commodities){
  const paragraph=`OFFLINE-MOCK verified ${en} export report: ${en} exports reached 23.2 million tonnes, up 5.0 percent in the reporting period. The ${en} export market report describes shipment demand and supply conditions for this same commodity, geography and period. It provides no buyer-specific allocation, price forecast, other crop estimate or currency conversion.`;
  const other=`The ${en} price was 700 USD in a separate verified paragraph; this value must not be licensed by citing only the export paragraph.`;
  const input={rawId:'OFFLINE-MOCK-'+id,rawTitle:en+' export update',rawSnippet:paragraph+'\n'+other,originalUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',publishedAt:'2026-10-26',retrievedAt:now.toISOString(),sourceName:'OFFLINE-MOCK publisher',sourceType:'official' as const};
  const packet=newsSourceEvidence(input);assert.equal(packet.length,2);assert.equal(input.rawSnippet.slice(packet[0].start,packet[0].end),paragraph);
  assert.equal(packet[0].quantities.find(q=>q.unit==='tonne')?.koreanEquivalent,'2,320만 톤');assert.deepEqual(packet,newsSourceEvidence(input));
  const summary=`${ko} 수출 물량은 해당 보고 기간에 2,320만 톤으로 집계돼 5% 증가했습니다. 원문은 같은 품목과 보고 범위에서 선적 수요 및 공급 여건을 설명하며, 구매자는 이 교역 지표의 후속 발표를 비교할 수 있습니다.`;
  assert.equal(reviewMarketSummary(`${ko} 수출 물량 증가와 선적 동향`,summary,input.rawSnippet,id),null);
  const item={rawId:input.rawId,evidenceIds:[packet[0].evidenceId],title:`${ko} 수출 물량 증가와 선적 동향`,summary,evidenceQuote:paragraph};
  const evaluate=(value:any)=>evaluateSavedNewsSummaries(id,[input],JSON.stringify([value]),true,{requireEvidenceIds:true});
  assert.equal(evaluate(item).articles.length,1,id+' accepted');
  for(const bad of [{...item,evidenceIds:[]},{...item,evidenceIds:['invented']},{...item,evidenceIds:[packet[0].evidenceId,packet[0].evidenceId]},{...item,summary:summary.replace('2,320만 톤','2,321만 부셸')},{...item,summary:summary.replace('2,320만 톤','2,321만 톤')},{...item,summary:summary+' 가격은 700 USD입니다.'},{...item,title:item.title+' 999만 톤'},{...item,evidenceQuote:'The publisher says a different event occurred with an invented quotation.'}])assert.equal(evaluate(bad).articles.length,0,id+' rejected unsupported binding/quantity');
  // Source-owned units must be explicit in the cited passage for new summaries.
  assert(newsSourceBindingIssue(input,[packet[0].evidenceId],`${ko} 가격은 5 USD입니다.`));
  assert.equal(isDirectAiFooterSource({url:input.originalUrl,title:'OFFLINE-MOCK publisher'}),true);
  // Full claim parser acceptance/rejection for each commodity, with explicitly synthetic canonical evidence.
  const facts=[0,1].map(i=>({id:i?'stocks':'production',commodity:id,topic:ko,text:`OFFLINE-MOCK ${ko} 검증용 ${i?'기말재고':'생산'} 전망입니다. 이 자료는 동일한 세계 보고 범위와 기준 기간을 보존하는 회귀 테스트의 가상 근거이며 실제 가격이나 생산량으로 게시할 수 없습니다.`,sourceUrl:input.originalUrl,sourceTitle:'OFFLINE-MOCK canonical packet',observedAt:'2026-10-26',verifiedAt:now.toISOString(),verification:'original-record' as const,recordSha256:'a'.repeat(64),measure:{metric:i?'기말재고':'생산',scope:'world:2026/2027',benchmark:'OFFLINE-MOCK-'+id,unit:'천 MT',value:100+i,valueKind:'forecast' as const}}));
  const boundFact=(i:number)=>({kind:'fact',text:'',evidenceIds:[facts[i].id],support:[]});
  const action=(text:string,kind='recommendation')=>({kind,text,evidenceIds:['production'],support:[{evidenceId:'production',aspect:'production'}]});
  const ai:any={outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:55,evidenceClaims:[{field:'executiveSummary',segments:[boundFact(0),boundFact(1)]},{field:'deskRecommendation',segments:[boundFact(0),action(`세계 ${ko} 생산 전망의 다음 발표를 확인하고 같은 범위의 수치를 비교하십시오.`)]},{field:'bullishFactors.0',segments:[boundFact(0),action(`향후 세계 ${ko} 생산 전망이 하향 수정된다면 선물시장 상승 압력이 나타날 수 있습니다.`,'conditional')]},{field:'watchItems.0',segments:[boundFact(0),action(`세계 ${ko} 생산 전망의 수정 여부를 추적하십시오.`)]}]};
  const rawAi=(value:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
  const parseAi=(value:any)=>parseGroundedAnalysis(rawAi(value),'OFFLINE-MOCK',now,{commodity:id,facts,failures:[]},{requiredContractVersion:4,requiredFactBinding:true});
  assert.equal(parseAi(ai).status,'live',id+' full analysis accepted');
  const unsupportedAi=structuredClone(ai);unsupportedAi.evidenceClaims[1].segments[1].text=`세계 ${ko} 생산 전망을 고려해 물량의 50%를 즉시 구매하십시오.`;assert.throws(()=>parseAi(unsupportedAi),/unsupported/);
  const dumpedAi=structuredClone(ai);dumpedAi.evidenceClaims[2].segments.pop();assert.throws(()=>parseAi(dumpedAi),/missing-supported-market-driver/);
  // All eight last-good assessments survive a weaker update, even when every section remains nonempty.
  const data:any={status:'live',executiveSummary:`OFFLINE-MOCK ${ko} 시장의 검증된 수급 및 구매 검토 조건을 설명하는 한국어 요약입니다. `.repeat(6),deskRecommendation:'같은 범위의 공표 수치를 비교하십시오.',generatedAt:now.toISOString(),sources:[{url:input.originalUrl}],bullishFactors:['검증된 공급 요인','별도의 수요 요인'],bearishFactors:['검증된 하방 요인'],watchItems:['후속 발표 관찰','동일 범위 지표 비교'],evidenceAudit:{factBinding:'verified-records-v1'}};
  publishScheduledContent({['analysis-'+id]:{success:true,data}},'OFFLINE-MOCK-good',root);
  const before=fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8'),weak={...data,bullishFactors:data.bullishFactors.slice(0,1),watchItems:data.watchItems.slice(0,1)};
  assert.deepEqual(analysisReplacementIssues(weak,data),['analysis-item-coverage-regression']);
  assert.deepEqual(publishScheduledContent({['analysis-'+id]:{success:true,data:weak}},'OFFLINE-MOCK-weak',root).accepted,[]);
  assert.equal(fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8'),before);assert.equal(readScheduledContent('analysis-'+id,root)?.runId,'OFFLINE-MOCK-good');
 }
 // Saved validated October 26 assessments are read-only fixtures. Replays are isolated below /tmp.
 const savedBundleFile='.rms-research/news-offline-repair-2026-10-26/prepared/public.json',savedBytes=fs.readFileSync(savedBundleFile);
 const savedBundle=JSON.parse(savedBytes.toString());
 for(const [id] of commodities){
  const prior=structuredClone(savedBundle.responses['/api/ai-analysis/'+id].payload.data);prior.status='live';
  const savedRoot=path.join(root,'saved-'+id),key='analysis-'+id;
  publishScheduledContent({[key]:{success:true,testOnly:true,data:prior}},'OFFLINE-MOCK-saved-fixture',savedRoot);
  const file=path.join(savedRoot,'.rms-stage3/scheduled-content-current.json'),before=fs.readFileSync(file);
  const weaker={...prior,bullishFactors:[],bearishFactors:[],watchItems:[],evidenceAudit:{factBinding:'verified-records-v1'}};
  assert.deepEqual(publishScheduledContent({[key]:{success:true,testOnly:true,data:weaker}},'OFFLINE-MOCK-not-a-promotion',savedRoot).accepted,[]);
  assert.deepEqual(fs.readFileSync(file),before,id+' actual saved assessment retained');
 }
 assert.deepEqual(fs.readFileSync(savedBundleFile),savedBytes,'saved public fixture unchanged');
 const fact=(id:string,text:string)=>({kind:'fact',text,evidenceIds:[id],support:[]});
 const base:any={factBinding:'verified-records-v1',evidenceClaims:[{field:'executiveSummary',segments:[fact('a','검증된 생산 전망의 완전한 한국어 사실입니다.'),fact('b','검증된 소비 전망의 완전한 한국어 사실입니다.')]},{field:'bullishFactors.0',segments:[fact('a','검증된 생산 전망의 완전한 한국어 사실입니다.')]},{field:'watchItems.0',segments:[fact('b','검증된 소비 전망의 완전한 한국어 사실입니다.')]}]};
 assert(canonicalAnalysisQualityIssues(base).some(i=>i.startsWith('missing-supported-market-driver:')));
 assert(canonicalAnalysisQualityIssues(base).some(i=>i.startsWith('missing-supported-monitoring-action:')));
 const supported=structuredClone(base);supported.evidenceClaims[1].segments.push({kind:'conditional',text:'검증된 범위의 생산 전망이 하향 수정된다면 선물시장 상승 압력이 나타날 수 있습니다.',evidenceIds:['a'],support:[{evidenceId:'a',aspect:'production'}]});supported.evidenceClaims[2].segments.push({kind:'recommendation',text:'같은 소비 전망의 다음 발표를 비교하십시오.',evidenceIds:['b'],support:[{evidenceId:'b',aspect:'consumption'}]});assert.deepEqual(canonicalAnalysisQualityIssues(supported),[]);
 const dump=structuredClone(supported);dump.evidenceClaims[0].segments=[fact('a','원문 인용: “source quotation A”'),fact('b','원문 인용: “source quotation B”')];assert(canonicalAnalysisQualityIssues(dump).includes('raw-evidence-only-summary'));
 const legacy:any={confidenceScore:50,executiveSummary:'검증된 근거를 사용하는 한국어 시장 요약입니다. '.repeat(10),deskRecommendation:'후속 자료를 비교하십시오.',bullishFactors:[],bearishFactors:[],watchItems:[],evidenceContractVersion:4};
 assert.throws(()=>parseGroundedAnalysis({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(legacy)}]}}]},'OFFLINE-MOCK',now,undefined,{requiredFactBinding:true}),/required-verified-fact-binding/);
 assert.equal(isDirectAiFooterSource({url:'https://api.fas.usda.gov/api/psd/commodity/0410000/world/year/2026',title:'USDA'}),false);
 console.log('PASS OFFLINE-MOCK all eight: source passage IDs/offsets, deterministic Korean equivalents, exact decimal percentages, accepted/rejected summaries, uncited quantity and unit rejection, market-driver/monitoring quality, required fact binding, item-level last-good retention and citation policy. No network/Gemini/cloud calls.');
}finally{mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
