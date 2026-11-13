import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP4_OUTPUT_TOKEN_BUDGET,parseJsonReply} from '../step4-pipeline.ts';
import {STEP5_DECISION_RESPONSE_JSON_SCHEMA,parseDecisionResponse} from '../step5-decision-core.ts';

test('STEP4 gives room for review plus thinking without accepting truncated JSON',()=>{
  assert.equal(STEP4_OUTPUT_TOKEN_BUDGET,12_288);
  assert.equal(parseJsonReply('{"candidateReviews":[],"findings":[],"researchGaps":[]}')?.findings?.length,0);
  assert.equal(parseJsonReply('{"candidateReviews":[],"findings":['),null);
});
test('STEP5 generated schema matches the existing strict decision parser',()=>{
  const schema=STEP5_DECISION_RESPONSE_JSON_SCHEMA;
  assert.equal(schema.type,'object');
  assert.deepEqual([...schema.required].sort(),['decision','reason','covered','remainingGaps','cautions'].sort());
  const gap=schema.properties.remainingGaps.items;
  assert.deepEqual([...gap.required].sort(),['topic','whyImportant','searchQuestion'].sort());
  assert.equal(schema.properties.remainingGaps.maxItems,3);
  assert.equal(schema.properties.covered.maxItems,5);
  assert.equal(schema.properties.cautions.maxItems,3);
});
test('STEP5 continues to REJECT incomplete gap objects',()=>{
  const valid={decision:'search',reason:'Evidence gap',covered:[],remainingGaps:[
    {topic:'generic theme',whyImportant:'It may affect supply',searchQuestion:'What changed?'}],cautions:[]};
  assert.equal(parseDecisionResponse(JSON.stringify(valid))?.decision,'search');
  const missing=structuredClone(valid);delete (missing.remainingGaps[0] as Partial<{searchQuestion:string}>).searchQuestion;
  assert.equal(parseDecisionResponse(JSON.stringify(missing)),null);
});
test('STEP5 does not fabricate citations or override an uncertain decision',()=>{
  const valid={decision:'uncertain',reason:'Not enough evidence',covered:[],remainingGaps:[],cautions:[]};
  assert.equal(parseDecisionResponse(JSON.stringify(valid))?.decision,'uncertain');
  const invalid={...valid,covered:[{topic:'generic',assessment:'Unproven',sourceIds:[42]}]};
  assert.equal(parseDecisionResponse(JSON.stringify(invalid)),null);
});
