import assert from 'node:assert/strict';import fs from 'node:fs';
import {publisherTablePropositions} from '../publisherTablePropositions.ts';
import {sourcePropositionSupport} from '../analysisSourcePropositions.ts';
import {compileAnalysisSection} from '../analysisSections.ts';
import {composeEvidenceFirstReport} from '../evidenceFirstReport.ts';
const fact=JSON.parse(fs.readFileSync(new URL('./fixtures/unseenCornPublisherOct28.json',import.meta.url),'utf8'));
const evidence={commodity:'corn',facts:[fact],failures:[]},now=new Date('2026-10-29T04:40:00Z');
const rows=publisherTablePropositions(fact);assert.equal(rows.length,5);assert(rows.every(p=>p.role==='fact'));
for(const p of rows){
 assert(sourcePropositionSupport(p.text,[fact]));
 assert(compileAnalysisSection({text:p.text,evidenceIds:[fact.id]},evidence as any,now,'conditional').length>0,'full compiler must bind table facts');
 assert.equal(sourcePropositionSupport(p.text.replace('EUR/kg','USD/MT'),[fact]),null);
 assert.equal(sourcePropositionSupport(p.text.replace(/0\.(27|134|142|28)/,'9.99'),[fact]),null);
 assert.equal(sourcePropositionSupport(p.text+' 따라서 대량 구매가 유리합니다.',[fact]),null);
}
assert(!rows.some(r=>r.text.includes('1.33')||r.text.includes('전분')),'corn starch must not be treated as grain corn');
assert.equal(publisherTablePropositions({...fact,commodity:'soybean'}).length,0);
assert.equal(publisherTablePropositions({...fact,recordSha256:'bad'}).length,0);
assert.equal(publisherTablePropositions({...fact,referenceContext:{...fact.referenceContext,quote:fact.referenceContext.quote.replace('Latest price (EUR/kg)','Latest price (USD/bushel)')}}).filter(r=>r.text.includes('원문 가격표')).length,0);
const future=structuredClone(fact);future.referenceContext.quote=future.referenceContext.quote.replaceAll('2026‑10‑23','2027‑10‑23').replaceAll('2026‑10‑26','2027‑10‑26');assert.equal(publisherTablePropositions(future).filter(r=>r.text.includes('원문 가격표')).length,0);
const prose=structuredClone(fact);prose.referenceContext.quote='French yellow corn FOB Paris is steady at 0.28 EUR/kg.';
assert.equal(publisherTablePropositions(prose).length,1);
for(const text of ['French yellow corn FOB Paris is not steady at 0.28 EUR/kg.','French yellow corn FOB Paris is steady at 0.28 EUR/kg if demand recovers.','French yellow corn FOB Paris is steady at 0.28 EUR/kg, so buyers should stock up.']){prose.referenceContext.quote=text;assert.equal(publisherTablePropositions(prose).length,0);}
const complete=composeEvidenceFirstReport(evidence as any,now);assert.equal(complete.status,'retain-previous');if(complete.status==='retain-previous')assert(complete.issues.includes('missing-real-bullish-driver'));
console.log('PASS actual newly verified publisher price rows: full compiler, exact dates/grades/terms/currency/units; wrong values, corn-starch conflation and unsupported complete report rejected');
