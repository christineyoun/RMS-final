import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {COMMODITIES,resultFolder} from './commodity-config.ts';
import {assertStep4SnapshotCommodity} from './step4-legacy-compat.ts';
import {loadStep5Context} from './step5-local.ts';
import {loadDecisionContext} from './step5-decision-local.ts';
import {loadStep6Context} from './step6-core.ts';
import {installStep57Legacy} from './step57-legacy-fix-install.ts';

const oldAnalysis={originalInventory:[{id:'G001',grade:'A',googleTitle:'report',publisherUrl:'https://ex.org/report',evidence:[{id:'G001-E1',exactExcerpt:'2026 production forecast 300 units'}]}],candidateAssessments:[{id:'G001-E1',status:'provisional',original:{exactExcerpt:'2026 production forecast 300 units'}}],findings:[{statement:'Production forecast 300 units',sourceIds:['G001']}],researchGaps:[{topic:'Price',question:'What is market price?',reason:'missing figures'}]};
function temporarySnapshot(route:'stop'|'search'='stop'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-legacy-'));
 const dir=resultFolder('soybean',root);fs.mkdirSync(dir,{recursive:true});
 const step4='step4-recovered-2026-10-30-old.json';
 const step5='step5-round1-graded-2026-10-30-new.json';
 const step5Search='step5-round1-search-2026-10-30-new.json';
 const prior={analysis:oldAnalysis,recoveryMode:'partial-objects'}; // historical: commodity absent
 const graded={stage:'additional-google-original-verification-round1',round:1,commodity:'soybean',inputSearchFile:step5Search,priorInventory:oldAnalysis.originalInventory,summary:{A:1,B:0,newAExcerptCandidates:1},records:[{googleCitation:{title:'new'}}],review:[{id:'G100',grade:'A',googleTitle:'new report',publisherUrl:'https://ex.org/new',evidence:[{id:'G100-E1',exactExcerpt:'market price 20 USD/MT'}]}]};
 const search={commodity:'soybean',step4InputFile:step4};
 const decision={stage:'round1-evidence-sufficiency-decision',status:'decision-recorded',commodity:'soybean',inputFiles:{step4,step5Graded:step5},decision:{decision:route,reason:'verified decision',covered:[],remainingGaps:route==='search'?[{topic:'gaps',whyImportant:'pricing',searchQuestion:'Latest price?'}]:[],cautions:[]}};
 for(const [f,v] of [[step4,prior],[step5,graded],[step5Search,search],['step5-round1-decision-2026-10-30.json',decision]] as const)fs.writeFileSync(path.join(dir,f),JSON.stringify(v));
 return {root,dir,step4,step5,prior};
}

test('legacy soybean recovered STEP4 file works in STEP5 search planning and decision',()=>{
 const t=temporarySnapshot();try{
  const before=fs.readFileSync(path.join(t.dir,t.step4));
  const p=loadStep5Context(t.root,'soybean');
  assert.equal(p.plan.commodity,'soybean');assert.equal(p.file,t.step4);
  const d=loadDecisionContext(t.root,'2026-10-31','soybean');
  assert.equal(d.input.commodity,'soybean');
  assert.equal(loadStep6Context(t.root,'2026-10-31','soybean').route,'step7-final');
  assert.deepEqual(fs.readFileSync(path.join(t.dir,t.step4)),before);
 }finally{fs.rmSync(t.root,{recursive:true,force:true});}
});
test('legacy recovered STEP4 also works in STEP6 SEARCH path',()=>{
 const t=temporarySnapshot('search');try{
  const c=loadStep6Context(t.root,'2026-10-31','soybean');
  assert.equal(c.route,'step6-search');assert.match(c.prompt!,/Commodity: soybean/);
 }finally{fs.rmSync(t.root,{recursive:true,force:true});}
});
test('legacy exception refuses missing commodity for any of 7 other commodities',()=>{
 for(const item of COMMODITIES.filter(x=>x!=='soybean'))assert.throws(()=>assertStep4SnapshotCommodity({analysis:oldAnalysis},item,'step4-recovered-2026-10-30-old.json','/tmp/.rms-soybean-rebuild'),/commodity mismatch/);
});
test('missing commodity in newly generated STEP4, different folder, and incomplete legacy data are rejected',()=>{
 assert.throws(()=>assertStep4SnapshotCommodity({analysis:oldAnalysis},'soybean','step4-analysis-2026-10-30.json','/tmp/.rms-soybean-rebuild'),/mismatch/);
 assert.throws(()=>assertStep4SnapshotCommodity({analysis:oldAnalysis},'soybean','step4-recovered-2026-10-30-old.json','/tmp/.rms-research/soybean'),/mismatch/);
 assert.throws(()=>assertStep4SnapshotCommodity({analysis:{}},'soybean','step4-recovered-2026-10-30-old.json','/tmp/.rms-soybean-rebuild'),/mismatch/);
});
test('explicit commodity mismatch still blocked and modern data accepted',()=>{
 assert.throws(()=>assertStep4SnapshotCommodity({commodity:'corn',analysis:oldAnalysis},'soybean','step4-recovered-2026-10-30-old.json','/tmp/.rms-soybean-rebuild'),/mismatch/);
 assert.equal(assertStep4SnapshotCommodity({commodity:'potato-starch',analysis:oldAnalysis},'potato-starch','step4-analysis-2026-10-31.json','/tmp/.rms-research/potato-starch'),'explicit');
});

function installerFixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-legacy-install-'));
 const dir=path.join(root,'scripts','soybean-rebuild');fs.mkdirSync(dir,{recursive:true});
 fs.cpSync(path.join(process.cwd(),'step57-legacy-fix'),path.join(root,'step57-legacy-fix'),{recursive:true});
 for(const name of ['step5-local.ts','step5-decision-local.ts','step6-core.ts']){
  fs.copyFileSync(path.join(root,'step57-legacy-fix','fixtures',name),path.join(dir,name));
 }
 return {root,dir};
}
test('installer dry-run, backup, install and idempotency',()=>{
 const t=installerFixture();try{
  assert.equal(installStep57Legacy(t.root,true).status,'original-known');
  assert.equal(installStep57Legacy(t.root).status,'installed');
  assert.equal(installStep57Legacy(t.root).status,'already-installed');
  assert.ok(fs.existsSync(path.join(t.dir,'step4-legacy-compat.ts')));
 }finally{fs.rmSync(t.root,{recursive:true,force:true});}
});
test('installer refuses unexpected edit with zero writes',()=>{
 const t=installerFixture();try{
  fs.appendFileSync(path.join(t.dir,'step6-core.ts'),'// local user customization');
  const prev=fs.readFileSync(path.join(t.dir,'step5-local.ts'));
  assert.throws(()=>installStep57Legacy(t.root),/REFUSED/);
  assert.deepEqual(fs.readFileSync(path.join(t.dir,'step5-local.ts')),prev);
 }finally{fs.rmSync(t.root,{recursive:true,force:true});}
});
