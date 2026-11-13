import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildFinalPrompt, parseFinalResult, auditFinalResult, type EvidenceSource, type FinalResult} from './step7-core.ts';
import {factReviewPrompt, finishFactReview, type ModelReview} from './step7-fact-core.ts';
import {adaptStep7ToRms, COMMODITY_IDS} from './step7-rms-adapter.ts';
import {aggregateOverview} from '../../src/utils/overviewIntelligence.ts';
import {readPublishedOverviewTakeaway} from '../../src/utils/overviewTakeaway.ts';

const text='공급 감소 전망이 가격을 지지하지만 수요 둔화로 상승 폭은 제한될 수 있습니다.';
const opening='공급 감소가 예상됩니다(G001).';
const urls=['https://example.org/supply','https://example.org/demand'];
const sources:EvidenceSource[]=urls.map((url,i)=>{
  const id=i===0?'G001':'G002';
  return {id, grade:'A', title:'Test publisher', url, citationUrl:null, date:null,
    excerpts:[{id:id+'-E1',topic:'test',text:i===0?'Supply may decline':'Demand is weakening'}]};
});
const overviewTakeaway={text,sourceIds:['G001','G002'],excerptIds:['G001-E1','G002-E1']};
const result:FinalResult={
  headline:'공급 감소와 수요 둔화',
  marketOutlook:opening+' 수요 둔화는 상승 압력을 제한할 수 있습니다(G002).',
  procurementStrategy:'실제 오퍼를 비교합니다.',
  bullishFactors:[{text:'공급 감소 전망',sourceIds:['G001']}],
  bearishFactors:[{text:'수요 둔화',sourceIds:['G002']}],
  monitoringFactors:[{text:'시장 가격 변동',sourceIds:['G001']}],
  sourceIds:['G001','G002'],uncertainties:[],
  claimEvidence:['G001','G002','G001'].map(id=>({claim:'Test claim',sourceIds:[id],excerptIds:[id+'-E1'],evidenceType:'direct'})),
};
const full={...result,overviewTakeaway};
const generatedAt='2026-11-13T01:00:00.000Z';
const approved:ModelReview={status:'checked',issues:[],overviewTakeawayStatus:'supported'};
const card=(commodity:string,r:FinalResult,reviewed=true,evidence=sources)=>adaptStep7ToRms({
  stage:'final-market-outlook-and-procurement',status:'report-created',commodity,recordedAt:generatedAt,
  result:r,overviewTakeawayReviewed:reviewed,
},evidence).data;

test('same synthesis and review prompts request one optional whole-report takeaway',()=>{
  assert.match(buildFinalPrompt({commodity:'corn',sources} as any),/Optional last JSON field: overviewTakeaway.*whole marketOutlook/);
  assert.match(factReviewPrompt('corn',full,sources),/overviewTakeawayStatus.*material counterweight/);
  assert.doesNotMatch(factReviewPrompt('corn',result,sources),/overviewTakeawayStatus/);
  const parsed=parseFinalResult(JSON.stringify(full))!;
  assert.deepEqual(parsed.overviewTakeaway,overviewTakeaway);
  assert.deepEqual(auditFinalResult(parsed,{sources,commodity:'corn'} as any),auditFinalResult(result,{sources,commodity:'corn'} as any));
});

test('reviewed takeaway is preferred for all eight commodities, without altering reports',()=>{
  for(const id of COMMODITY_IDS){
    const done=finishFactReview(full,approved,sources,id);
    assert(done.publishable,id);
    const data=card(id,done.result);
    assert.deepEqual(data.overviewTakeaway,{text,commodityId:id,generatedAt,sourceUrls:urls},id);
    const {overviewTakeaway:_,...originalFields}=data;
    assert.deepEqual(originalFields,card(id,result),id);
    const aggregate=aggregateOverview([{id,analysis:data,articles:[]}]);
    assert.equal(aggregate.fragments.find(f=>f.field==='overviewTakeaway.text')?.excerpt,text,id);
    assert(!aggregate.brief.includes(opening),id);
    assert.equal(data.executiveSummary,result.marketOutlook,id);
  }
});

test('missing, malformed, unreviewed or stale optional data cannot prevent the normal report or excerpt',()=>{
  for(const optional of [undefined,null,[],{}, {...overviewTakeaway,text:text+' 또 다른 문장입니다.'},
    {...overviewTakeaway,text:'생산량이 12% 증가합니다.'},{...overviewTakeaway,text:'a'.repeat(151)+'입니다.'}]){
    const parsed=parseFinalResult(JSON.stringify({...result,overviewTakeaway:optional}))!;
    assert(parsed);
    assert.equal(parsed.overviewTakeaway,undefined);
    assert.equal(parsed.marketOutlook,result.marketOutlook);
  }
  for(const review of [null,{status:'checked',issues:[]} as const,{...approved,overviewTakeawayStatus:'omit'} as const]){
    const done=finishFactReview(full,review as ModelReview|null,sources,'corn');
    assert(done.publishable);
    assert.equal(done.result.overviewTakeaway,undefined);
  }
  const correction:ModelReview={...approved,issues:[{field:'marketOutlook',oldText:'공급 감소가 예상됩니다',
    newText:'공급 불확실성이 남아 있습니다',reason:'Test correction',sourceIds:['G001'],excerptIds:['G001-E1']}]};
  const done=finishFactReview(full,correction,sources,'corn');
  assert(done.publishable);
  assert.notEqual(done.result.marketOutlook,result.marketOutlook);
  assert.equal(done.result.overviewTakeaway,undefined);
  for(const data of [card('corn',result),card('corn',full,false),
    {...card('corn',full),generatedAt:'2026-11-12T00:00:00Z'},
    {...card('corn',full),factReviewComplete:false},
    {...card('corn',full),sources:[{title:'Different report',url:'https://example.org/other'}]}]){
    assert.equal(readPublishedOverviewTakeaway({id:'corn',...data}),undefined);
    const aggregate=aggregateOverview([{id:'corn',analysis:data,articles:[]}]);
    assert.equal(aggregate.fragments.find(f=>f.field==='executiveSummary')?.excerpt,opening);
  }
});

test('optional citations must point to readable excerpts and originals already in the same report',()=>{
  for(const bad of [
    {...overviewTakeaway,sourceIds:['G999']},
    {...overviewTakeaway,sourceIds:['G001'],excerptIds:['G002-E1']},
    {...overviewTakeaway,excerptIds:['G001-E1','G002-E1','invented']},
  ]){
    const data=card('corn',{...full,overviewTakeaway:bad});
    assert.equal(data.overviewTakeaway,undefined);
    assert.equal(data.executiveSummary,result.marketOutlook);
  }
  const b=sources.map((source,i)=>i?{...source,grade:'B'}:source);
  assert.equal(card('corn',full,true,b).overviewTakeaway,undefined);
  const retained=card('corn',full);
  assert.equal(readPublishedOverviewTakeaway({id:'wheat',...retained}),undefined);
});

test('the existing Cloud promotion carries the reviewed takeaway with its original report', async()=>{
  const fs=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {sha}=await import('./step7-fact-core.ts');
  const {promoteStep7CloudCard}=await import('../cloud/step7CloudPromotion.ts');
  const {readCloudStep7Card}=await import('../../src/server/step7CloudCard.ts');
  const id='corn', day=generatedAt.slice(0,10);
  const root=await fs.mkdtemp(join(tmpdir(),'rms-takeaway-promotion-'));
  try {
    const dir=join(root,'.rms-research',id,'daily',day);
    await fs.mkdir(dir,{recursive:true});
    const sourceFile='step7-final-fixture.json', verifiedResultFile='step7-fact-verified-fixture.json';
    const original=JSON.stringify({commodity:id,result:full});
    const originalSha256=sha(original);
    const done=finishFactReview(full,approved,sources,id);
    const data=card(id,{...done.result,procurementRisk:{
      level:'판정 보류',summary:'공급 위험을 확정할 근거가 부족합니다.',sourceIds:[],
    }});
    assert(data.procurementRiskPreview);
    await fs.writeFile(join(dir,sourceFile),original);
    await fs.writeFile(join(dir,verifiedResultFile),JSON.stringify({
      stage:'step7-fact-verification',status:'verified',commodity:id,sourceFile,originalSha256,
      completionPolicy:'best-effort-v2',approvalScope:'local-RMS-preview-only',approvedForCloudPublication:false,
      criticalAuditReasons:[],reviewQuality:'checked',reviewComplete:true,review:approved,result:done.result,
    }));
    const file=join(dir,'step7-rms-preview-'+id+'.json');
    const preview={commodity:id,originalSha256,verifiedResultFile,approvedForPublication:false,
      factReviewQuality:'checked',factReviewComplete:true,data};
    await fs.writeFile(file,JSON.stringify(preview));
    assert.equal((await promoteStep7CloudCard(id,day,root)).action,'published');
    const saved=readCloudStep7Card(id,root);
    assert.equal(saved.executiveSummary,result.marketOutlook);
    assert.equal(readPublishedOverviewTakeaway({id,...saved}),text);
    // A legacy/optional field miss is not a new publication gate.
    const {overviewTakeaway:_,...without}=data;
    await fs.writeFile(file,JSON.stringify({...preview,data:without}));
    assert.equal((await promoteStep7CloudCard(id,day,root)).action,'published');
    const legacy=readCloudStep7Card(id,root);
    assert.equal(legacy.executiveSummary,result.marketOutlook);
    assert.equal(readPublishedOverviewTakeaway({id,...legacy}),undefined);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
