/** Synthetic OFFLINE-MOCK regressions for the seven reported rejection classes.
 * These are not October 27 provider responses and never reach production stores. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mock} from 'node:test';
import {materializeClaimText} from '../analysisClaimText.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {publisherQuotationIssue,reviewMarketSummary} from '../newsEvidenceQuality.ts';
import {evaluateSavedNewsSummaries} from '../marketIntelligenceService.ts';
import {cornSelectedQuality} from '../cornVerifiedNews.ts';
import {collectPotatoPublisherEvidence} from '../potatoAnalysisEvidence.ts';
import {deriveAnalysisClaimPlan} from '../analysisClaimPlan.ts';
import {validateConditionalReasoning} from '../analysisReasoning.ts';
import {analysisReplacementIssues} from '../analysisPublicationQuality.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {isDirectAiFooterSource} from '../../utils/aiSourcePresentation.ts';
import type {AnalysisEvidence} from '../analysisEvidence.ts';
const now=new Date('2026-10-27T00:05:00Z'),native=fetch;
mock.timers.enable({apis:['Date'],now});
globalThis.fetch=async()=>{throw Error('No network or paid calls permitted');};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-oct27-OFFLINE-MOCK-'));
let cases=0;
try{
 for(const id of ['wheat','soybean-oil','palm-oil']){
  const packet:AnalysisEvidence={commodity:id,failures:[],facts:[0,1].map(i=>({id:i?'price-reference':'psd-28',commodity:id,topic:i?'RBD Olein':'CPO',text:`OFFLINE-MOCK ${id} 검증용 ${i?'가격':'생산'} 자료입니다. 이 문장은 테스트의 원문 레코드 식별자와 보고 범위 및 기준 기간을 보존하는 가상 근거이며 실제 시장 관측치로 게시하거나 사용할 수 없습니다.`,sourceUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',sourceTitle:'OFFLINE-MOCK evidence',observedAt:'2026-10-26',verifiedAt:now.toISOString(),verification:'original-record',recordSha256:hash(id+':'+i),measure:{metric:i?'price':'생산',scope:'world:2026/2027',benchmark:id,unit:i?'USD/MT':'천 MT',value:100+i,valueKind:i?'actual':'forecast'}}))};
  const fact=(i:number)=>({kind:'fact',text:'',evidenceIds:[packet.facts[i].id],support:[]});
  const body:any={outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:55,evidenceClaims:[{field:'deskRecommendation',segments:[fact(0),{kind:'recommendation',text:'생산 전망의 다음 발표를 확인하고 동일 범위의 생산 수치를 비교하십시오.',evidenceIds:['psd-28'],support:[{evidenceId:'psd-28',aspect:'production'}]}]},{field:'executiveSummary',segments:[fact(0),fact(1)]}]};
  const raw=(value:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
  const parsed=parseGroundedAnalysis(raw(body),'OFFLINE-MOCK',now,packet,{requiredContractVersion:4});assert.equal(parsed.status,'live');assert.equal(body.evidenceClaims[0].segments[0].text,'','provider object remains unchanged');
  const request=buildRecoveryAnalysisRequest('gemini-3.8-flash',id,packet,'2026-10-27','verified-only','claims');
  assert.deepEqual((request.config.responseSchema as any).properties.evidenceClaims.items.properties.segments.items.required,['kind','text','evidenceIds','support']);
  assert(request.contents.includes('text=""'));assert(request.contents.includes('Never omit text'));
  const legacy=structuredClone(body);for(const c of legacy.evidenceClaims)for(const s of c.segments)if(s.kind==='fact')delete s.text;
  assert.equal(parseGroundedAnalysis(raw(legacy),'OFFLINE-MOCK',now,packet).status,'live');
  for(const mutate of [
   (b:any)=>delete b.evidenceClaims[0].segments[1].text,
   (b:any)=>b.evidenceClaims[0].segments[1].text=' ',
   (b:any)=>b.evidenceClaims.push(structuredClone(b.evidenceClaims[0])),
   (b:any)=>b.evidenceClaims[0].segments[0].text='psd-28',
   (b:any)=>b.evidenceClaims[0].segments[0].evidenceIds=['invented'],
   (b:any)=>b.evidenceClaims[0].segments[1].support=[],
   (b:any)=>b.evidenceClaims[0].segments[1].text='생산 전망을 고려해 물량의 50%를 매수하십시오.'
  ]){const bad=structuredClone(body);mutate(bad);assert.throws(()=>parseGroundedAnalysis(raw(bad),'OFFLINE-MOCK',now,packet));}
  const repeat=structuredClone(body);repeat.evidenceClaims[1].segments=[fact(0),fact(0)];assert.throws(()=>parseGroundedAnalysis(raw(repeat),'OFFLINE-MOCK',now,packet),/repeated-factual-premise|incomplete-summary-factual-coverage/);
  const duplicateFields=structuredClone(body);duplicateFields.evidenceClaims.push({field:'watchItems.0',segments:[fact(0),fact(1)]});assert.throws(()=>parseGroundedAnalysis(raw(duplicateFields),'OFFLINE-MOCK',now,packet),/repeated-claim-field/);
  const withoutFact=structuredClone(body);withoutFact.evidenceClaims[0].segments.shift();assert.throws(()=>parseGroundedAnalysis(raw(withoutFact),'OFFLINE-MOCK',now,packet),/missing-specific-factual-premise/);
  assert.equal(materializeClaimText(body,packet,now).executiveSummary,packet.facts.map(f=>f.text).join(' '));cases++;
 }
 // Corn: exactly identify count, diversity and freshness failures; never lower thresholds.
 const corn=(host:string,date='2026-10-26')=>({originalUrl:`https://${host}/corn-market`,publishedAt:date,rawSnippet:'OFFLINE-MOCK Corn exports increased.',rawTitle:'Corn export market',sourceName:host,rawId:host,retrievedAt:now.toISOString(),sourceType:'news' as const});
 assert.equal(cornSelectedQuality([corn('a.example'),corn('b.example'),corn('c.example'),corn('d.example')],+now).readyForReview,true);
 assert.deepEqual(cornSelectedQuality([corn('a.example'),corn('b.example'),corn('c.example')],+now).failedRequirements,[]);
 assert(cornSelectedQuality([corn('a.example'),corn('a.example'),corn('a.example'),corn('b.example')],+now).readyForReview);
 assert(cornSelectedQuality([corn('a.example','2026-10-01'),corn('b.example','2026-10-01'),corn('c.example'),corn('d.example')],+now).readyForReview);
 const cornRejected=evaluateSavedNewsSummaries('corn',[corn('a.example')],'[]');assert.deepEqual(cornRejected.rejections.map(r=>r.reason),['missing-or-invalid-korean-summary']);cases++;
 // Soybean Oil: normalize typography only; different values, omitted clauses and paraphrases fail.
 const source='The publisher’s soybean oil report describes the market’s supply and demand conditions in detail.';
 assert.equal(publisherQuotationIssue("The publisher's soybean oil report describes the market's supply and demand conditions in detail.",source),null);
 assert(publisherQuotationIssue('The publisher reports a strong increase in soybean oil demand and supply.',source));
 assert(publisherQuotationIssue('The publisher’s soybean oil report ... supply and demand conditions in detail.',source));
 assert(publisherQuotationIssue('Soybean oil stocks reached 999 million tonnes in this report.',source));
 assert(publisherQuotationIssue('tiny',source));cases++;
 // Potato news: MT is tonnes, Mt/MMT are millions; no value/unit substitution.
 const evidence='European potato starch production reached 100 MT in the verified reporting period. This potato starch market report describes production, export demand and supply conditions for processors. The publication reports only these quantities and no other production or price observation.';
 const title='유럽 감자전분 생산과 공급 동향';
 assert.equal(reviewMarketSummary(title,'유럽 감자전분 생산은 해당 보고 기간에 100 톤으로 집계됐으며, 원문은 가공업체의 수출 수요와 공급 여건을 함께 설명했습니다.',evidence,'potato-starch'),null);
 assert.match(reviewMarketSummary(title,'유럽 감자전분 생산은 해당 보고 기간에 100000000 톤으로 집계됐으며, 원문은 가공업체의 수출 수요와 공급 여건을 설명했습니다.',evidence,'potato-starch')||'',/unsupported-number/);
 assert.match(reviewMarketSummary(title,'유럽 감자전분 생산은 해당 보고 기간에 100 kg으로 집계됐으며, 원문은 가공업체의 수출 수요와 공급 여건을 설명했습니다.',evidence,'potato-starch')||'',/unsupported-number/);
 const euro=evidence.replace('production reached 100 MT','price reached 100 EUR');
 assert.match(reviewMarketSummary(title,'유럽 감자전분 가격은 해당 보고 기간에 100 USD로 집계됐으며, 원문은 가공업체의 수출 수요와 공급 여건을 설명했습니다.',euro,'potato-starch')||'',/unsupported-number/);cases++;
 // Potato AI: actual retained receipt adapter -> claim plan -> supported recommendation.
 fs.mkdirSync(path.join(root,'.rms-stage3/evidence'),{recursive:true});
 for(const name of ['stats','trade','research','kmc']){const file=path.join('.rms-stage3/evidence','potato-'+name+'.json');const receipt=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(path.join(root,file),JSON.stringify(receipt));}
 const potato=collectPotatoPublisherEvidence(root,now);assert.deepEqual(potato.failures,[]);
 const plan=deriveAnalysisClaimPlan(potato,now),trade=potato.facts.find(f=>f.id==='potato-official-trade')!,harvest=potato.facts.find(f=>f.id==='potato-official-harvest')!;
 assert.deepEqual(plan.records.find(f=>f.id===trade.id)?.aspects,['exports']);assert.deepEqual(plan.records.find(f=>f.id===harvest.id)?.aspects,['production-proxy']);
 const advice=(text:string)=>validateConditionalReasoning(text,[trade],{kind:'recommendation',support:[{evidenceId:trade.id,aspect:'exports'}]}).issues;
 assert.deepEqual(advice('완제품 감자전분의 역외 수출 물량을 다음 발표와 비교하고 같은 교역 범위를 점검하십시오.'),[]);
 assert(advice('감자전분 수출 물량을 고려해 생산량의 50%를 즉시 구매하십시오.').length);
 assert(validateConditionalReasoning('감자전분 완제품 생산 전망을 비교하십시오.',[harvest],{kind:'recommendation',support:[{evidenceId:harvest.id,aspect:'production-proxy'}]}).issues.length);cases++;
 // Tapioca replacement: reduced section coverage must not overwrite last good content.
 const report:any={status:'live',executiveSummary:'OFFLINE-MOCK 검증된 타피오카전분 시장 요약입니다. '.repeat(8),deskRecommendation:'검증된 가격 발표를 비교하십시오.',generatedAt:now.toISOString(),sources:[{url:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf'}],bullishFactors:['검증된 공급 요인'],bearishFactors:['검증된 수요 요인'],watchItems:['주간 가격 공표'],evidenceAudit:{factBinding:'verified-records-v1'}};
 publishScheduledContent({'analysis-tapioca-starch':{success:true,data:report}},'OFFLINE-MOCK-good',root);
 const before=fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8');
 const weak={...report,bullishFactors:[],bearishFactors:[],watchItems:[]};assert.deepEqual(analysisReplacementIssues(weak,report),['analysis-section-coverage-regression']);
 assert.deepEqual(publishScheduledContent({'analysis-tapioca-starch':{success:true,data:weak}},'OFFLINE-MOCK-weak',root).accepted,[]);
 assert.equal(fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8'),before);assert.equal(readScheduledContent('analysis-tapioca-starch',root)?.runId,'OFFLINE-MOCK-good');
 const api='https://api.fas.usda.gov/api/psd/commodity/0410000/world/year/2026';assert.equal(isDirectAiFooterSource({url:api,title:'USDA'}),false);assert.equal(isDirectAiFooterSource({url:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',title:'USDA'}),true);
 console.log(`PASS ${cases} reported rejection classes plus repetitive/incomplete canonical report retention, typed potato support, strict quote/number checks and API citation exclusion. OFFLINE-MOCK fixtures; zero network/paid calls.`);
}finally{mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
