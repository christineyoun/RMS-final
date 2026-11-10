import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {COMMODITIES,inspect,parseOptions,researchDir,runnerDir,run} from './research-pipeline-runner.mjs';

function fixture(commodity='potato-starch'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-pipeline-test-'));
 const dir=researchDir(root,commodity);fs.mkdirSync(dir,{recursive:true});
 const files={};
 const write=(key,data,date='2026-10-31T00-00-00-000Z')=>{
  const filename=`${key}-${date}.json`;
  fs.writeFileSync(path.join(dir,filename),JSON.stringify(data));files[key]=filename;return filename;
 };
 const put={
  s1:()=>write('step1-google',{commodity,status:'google-citations-found',grounding:{sources:[{uri:'https://a.gov',title:'A'}]}}),
  s2:()=>write('step2-graded',{commodity,stage:'source-resolution-and-grading',inputFile:files['step1-google'],records:[{grade:'A'}]}),
  s3:()=>write('step3-evidence',{commodity,stage:'source-text-evidence-review-only',step2File:files['step2-graded'],items:[{grade:'A',evidence:[{id:'G001-E1'}]}],totals:{AExcerptCandidates:1}}),
  s4:()=>write('step4-analysis',{commodity,status:'review-generated',step3File:files['step3-evidence'],analysis:{originalInventory:[{id:'G001'}],candidateAssessments:[{id:'G001-E1'}],findings:[{}],researchGaps:[{}]}}),
  s5:()=>write('step5-round1-search',{commodity,status:'google-citations-found',step4InputFile:files['step4-analysis'],grounding:{sources:[{uri:'https://b.gov',title:'B'}]}}),
  s5g:()=>write('step5-round1-graded',{commodity,stage:'additional-google-original-verification-round1',round:1,inputSearchFile:files['step5-round1-search'],review:[{id:'G100',grade:'A'}]}),
  s5d:(decision='stop')=>write('step5-round1-decision',{commodity,stage:'round1-evidence-sufficiency-decision',status:'decision-recorded',inputFiles:{step4:files['step4-analysis'],step5Graded:files['step5-round1-graded']},decision:{decision,remainingGaps:decision==='search'?[{searchQuestion:'What now?'}]:[]}}),
  s6:()=>write('step6-round2-search',{commodity,status:'google-citations-found',decisionFile:files['step5-round1-decision']}),
  s6g:()=>write('step6-round2-graded',{commodity,stage:'additional-google-original-verification-round2',round:2,sourceFile:files['step6-round2-search'],decisionFile:files['step5-round1-decision'],review:[{id:'G200',grade:'A'}]}),
  s7:(status='report-created',step6=false)=>write('step7-final',{commodity,stage:'final-market-outlook-and-procurement',status,inputFiles:{step4:files['step4-analysis'],step5Graded:files['step5-round1-graded'],step5Decision:files['step5-round1-decision'],step6Graded:step6?files['step6-round2-graded']:null}}),
 };
 const ready=()=>{put.s1();put.s2();put.s3();put.s4();put.s5();put.s5g();};
 return {root,dir,files,write,put,ready};
}

test('all eight commodities have isolated paths, even legacy soybean',()=>{
 const x=fixture();const all=COMMODITIES.map(c=>researchDir(x.root,c));
 assert.equal(new Set(all).size,8);
 assert.ok(researchDir(x.root,'soybean').endsWith('.rms-soybean-rebuild'));
 assert.ok(researchDir(x.root,'potato-starch').endsWith('potato-starch'));
});
test('empty research shows STEP1 paid and no writes',()=>{
 const x=fixture();const before=fs.readdirSync(x.dir);
 assert.equal(inspect(x.root,'potato-starch').stage,'step1');
 assert.deepEqual(fs.readdirSync(x.dir),before);
 assert.equal(fs.existsSync(runnerDir(x.root,'potato-starch')),false);
});
test('free STEP2 and STEP3 are selected in order',()=>{
 const x=fixture();x.put.s1();assert.equal(inspect(x.root,'potato-starch').stage,'step2');
 x.put.s2();assert.equal(inspect(x.root,'potato-starch').stage,'step3');
 x.put.s3();assert.equal(inspect(x.root,'potato-starch').stage,'step4');
});
test('STEP4 failure halts instead of paid retry',()=>{
 const x=fixture();x.put.s1();x.put.s2();x.put.s3();
 x.write('step4-analysis',{commodity:'potato-starch',status:'model-json-invalid',step3File:x.files['step3-evidence']});
 const state=inspect(x.root,'potato-starch');assert.equal(state.action,'stop');assert.match(state.reason,/diagnose/);
});
test('STOP bypasses STEP6 and continues STEP7',()=>{
 const x=fixture();x.ready();x.put.s5d('stop');
 const state=inspect(x.root,'potato-starch');
 assert.equal(state.stage,'step7');assert.equal(state.route,'stop');
 x.put.s7();assert.equal(inspect(x.root,'potato-starch').action,'done');
});
test('SEARCH requires STEP6 search and verification, then STEP7',()=>{
 const x=fixture();x.ready();x.put.s5d('search');
 assert.equal(inspect(x.root,'potato-starch').stage,'step6search');
 x.put.s6();assert.equal(inspect(x.root,'potato-starch').stage,'step6graded');
 x.put.s6g();assert.equal(inspect(x.root,'potato-starch').stage,'step7');
 x.put.s7('report-created',true);assert.equal(inspect(x.root,'potato-starch').action,'done');
});
test('UNCERTAIN or search without questions stops safely',()=>{
 const x=fixture();x.ready();x.put.s5d('uncertain');
 assert.equal(inspect(x.root,'potato-starch').action,'stop');
 const y=fixture();y.ready();y.put.s5d('search');
 const file=path.join(y.dir,y.files['step5-round1-decision']);const d=JSON.parse(fs.readFileSync(file));d.decision.remainingGaps=[];fs.writeFileSync(file,JSON.stringify(d));
 assert.equal(inspect(y.root,'potato-starch').action,'stop');
});
test('wrong commodity and mismatched dependency stop, not publish',()=>{
 const x=fixture();x.put.s1();const file=path.join(x.dir,x.files['step1-google']);
 let data=JSON.parse(fs.readFileSync(file));data.commodity='soybean';fs.writeFileSync(file,JSON.stringify(data));
 assert.equal(inspect(x.root,'potato-starch').action,'stop');
 const y=fixture();y.put.s1();y.put.s2();let f=path.join(y.dir,y.files['step2-graded']);
 data=JSON.parse(fs.readFileSync(f));data.inputFile='step1-google-another.json';fs.writeFileSync(f,JSON.stringify(data));
 assert.equal(inspect(y.root,'potato-starch').action,'stop');
});
test('STEP7 report needing review is not accepted as complete',()=>{
 const x=fixture();x.ready();x.put.s5d();x.put.s7('report-review-needed');
 const s=inspect(x.root,'potato-starch');assert.equal(s.action,'stop');assert.match(s.reason,/review/);
});
test('runner free mode never calls paid stage',()=>{
 const x=fixture();let calls=0;
 const r=run(x.root,{commodity:'potato-starch',mode:'free',maxPaid:1},()=>{calls++;return 0});
 assert.equal(r.stage,'step1');assert.equal(calls,0);assert.equal(r.paidCalls,0);
});
test('runner paid mode respects cap and persists one attempt before a call',()=>{
 const x=fixture();let calls=0;
 const execute=(root,stage)=>{
  calls++;
  if(stage==='step1')assert.ok(fs.existsSync(path.join(runnerDir(root,'potato-starch'),`paid-${stage}.json`)));
  if(stage==='step1')x.put.s1();
  else if(stage==='step2')x.put.s2();
  else if(stage==='step3')x.put.s3();
  else throw Error('Unexpected paid or unapproved stage '+stage);
  return 0;
 };
 const result=run(x.root,{commodity:'potato-starch',mode:'paid',maxPaid:1},execute);
 assert.equal(result.stage,'step4');assert.equal(result.paidCalls,1);assert.equal(calls,3);
 assert.equal(fs.readdirSync(runnerDir(x.root,'potato-starch')).length,1);
});
test('a previous paid reservation blocks auto paid reattempt',()=>{
 const x=fixture();fs.mkdirSync(runnerDir(x.root,'potato-starch'),{recursive:true});
 fs.writeFileSync(path.join(runnerDir(x.root,'potato-starch'),'paid-step1.json'),'{}');
 const r=run(x.root,{commodity:'potato-starch',mode:'paid',maxPaid:4},()=>{throw Error('must not run')});
 assert.equal(r.action,'stop');assert.match(r.reason,/Previous paid attempt/);
});
test('explicit flags required to run paid and cap is bounded',()=>{
 assert.throws(()=>parseOptions(['--commodity','soybean','--run-paid']),/approve-paid/);
 assert.throws(()=>parseOptions(['--commodity','soybean','--run-paid','--approve-paid','--max-paid','999']),/1–6/);
 assert.throws(()=>parseOptions(['--commodity','banana']),/Specify/);
 assert.equal(parseOptions(['--commodity','soybean']).mode,'preview');
});
test('legacy recovered soybean STEP4 accepted, never other commodities',()=>{
 const x=fixture('soybean');x.put.s1();x.put.s2();x.put.s3();
 x.write('step4-recovered',{analysis:{originalInventory:[{id:'G001'}],candidateAssessments:[{id:'G001-E1'}],findings:[{}],researchGaps:[{}]}});
 assert.equal(inspect(x.root,'soybean').stage,'step5search');
 const y=fixture('wheat');y.put.s1();y.put.s2();y.put.s3();
 y.write('step4-recovered',{analysis:{originalInventory:[{id:'G001'}],candidateAssessments:[],findings:[],researchGaps:[]}});
 assert.equal(inspect(y.root,'wheat').action,'stop');
});
test('runner does not use stale STEP4 recovered if later analysis exists',()=>{
 const x=fixture('soybean');x.put.s1();x.put.s2();x.put.s3();
 x.write('step4-recovered',{analysis:{originalInventory:[{id:'G001'}],candidateAssessments:[{id:'G001-E1'}],findings:[{}],researchGaps:[{}]}} ,'2026-10-30T08-30-00-000Z');
 x.put.s4();const state=inspect(x.root,'soybean');assert.equal(state.action,'stop');assert.match(state.reason,/Newer STEP4 analysis/);
});
