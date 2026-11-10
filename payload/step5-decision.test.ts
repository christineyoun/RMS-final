import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildDecisionInput,buildDecisionPrompt,parseDecisionResponse,
  auditDecisionReferences,renderDecisionReport,getKstDate} from './step5-decision-core.ts';

function fake(){
  const step4={commodity:'soybean',analysis:{originalInventory:[
    {id:'G001',grade:'A',googleTitle:'USDA',evidence:[{id:'G001-E1',exactExcerpt:'2026/27 soybean ending stocks 315 million bushels',theme:'supply'}]},
    {id:'G002',grade:'B',googleTitle:'ICIS',googleCitationUrl:'https://citation.test/b',evidence:[]},
  ],candidateAssessments:[{id:'G001-E1',status:'confirmed',original:{id:'G001-E1',exactExcerpt:'2026/27 soybean ending stocks 315 million bushels',theme:'supply'}}],
  findings:[{statement:'기말재고 315 million bushels',status:'confirmed',sourceIds:['G001'],evidenceIds:['G001-E1'],impact:'가격 압력 가능성'}],
  researchGaps:[{topic:'수입 수요',question:'실제 수입량은?',reason:'최근 자료 부족'}]}};
  const graded={priorInventory:structuredClone(step4.analysis.originalInventory),commodity:'soybean',stage:'additional-google-original-verification-round1',round:1,
    records:[{publisherUrl:'https://test.example/a'},{publisherUrl:null}],
    review:[{id:'G100',grade:'A',googleTitle:'new study',publisherUrl:'https://test.example/a',publishedAt:'2026-10-28',
      evidence:[{id:'G100-E1',theme:'weather',exactExcerpt:'Weather conditions affect yield',charStart:0}]},
      {id:'G101',grade:'B',googleTitle:'paywalled news',googleCitationUrl:'https://citation.test/c',evidence:[]}],
    duplicateAssessments:[{id:'G100',overlap:'new-publisher-document'}]};
  return {step4,graded};
}

test('decision loads all A excerpts and preserves B inventory without inventing facts',()=>{
  const {step4,graded}=fake();const before=JSON.stringify([step4,graded]);
  const input=buildDecisionInput(step4,graded,'2026-10-30');
  assert.deepEqual(input.counts,{oldSources:2,newSources:2,oldA:1,oldB:1,newA:1,newB:1,oldExcerpts:1,newExcerpts:1});
  assert.equal(input.previouslyReviewed[0].id,'G001-E1');
  assert.equal(input.newSources[0].passages[0].id,'G100-E1');
  assert.equal(input.newSources[1].passages.length,0);
  assert.equal(input.oldBAndExcluded[0].grade,'B');
  assert.equal(JSON.stringify([step4,graded]),before);
});

test('prompt is English, compact decision JSON, no hard-coded commodity questions or searches',()=>{
  const {step4,graded}=fake();const input=buildDecisionInput(step4,graded,'2026-10-30');
  const prompt=buildDecisionPrompt(input);
  assert.match(prompt,/Decide whether ONE final Google Search follow-up round is necessary/);
  assert.match(prompt,/not require a fixed number of sources/);
  assert.match(prompt,/Do not treat B-only claims/);
  assert.match(prompt,/Return brief valid JSON ONLY in Korean/);
  assert.match(prompt,/No Google Search\/tool calls/);
  assert.match(prompt,/G001-E1/);assert.match(prompt,/G100-E1/);
  assert.doesNotMatch(prompt,/Pay particular attention to China/);
  assert.doesNotMatch(prompt,/mandatory CBOT/);
});

test('valid search decision with actionable gaps parses',()=>{
  const input=JSON.stringify({decision:'search',reason:'최신 수요 자료 중요',covered:[{topic:'수급',assessment:'공급 확인',sourceIds:['G001']}],
    remainingGaps:[{topic:'수요',whyImportant:'수요 급변 가능',searchQuestion:'수입 실적 변화는?'}],cautions:[]});
  const parsed=parseDecisionResponse(input);
  assert.equal(parsed?.decision,'search');assert.equal(parsed?.remainingGaps.length,1);
});

test('Gemini caution objects with different keys or multiple text fields parse without changing action',()=>{
  const obj={decision:'stop',reason:'조사 충분',covered:[{topic:'수급',assessment:'확인',sourceIds:['G001']}],
    remainingGaps:[],cautions:[{risk:'수급표 잠정',source:'USDA'},{note:'추가 점검'}]};
  const r=parseDecisionResponse(JSON.stringify(obj));
  assert.equal(r?.decision,'stop');assert.deepEqual(r?.cautions,['risk: 수급표 잠정; source: USDA','note: 추가 점검']);
  assert.deepEqual(r?.covered[0].sourceIds,['G001']);
});
test('non-text or empty caution objects do not silently pass',()=>{
  const obj={decision:'stop',reason:'조사 충분',covered:[],remainingGaps:[],cautions:[{risk:12}]};
  assert.equal(parseDecisionResponse(JSON.stringify(obj)),null);
  obj.cautions=[{risk:''} as any];assert.equal(parseDecisionResponse(JSON.stringify(obj)),null);
});

test('stop decision accepted despite some uncertainties: no minimum facts/sources',()=>{
  const result=parseDecisionResponse(JSON.stringify({decision:'stop',reason:'핵심 시장요인 충분',covered:[],remainingGaps:[],cautions:[]}));
  assert.equal(result?.decision,'stop');
});

test('invalid/truncated JSON never invents a decision, nor guesses missing fields',()=>{
  assert.equal(parseDecisionResponse('{"decision":"search","reason":'),null);
  assert.equal(parseDecisionResponse('{"decision":"search"}'),null);
  assert.equal(parseDecisionResponse(''),null);
  assert.equal(parseDecisionResponse(JSON.stringify({decision:'yes',reason:'',covered:[],remainingGaps:[],cautions:[]})),null);
});

test('references that do not exist are audit warnings, not deletion',()=>{
  const {step4,graded}=fake();const input=buildDecisionInput(step4,graded,'2026-10-30');
  const dec=parseDecisionResponse(JSON.stringify({decision:'search',reason:'조사 필요',
    covered:[{topic:'가격',assessment:'추정',sourceIds:['G001','G999']},{topic:'B 단독',assessment:'임시',sourceIds:['G101']}],
    remainingGaps:[{topic:'가격',whyImportant:'영향',searchQuestion:'최근 가격은?'}],cautions:[]}))!;
  const audit=auditDecisionReferences(dec,input);
  assert.deepEqual(audit.invalidIds,['G999']);assert.deepEqual(audit.bOnlyCoverageTopics,['B 단독']);
  const report=renderDecisionReport(input,'test',dec,audit,'decision-references-need-review');
  assert.match(report,/G999/);assert.match(report,/기존 출처/);
});

test('rejects missing or wrong round and repeated evidence IDs before paid call',()=>{
  const {step4,graded}=fake();
  assert.throws(()=>buildDecisionInput(step4,{...graded,round:2},'2026-10-30'));
  assert.throws(()=>buildDecisionInput({...step4,analysis:{...step4.analysis,candidateAssessments:[]}},graded,'2026-10-30'));
  assert.throws(()=>buildDecisionInput(step4,{...graded,review:[graded.review[0],graded.review[0]]},'2026-10-30'));
});

test('KST date is calculated on Korea clock',()=>{
  assert.equal(getKstDate(new Date('2026-10-29T16:10:00Z')),'2026-10-30');
});

test('real user STEP5 JSON conforms to the new evidence loader, with 43 new excerpts',()=>{
  const real='/mnt/data/step5-round1-graded-2026-10-30T09-12-37-617Z.json';
  if(!fs.existsSync(real))return;
  const j=JSON.parse(fs.readFileSync(real,'utf8'));
  const step4={analysis:{originalInventory:j.priorInventory,
    candidateAssessments:j.priorInventory.flatMap((s:any)=>s.evidence.map((e:any)=>({id:e.id,original:e,status:'unreviewed'}))),
    findings:[],researchGaps:[]}};
  const inp=buildDecisionInput(step4,j,'2026-10-30');
  assert.equal(inp.counts.newSources,14);assert.equal(inp.counts.newExcerpts,43);
  assert.equal(inp.counts.newA,9);assert.equal(inp.counts.newB,5);
  assert.ok(buildDecisionPrompt(inp).includes('G113-E'));
});
