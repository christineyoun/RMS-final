import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,chooseStep4Snapshot,markPossibleOverlaps,buildStep5Prompt,getKstDate} from './step5-plan.ts';
import type {Step4Snapshot} from './step5-plan.ts';

const input:Step4Snapshot={analysis:{
  researchGaps:[{topic:'South America',reason:'missing planting',question:'브라질 파종 진행률은?'},{topic:'Trade',reason:'unknown',question:'미중 대두 관세율은?'}],
  findings:[{status:'confirmed',statement:'USDA price 12',sourceIds:['G001']},{status:'needs-clarification',statement:'IGC figure unclear'}],
  originalInventory:[{id:'G001',grade:'A',googleCitationUrl:'https://a.com/1',evidence:[{id:'G001-E1'}]},{id:'G002',grade:'B',googleCitationUrl:'https://b.com/2',evidence:[]},{id:'G003',grade:'EXCLUDED',googleCitationUrl:'https://c.com/3'}],
  candidateAssessments:[{id:'G001-E1'}],
}};

test('uses Gemini-produced gaps, never inserts commodity-specific manual questions',()=>{
  const p=makePlan(input);
  assert.equal(p.commodity,'soybean');
  assert.equal(p.gapLeads.length,2);
  assert.ok(p.gapLeads.some(g=>g.includes('브라질 파종 진행률')));
  assert.ok(!p.gapLeads.some(g=>g.includes('CBOT')||g.includes('중국의 실제 대두 수입')));
  assert.equal(p.previousCounts.A,1);assert.equal(p.previousCounts.B,1);assert.equal(p.previousCounts.EXCLUDED,1);
});
test('works for another commodity with exactly the same English instructions',()=>{
  const p=makePlan({...input,commodity:'potato starch'});
  const s=buildStep5Prompt(p,'2026-10-30');
  assert.match(s,/Commodity: potato starch/);
  assert.doesNotMatch(s,/soybean|CBOT|El Ni[ñn]o|China import demand|Brazil\/Argentina/i);
  assert.match(s,/Independently identify/);
  assert.match(s,/own focused searches/);
  assert.match(s,/AI-generated leads, not required questions/);
});
test('prompts remain concise English instructions; Korean is retained as quoted source data',()=>{
  const p=makePlan(input),s=buildStep5Prompt(p,'2026-10-30');
  assert.match(s,/Google Search/);
  assert.match(s,/Do not invent/);
  assert.match(s,/Preserve A- and B-grade/);
  assert.match(s,/concise Korean findings/);
  assert.match(s,/final forecast/);
  assert.ok(s.includes('브라질 파종 진행률은?'));
  assert.ok(!s.includes('https://example.com'));
  assert.ok(s.length<3500);
});
test('no gaps does not cause pre-programmed questions to appear',()=>{
  const p=makePlan({...input,analysis:{...input.analysis,researchGaps:[]}});
  assert.deepEqual(p.gapLeads,[]);
  assert.match(buildStep5Prompt(p,'2026-10-30'),/Independently identify/);
});
test('prefers recovered STEP4 snapshot over a newer invalid run',()=>{
  assert.equal(chooseStep4Snapshot(['step4-analysis-2026-10-30T12-00.json','step4-recovered-2026-10-30T08-37.json']), 'step4-recovered-2026-10-30T08-37.json');
});
test('rejects missing source inventory before any paid call',()=>{
  assert.throws(()=>makePlan({analysis:{...input.analysis,originalInventory:[]}}),/no source inventory/);
});
test('newly found citations are marked, not deleted, if duplicated',()=>{
  const marked=markPossibleOverlaps([{index:0,title:'Same',uri:'https://a.com/1'},{index:1,title:'Different',uri:'https://x.com/4'}],input.analysis.originalInventory);
  assert.equal(marked.length,2);assert.equal(marked[0].exactUrlSeenEarlier,true);assert.equal(marked[1].exactUrlSeenEarlier,false);
});
test('Korean source information does not affect fixed date formatting',()=>{
  assert.equal(getKstDate(new Date('2026-10-30T08:40:00Z')),'2026-10-30');
});
