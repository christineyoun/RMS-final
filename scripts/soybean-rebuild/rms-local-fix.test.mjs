import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseDecisionResponse} from './step5-decision-core.ts';
import {researchDir, inspect} from './research-pipeline-runner.mjs';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';
import {adaptStep7ToRms} from './step7-rms-adapter.ts';

const response=(cautions)=>JSON.stringify({decision:'stop',reason:'자료 충분',covered:[],remainingGaps:[],cautions});
test('Gemini cautions string array unchanged',()=>assert.deepEqual(parseDecisionResponse(response(['주의 1']))?.cautions,['주의 1']));
test('Gemini cautions short caveat object array normalized',()=>assert.deepEqual(parseDecisionResponse(response([{'short caveat':'확인 필요'},'다른 주의']))?.cautions,['확인 필요','다른 주의']));
test('arbitrary objects and numeric cautions still rejected',()=>{
 for(const cs of [[{danger:'abc'}],[{'short caveat':'x',other:'abc'}],[{'short caveat':17}],[{}],[17]])assert.equal(parseDecisionResponse(response(cs)),null);
});
test('truncated JSON remains invalid',()=>assert.equal(parseDecisionResponse('{"decision":"stop"'),null));
test('shared 8-commodity storage separates soybean vs potato',()=>{
 assert.equal(path.basename(researchDir('X','soybean')),'.rms-soybean-rebuild');
 assert.equal(path.basename(researchDir('X','potato-starch')),'potato-starch');
});

test('RMS publisher card mapping preserves all 8-slot fields and source IDs',()=>{
 const result={headline:'공급 부담으로 가격 강세',marketOutlook:'원료 수급 압박 및 이월재고 완충.',procurementStrategy:'실제 구매 계약과 제안 가격 비교 후 분할 구매.',bullishFactors:[{text:'공급 감소',sourceIds:['G100']}],bearishFactors:[{text:'이월 재고',sourceIds:['G001']}],monitoringFactors:[{text:'전분 수율',sourceIds:['G001']}],sourceIds:['G100','G001'],uncertainties:['미확인 재고']};
 const sources=[{id:'G001',grade:'A',title:'Potato market news',url:'https://potatopro.com/news/2026/market',citationUrl:null,date:null,excerpts:[]},{id:'G100',grade:'B',title:'Regional crop',url:'https://samplecommodity.org/2026/potato',citationUrl:null,date:null,excerpts:[]}];
 const output=adaptStep7ToRms({stage:'final-market-outlook-and-procurement',status:'report-created',commodity:'potato-starch',recordedAt:'2026-10-31T09:53:20.679Z',result},sources);
 assert.equal(output.data.executiveSummary,result.marketOutlook);
 assert.equal(output.data.purchaseActions[0],result.procurementStrategy);
 assert.equal(output.data.bullishFactors.length,1);
 assert.equal(output.data.bearishFactors.length,1);
 assert.equal(output.data.watchItems.length,1);
 assert.equal(output.data.sources.length,2);
 assert.equal(output.data.rmsStep7Preview,true);
 assert.equal('uncertainties' in output.data,false);
});

test('local RMS reader per commodity, opt-in dev loopback only',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-pcard-'));
 const dir=path.join(root,'.rms-research','potato-starch');fs.mkdirSync(dir,{recursive:true});
 const data={rmsStep7Preview:true,status:'cached',deskRecommendation:'분할 구매 검토',executiveSummary:'가격 및 수급 전망',purchaseActions:['매입 전략'],bullishFactors:['작황 위험'],bearishFactors:['이월 재고'],watchItems:['전분 수율'],sources:[{title:'Potato trade',url:'https://potatopro.com/research/2026'}]};
 fs.writeFileSync(path.join(dir,'step7-rms-preview-potato-starch.json'),JSON.stringify({stage:'step7-local-ui-preview',approvedForPublication:false,commodity:'potato-starch',data}));
 const old={RMS_STEP7_LOCAL_PREVIEW:process.env.RMS_STEP7_LOCAL_PREVIEW,NODE_ENV:process.env.NODE_ENV,RMS_PUBLIC_READONLY:process.env.RMS_PUBLIC_READONLY};
 try{
  process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.NODE_ENV='development';delete process.env.RMS_PUBLIC_READONLY;
  assert.deepEqual(readStep7LocalPreview('potato-starch','127.0.0.1',root),data);
  assert.equal(readStep7LocalPreview('soybean','127.0.0.1',root),null);
  assert.equal(readStep7LocalPreview('potato-starch','10.0.0.1',root),null);
  process.env.NODE_ENV='production';assert.equal(readStep7LocalPreview('potato-starch','127.0.0.1',root),null);
  process.env.NODE_ENV='development';process.env.RMS_PUBLIC_READONLY='1';assert.equal(readStep7LocalPreview('potato-starch','127.0.0.1',root),null);
 }finally{
  for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('existing Stage3 gateway serves local report before saved snapshots',()=>{
 const gw=fs.readFileSync(new URL('../../src/server/stage3DailyUpdates.ts',import.meta.url),'utf8');
 assert.ok(gw.includes('Explicit STEP 1–7-2 local integration.'));
 assert.ok(gw.indexOf('readStep7LocalPreview(id,req.socket.remoteAddress)')<gw.indexOf('const scheduled=readScheduledContent(key)'));
});
test('runner has shell:false (no DEP0190) and records progress after failed paid stage',()=>{
 const code=fs.readFileSync(new URL('./research-pipeline-runner.mjs',import.meta.url),'utf8');
 assert.match(code,/shell:false/);assert.match(code,/progress=inspect\(root,opts.commodity\)\.progress/);
 assert.doesNotMatch(code,/shell:process.platform==='win32'/);
});
test('STEP5 console no longer claims soybean when selected commodity differs',()=>{
 const code=fs.readFileSync(new URL('./step5-search.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\[Soybean STEP 5\]/);
});
