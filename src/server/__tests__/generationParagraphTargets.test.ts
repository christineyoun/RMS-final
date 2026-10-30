/** Offline prompt regression: interior writing targets never relax acceptance. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VERIFIED_SECTION_REPORT_INSTRUCTIONS,buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {BRIEF_LAYOUT,briefPresentationIssues} from '../analysisBriefContract.ts';
const native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('No network or paid generation in prompt tests');};
try{
 const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
 const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/oct29PaidSoybean.json',import.meta.url),'utf8'));
 const evidence=structuredClone(archive.analysis.find((r:any)=>r.id==='soybean').evidence);
 evidence.facts=evidence.facts.filter((f:any)=>!f.text.includes('원문 검증 요약:'));
 const request=buildRecoveryAnalysisRequest('gemini-3.8-flash','soybean',evidence,'2026-10-29','verified-only');
 const prompt=request.contents;
 assert(prompt.includes(VERIFIED_SECTION_REPORT_INSTRUCTIONS),'actual six-section production builder includes revised instructions');
 assert.equal(request.model,'gemini-3.8-flash');assert.equal(request.config.maxOutputTokens,8192);assert.deepEqual(request.config.tools,[]);
 for(const required of [
  'first paragraph at 350–450 Unicode characters',
  'purchasing paragraph at 110–140 Unicode characters',
  'Count each trimmed paragraph separately, including spaces and punctuation',
  'excluding the separating blank line',
  'Before returning JSON, check both counts',
  'revise only with distinct supported content',
  'Add information beyond the short Desk and first paragraph',
  'specific commodity metric/indicative offer and actual quotation or later release to compare',
  'an evidence-supported condition or follow-up',
  'Do not invent a threshold, deadline, allocation, urgency',
  'do not pad it to reach a length target',
  'Prefer distinct, source-supported market drivers',
  'Do not fill both arrays with symmetrical hypothetical production/export scenarios',
  'Never invent an unsupported factor',
  'if a required category lacks evidence, retain the previous validated report',
  'Keep metric, commodity, benchmark, geography, observation period, currency, unit, uncertainty and forecast status',
  'An evidence ID or a supported number does not authorize the rest of a sentence',
 ])assert(prompt.includes(required),required);
 assert.deepEqual(BRIEF_LAYOUT,{recommendationMax:40,factorMax:70,firstParagraph:[300,540],secondParagraph:[80,180]});
 const body=JSON.parse(saved.responseText);
 const presentation=(b:any)=>({deskRecommendation:b.procurementStrategy.text,executiveSummary:b.marketAnalysis.text,bullishFactors:b.bullishFactors.map((x:any)=>x.text),bearishFactors:b.bearishFactors.map((x:any)=>x.text),watchItems:b.monitoringItems.map((x:any)=>x.text)});
 assert.deepEqual(briefPresentationIssues(presentation(body)),['brief-paragraph-1:300-540-characters','brief-paragraph-2:80-180-characters'],'exact paid report still fails its original two short paragraphs');
 const examples=JSON.parse(fs.readFileSync(new URL('./fixtures/completeKoreanBriefs.json',import.meta.url),'utf8')).bodies;
 assert.deepEqual(briefPresentationIssues(presentation(examples.soybean)),[],'valid report outside preferred interior targets remains valid');
 // Pure layout boundary probes; never offered as fact-validated reports.
 const layout=(first:number,second:number)=>({...presentation(examples.soybean),executiveSummary:'가'.repeat(first)+'\n\n'+'나'.repeat(second)});
 for(const [first,second]of [[300,80],[540,180],[350,110],[450,140]])assert.deepEqual(briefPresentationIssues(layout(first,second)),[]);
 for(const [first,second,issue]of [[299,110,'brief-paragraph-1:300-540-characters'],[541,110,'brief-paragraph-1:300-540-characters'],[350,79,'brief-paragraph-2:80-180-characters'],[350,181,'brief-paragraph-2:80-180-characters']] as const)assert(briefPresentationIssues(layout(first,second)).includes(issue));
 console.log('PASS production prompt targets, substantive actions and distinct drivers; unchanged presentation boundaries and rejected paid fixture; no provider call.');
}finally{globalThis.fetch=native;}
