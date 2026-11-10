import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {adaptStep7ToRms} from '../soybean-rebuild/step7-rms-adapter.ts';
import {inspectRiskOnly,hash,evaluateRisk,assertSameOutlook} from './risk-only-core.mjs';
import {COMMODITIES} from '../soybean-rebuild/commodity-config.ts';

const memory=Object.fromEntries(['RMS_STEP7_LOCAL_PREVIEW','RMS_PUBLIC_READONLY','NODE_ENV','CLOUD_RUN_JOB','K_SERVICE'].map(k=>[k,process.env[k]]));
process.env.NODE_ENV='development';delete process.env.RMS_PUBLIC_READONLY;delete process.env.CLOUD_RUN_JOB;delete process.env.K_SERVICE;
const source={id:'G001',grade:'A',googleTitle:'Verified test supply bulletin',publisherHost:'www.publisher.org',
 publisherUrl:'https://www.publisher.org/reports/supply',publishedAt:'2026-10-30',evidence:[{id:'G001-E1',theme:'supply',exactExcerpt:'An official harvest report describes available crop stocks and variable loading demand.'}]};
const evidence=[{id:'G001-E1',topic:'supply',text:'An official harvest report describes available crop stocks and variable loading demand.'}];
const sources=[{id:'G001',grade:'A',title:source.googleTitle,url:source.publisherUrl,citationUrl:null,date:source.publishedAt,excerpts:evidence}];
const report={headline:'재고와 공급 변화 모니터링',marketOutlook:'확인된 공급 자료에 따르면 재고 여건과 물류 수요가 변동하고 있습니다.',
 procurementStrategy:'실제 원료 오퍼와 납기 상황을 비교해 분할 조달을 검토합니다.',
 bullishFactors:[{text:'물류 수요 증가',sourceIds:['G001']}],bearishFactors:[{text:'가용 재고 확인',sourceIds:['G001']}],
 monitoringFactors:[{text:'출하량 추이',sourceIds:['G001']}],sourceIds:['G001'],uncertainties:['추가 발표 대기'],
 claimEvidence:Array.from({length:3},(_,i)=>({claim:'공급 상황 '+(i+1),sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'}))};
function fixture(commodity,opts={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-risk-ssot-'));
 const dir=commodity==='soybean'?path.join(root,'.rms-soybean-rebuild','daily','2026-10-30'):path.join(root,'.rms-research',commodity,'daily','2026-10-30');
 fs.mkdirSync(dir,{recursive:true});
 const step4='step4-analysis-test.json',graded='step5-round1-graded-test.json',decision='step5-round1-decision-test.json';
 const sourceCopy=structuredClone(source);
 if(opts.noEvidence)sourceCopy.evidence=[];
 const step4Data={commodity,analysis:{originalInventory:[sourceCopy],candidateAssessments:[],findings:[],researchGaps:[]}};
 fs.writeFileSync(path.join(dir,step4),JSON.stringify(step4Data));
 fs.writeFileSync(path.join(dir,graded),JSON.stringify({commodity,stage:'additional-google-original-verification-round1',round:1,review:[]}));
 fs.writeFileSync(path.join(dir,decision),JSON.stringify({commodity,stage:'round1-evidence-sufficiency-decision',status:'decision-recorded',decision:{decision:'stop',reason:'verified source evidence sufficient'},inputFiles:{step4,step5Graded:graded}}));
 const finalName='step7-final-test.json',reviewName='step7-fact-verified-2026-10-30T09-55-00-000Z.json';
 const original={stage:'final-market-outlook-and-procurement',status:'report-created',commodity,
  model:'gemini-3.8-flash',recordedAt:'2026-10-30T09:54:16.416Z',route:'stop-after-round1',
  inputFiles:{step4,step5Graded:graded,step5Decision:decision,step6Graded:null},result:structuredClone(report)};
 const originalBytes=Buffer.from(JSON.stringify(original));fs.writeFileSync(path.join(dir,finalName),originalBytes);
 const review={stage:'step7-fact-verification',status:'verified',commodity,sourceFile:finalName,originalSha256:hash(originalBytes),
   completionPolicy:'best-effort-v2',approvalScope:'local-RMS-preview-only',approvedForCloudPublication:false,
   reviewComplete:true,reviewQuality:'complete',criticalAuditReasons:[],result:structuredClone(report)};
 fs.writeFileSync(path.join(dir,reviewName),JSON.stringify(review));
 const data=adaptStep7ToRms(original,opts.noEvidence?[{...sources[0],excerpts:[]}]:sources).data;
 if(opts.acceptRisk){data.procurementRiskPreview={commodityId:commodity,level:'주의',summarySentenceKo:'기존 근거 기반 위험 설명',
   evidence:[{url:source.publisherUrl,source:source.googleTitle,date:source.publishedAt,text:evidence[0].text}]};}
 if(opts.mismatch)data.executiveSummary='다른 보고서에서 온 문장';
 const preview={stage:'step7-local-ui-preview',commodity,approvedForPublication:false,sourceResultFile:finalName,
   verifiedResultFile:reviewName,originalSha256:hash(originalBytes),factReviewComplete:true,factReviewQuality:'complete',data};
 fs.writeFileSync(path.join(dir,`step7-rms-preview-${commodity}.json`),JSON.stringify(preview));
 return {root,dir,sourceCopy,review,preview};
}
for(const id of COMMODITIES){
 test(`${id}: same-report reviewed evidence is eligible, not new Google discovery`,()=>{
   const f=fixture(id);try{const got=inspectRiskOnly(f.root,id);assert.equal(got.status,'READY',got.reason);
     assert.equal(got.candidate.evidence.sources.length,1);
     assert.equal(got.candidate.receipt.data.procurementRiskPreview,undefined);
   }finally{fs.rmSync(f.root,{recursive:true,force:true});}
 });
}
test('mismatched UI market outlook is blocked rather than splicing a risk',()=>{const f=fixture('soybean',{mismatch:true});
 try{const got=inspectRiskOnly(f.root,'soybean');assert.equal(got.status,'BLOCKED');assert.match(got.reason,/does not match/i);}finally{fs.rmSync(f.root,{recursive:true,force:true});}});
test('original source excerpt inventory must exist; otherwise stop before a paid call',()=>{const f=fixture('potato-starch',{noEvidence:true});
 try{const got=inspectRiskOnly(f.root,'potato-starch');assert.equal(got.status,'BLOCKED');}finally{fs.rmSync(f.root,{recursive:true,force:true});}});
test('existing accepted SCM risk is not re-generated',()=>{const f=fixture('corn',{acceptRisk:true});
 try{assert.equal(inspectRiskOnly(f.root,'corn').status,'ALREADY_ACCEPTED');}finally{fs.rmSync(f.root,{recursive:true,force:true});}});
test('invalid/non-A/unsupported risk IDs are rejected; valid one passes original validator',()=>{
 const risk={level:'주의',summary:'원료 재고와 선적 여건이 변동하여 실제 가용 재고와 납기 확인이 필요한 상황입니다.',sourceIds:['G001']};
 assert.equal(evaluateRisk(risk,'soybean',sources).level,'주의');
 assert.throws(()=>evaluateRisk({...risk,sourceIds:['G999']},'soybean',sources));
 assert.throws(()=>evaluateRisk({...risk,sourceIds:['G001']},'soybean',[{...sources[0],grade:'B'}]));
 assert.throws(()=>evaluateRisk({...risk,summary:'x'.repeat(121)},'soybean',sources));
 assert.throws(()=>assertSameOutlook({executiveSummary:'first'}, {executiveSummary:'changed',sources:[]}));
});
test('no runtime hardcoded market facts or fixed risk output in production helper',()=>{
 const code=fs.readFileSync(new URL('./risk-only-repair.mjs',import.meta.url),'utf8');
 assert.match(code,/Google Search DISABLED/);assert.match(code,/--approve-paid=YES/);
 assert.match(code,/riskOnlyCompletion/);assert.match(code,/maxOutputTokens:1200/);
 assert.doesNotMatch(code,/step5-search\.ts|step1-google\.ts/);
});
process.on('exit',()=>{for(const [k,v] of Object.entries(memory)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});


test('saved, evidence-bound risk can be applied atomically without Gemini or changing prior analysis',()=>{
 const f=fixture('soybean');
 try{
   // Build a wholly isolated test project. Never write mock snapshots into the user's actual RMS directory.
   const currentRoot=path.resolve(new URL('../../',import.meta.url).pathname);
   fs.mkdirSync(path.join(f.root,'scripts'),{recursive:true});
   fs.cpSync(path.join(currentRoot,'scripts','soybean-rebuild'),path.join(f.root,'scripts','soybean-rebuild'),{recursive:true});
   fs.mkdirSync(path.join(f.root,'scripts','step7-integration'),{recursive:true});
   for(const n of ['risk-only-core.mjs','risk-only-repair.mjs'])fs.copyFileSync(path.join(currentRoot,'scripts','step7-integration',n),path.join(f.root,'scripts','step7-integration',n));
   fs.mkdirSync(path.join(f.root,'src','server'),{recursive:true});
   for(const n of ['step7LocalPreview.ts','step7CloudCard.ts'])fs.copyFileSync(path.join(currentRoot,'src','server',n),path.join(f.root,'src','server',n));
   fs.writeFileSync(path.join(f.root,'package.json'),JSON.stringify({type:'module'}));
   const state=inspectRiskOnly(f.root,'soybean');assert.equal(state.status,'READY',state.reason);
   const c=state.candidate;
   const risk={level:'주의',summary:'원료 가용 재고와 물류 수요가 변동하므로 실물 출하 가능성과 조달 납기를 확인할 필요가 있습니다.',sourceIds:['G001']};
   const prefix=c.originalSha256.slice(0,20),marker=`step7-risk-repair-attempt-${prefix}.json`;
   fs.writeFileSync(path.join(f.dir,marker),'{}');
   fs.writeFileSync(path.join(f.dir,`step7-risk-repair-response-${prefix}-2026-11-06T07-00-00-000Z.json`),JSON.stringify({
     version:1,status:'validated-risk',commodity:'soybean',originalSha256:c.originalSha256,
     previousReviewSha256:hash(c.reviewBytes),originalPreviewSha256:hash(c.previewBytes),
     evidenceSha256:c.evidenceSha256,attemptMarker:marker,risk,model:'mock-test-not-a-real-provider',
     modelOutputSha256:hash(JSON.stringify(risk)),generatedAt:'2026-11-06T07:00:00Z'}));
   const proc=spawnSync(process.execPath,['--experimental-strip-types','scripts/step7-integration/risk-only-repair.mjs','apply-saved','--commodity=soybean'],
     {cwd:f.root,encoding:'utf8',env:{...process.env,NODE_ENV:'development',RMS_PUBLIC_READONLY:'0'}});
   assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
   const after=JSON.parse(fs.readFileSync(path.join(f.dir,'step7-rms-preview-soybean.json'),'utf8'));
   assert.equal(after.data.procurementRiskPreview.level,'주의');
   assert.equal(after.data.executiveSummary,report.marketOutlook);
   assert.equal(after.data.purchaseActions[0],report.procurementStrategy);
   assert.equal(after.riskOnlyCompletion.marketOutlookUnchanged,true);
   const review=JSON.parse(fs.readFileSync(path.join(f.dir,after.verifiedResultFile),'utf8'));
   assert.equal(review.result.marketOutlook,report.marketOutlook);
   assert.equal(review.result.procurementStrategy,report.procurementStrategy);
   assert.deepEqual(review.result.procurementRisk.sourceIds,['G001']);
   assert.equal(fs.readdirSync(f.dir).filter(n=>n.startsWith('step7-rms-preview-soybean.json.risk-only-backup-')).length,1);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
