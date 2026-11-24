import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDecisionInput,parseDecisionResponse,normalizeDecisionSourceIds,auditDecisionReferences} from '../step5-decision-core.ts';
import {classifyStep7Failure} from '../../cloud/step7FailureClassification.mjs';
const commodities=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
function fixture(commodity='wheat'){
 const old=[{id:'G001',grade:'A',evidence:[{id:'G001-E1',exactExcerpt:'fixture'}]},{id:'G002',grade:'B'}];
 const step4={commodity,analysis:{originalInventory:old,candidateAssessments:[{id:'G001-E1',original:old[0].evidence[0]}],findings:[],researchGaps:[]}};
 const graded={commodity,stage:'additional-google-original-verification-round1',round:1,priorInventory:old,records:[],review:[{id:'G111',grade:'A',evidence:[{id:'G111-E1',exactExcerpt:'fixture'}]},{id:'G112',grade:'A'},{id:'G113',grade:'EXCLUDED'}]};
 return buildDecisionInput(step4,graded,'2026-11-24');
}
function decision(ids){return parseDecisionResponse(JSON.stringify({decision:'stop',reason:'fixture',covered:[{topic:'supply',assessment:'fixture',sourceIds:ids}],remainingGaps:[],cautions:[]}));}
for(const commodity of commodities)test(`${commodity}: exact composite source references recover without changing decision or original`,()=>{
 const input=fixture(commodity),d=decision(['G001','G111, G112']); const before=JSON.stringify([input,d]);
 assert.deepEqual(auditDecisionReferences(d,input).invalidIds,['G111, G112']);
 const result=normalizeDecisionSourceIds(d,input);
 assert.deepEqual(result.decision.covered[0].sourceIds,['G001','G111','G112']);
 assert.deepEqual(result.repairs,[{coveredIndex:0,original:'G111, G112',normalized:['G111','G112']}]);
 assert.deepEqual(auditDecisionReferences(result.decision,input).invalidIds,[]);
 assert.equal(result.decision.decision,d.decision);assert.equal(result.decision.reason,d.reason);assert.equal(result.decision.covered[0].assessment,d.covered[0].assessment);assert.equal(JSON.stringify([input,d]),before);
});
for(const id of ['G111, G999','G111, G113','G111, G111-E1','G111,','G111 and G112','G111, G112 explanation','G111-G112'])test(`rejects ${id}`,()=>{
 const input=fixture(),d=decision([id]),r=normalizeDecisionSourceIds(d,input);assert.equal(r.repairs.length,0);assert.deepEqual(auditDecisionReferences(r.decision,input).invalidIds,[id]);
});
test('B sources remain B-only caution, excluded direct references fail',()=>{
 const input=fixture();input.newSources.push({...input.newSources[1],id:'G114',grade:'B'});
 const r=normalizeDecisionSourceIds(decision(['G002, G114']),input);assert.deepEqual(auditDecisionReferences(r.decision,input).bOnlyCoverageTopics,['supply']);
 assert.deepEqual(auditDecisionReferences(decision(['G113']),input).invalidIds,['G113']);
});
test('ambiguous duplicate source IDs fail',()=>{const i=fixture();i.newSources.push({...i.newSources[0]});const r=normalizeDecisionSourceIds(decision(['G111, G112']),i);assert.equal(r.repairs.length,0);assert.ok(auditDecisionReferences(r.decision,i).invalidIds.length);});
test('over-limit input or expansion never drops references',()=>{const input=fixture();assert.equal(decision(Array(11).fill('G001')),null);const ids=[...Array(9).fill('G001'),'G111, G112'];const d=decision(ids);const r=normalizeDecisionSourceIds(d,input);assert.equal(r.repairs.length,0);assert.deepEqual(auditDecisionReferences(r.decision,input).invalidIds,['G111, G112']);});
test('saved decision status outranks incidental HTTP-like digits',()=>{assert.equal(classifyStep7Failure({decisionStatus:'decision-references-need-review',stdout:'file-429.json'}),'decision-references-need-review');});
test('timestamp, filename and counters are not provider errors',()=>{assert.equal(classifyStep7Failure({stdout:'saved file-429.json count 403',stderr:'duration 503 ms',code:2}),'runner-exited-nonzero');});
test('explicit API errors still report rate limits and auth failures',()=>{assert.equal(classifyStep7Failure({stderr:'[STEP5 DECISION] API error: 429 RESOURCE_EXHAUSTED'}),'provider-rate-limited');assert.equal(classifyStep7Failure({stderr:'ApiError: 403 PERMISSION_DENIED'}),'provider-auth-rejected');});
test('ordinary valid source references unchanged',()=>{const d=decision(['G001','G112']);assert.deepEqual(normalizeDecisionSourceIds(d,fixture()),{decision:d,repairs:[]});});
