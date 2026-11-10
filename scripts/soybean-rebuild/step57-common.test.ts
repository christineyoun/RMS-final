import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {COMMODITIES,resultFolder,type Commodity} from './commodity-config.ts';
import {loadStep5Context} from './step5-local.ts';
import {loadDecisionContext} from './step5-decision-local.ts';
import {loadStep6Context} from './step6-core.ts';
import {buildFinalData,buildFinalPrompt} from './step7-core.ts';
import {chooseGrade} from './source-grade.ts';
import {buildEvidenceReview} from './step3-evidence.ts';
import {validateStep5Round1} from './step5-round1-merge.ts';

function makeFixture(commodity:Commodity,route:'stop'|'search'='stop'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-common-'));
 const dir=resultFolder(commodity,root);fs.mkdirSync(dir,{recursive:true});
 const old={commodity,status:'review-generated',analysis:{
  originalInventory:[{id:'G001',grade:'A',googleTitle:'historical report',publisherUrl:'https://official.example.org/report',
    evidence:[{id:'G001-E1',theme:'supply',exactExcerpt:'2026 supply estimate 400 tonnes'}]}],
  candidateAssessments:[{id:'G001-E1',status:'provisional',original:{theme:'supply',exactExcerpt:'2026 supply estimate 400 tonnes'}}],
  findings:[{statement:'Production forecast of 400 tonnes',status:'provisional',sourceIds:['G001']}],
  researchGaps:[{topic:'price data',reason:'updated source needed',question:'What changed recently?'}]}};
 const p4='step4-analysis-test.json',p5='step5-round1-graded-test.json',p5Search='step5-round1-search-test.json';
 const round1={commodity,stage:'additional-google-original-verification-round1',round:1,
  inputSearchFile:p5Search,priorInventory:old.analysis.originalInventory,
  summary:{A:1,B:0,newAExcerptCandidates:1},records:[{googleCitation:{title:'Official'}}],
  review:[{id:'G100',grade:'A',googleTitle:'new report',publisherUrl:'https://official.example.org/new',
    evidence:[{id:'G100-E1',theme:'prices',exactExcerpt:'2026 market price 30 EUR/tonne'}]}]};
 const search={commodity,stage:'additional-google-discovery-round1',round:1,
  status:'google-citations-found',step4InputFile:p4,
  priorSnapshot:{originalInventory:old.analysis.originalInventory},grounding:{sources:[]}};
 const decision={commodity,stage:'round1-evidence-sufficiency-decision',status:'decision-recorded',
  inputFiles:{step4:p4,step5Graded:p5},decision:{decision:route,reason:'test',covered:[],
   remainingGaps:route==='search'?[{topic:'gaps',whyImportant:'price',searchQuestion:'Latest evidence?'}]:[],cautions:[]}};
 const write=(name:string,x:unknown)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(x));
 write(p4,old);write(p5Search,search);write(p5,round1);write('step5-round1-decision-test.json',decision);
 return {root,dir,write,decision,p4,p5};
}
for(const commodity of COMMODITIES){
 test(`${commodity}: STEP5 → decision → STOP → STEP7 reads its own snapshot and preserves subject`,()=>{
  const x=makeFixture(commodity);
  try{
   const step5=loadStep5Context(x.root,commodity);
   assert.equal(step5.plan.commodity,commodity);
   assert.match(step5.prompt,new RegExp(`Commodity: ${commodity}\\b`));
   const dec=loadDecisionContext(x.root,'2026-10-31',commodity);
   assert.equal(dec.input.commodity,commodity);
   assert.equal(dec.prior,x.p4); // Exact STEP4 input referenced by that STEP5 round
   assert.equal(loadStep6Context(x.root,'2026-10-31',commodity).route,'step7-final');
   const final=buildFinalData(x.dir,'2026-10-31');
   assert.equal(final.commodity,commodity);
   assert.equal(final.counts.sources,2);
   assert.match(buildFinalPrompt(final),new RegExp(`Commodity: ${commodity}\\b`));
   if(commodity!=='soybean')assert.equal(fs.existsSync(path.join(x.root,'.rms-soybean-rebuild')),false);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
 });
}
test('Different commodity decision is refused before STEP6 routes',()=>{
 const x=makeFixture('potato-starch');
 try{assert.throws(()=>loadStep6Context(x.root,'2026-10-31','tapioca-starch'),/Missing/);
   const file=path.join(x.dir,'step5-round1-decision-test.json');
   const tampered=JSON.parse(fs.readFileSync(file,'utf8'));tampered.commodity='soybean';
   fs.writeFileSync(file,JSON.stringify(tampered));
   assert.throws(()=>loadStep6Context(x.root,'2026-10-31','potato-starch'),/commodity mismatch/i);
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('SEARCH uses chosen commodity, blocks STEP7 before verified round2, succeeds after',()=>{
 const x=makeFixture('potato-starch','search');
 try{
   const c=loadStep6Context(x.root,'2026-10-31','potato-starch');
   assert.equal(c.route,'step6-search');assert.match(c.prompt!,/Commodity: potato-starch/);
   assert.throws(()=>buildFinalData(x.dir),/run STEP6/);
   x.write('step6-round2-graded-test.json',{stage:'additional-google-original-verification-round2',round:2,commodity:'potato-starch',
    decisionFile:'step5-round1-decision-test.json',inputFiles:{step4:x.p4,step5Graded:x.p5},
    review:[{id:'G200',grade:'B',googleTitle:'partially readable',evidence:[]}]});
   const f=buildFinalData(x.dir);
   assert.equal(f.commodity,'potato-starch');assert.equal(f.counts.sources,3);
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('STEP5 source grade and excerpt extraction recognize potato starch rather than soybean',()=>{
 const text=('French potato starch production increased in 2026. Kartoffelstärke factories reported higher shipments. ').repeat(9);
 const grade=chooseGrade({citation:true,publisherUrl:'https://source.example.org/report',status:200,type:'html',text},'potato-starch');
 assert.equal(grade.grade,'A');
 const records=buildEvidenceReview([{grade:'A',reason:'verified-html',googleCitation:{index:100,title:'Potato',uri:'https://source.example.org/report'},
  publisherUrl:'https://source.example.org/report',publisherHost:'source.example.org',httpStatus:200,
  documentType:'html',title:'Potato starch',publishedAt:'2026-10-30',extractedCharacters:text.length,extractedText:text,notes:''}], 'potato-starch');
 assert.equal(records[0].grade,'A');assert.ok(records[0].evidence.length>0);
});
test('STEP5 verification refuses wrong commodity even if Google citations exist',()=>{
 const raw={commodity:'soybean',stage:'additional-google-discovery-round1',round:1,status:'google-citations-found',
  grounding:{sources:[{title:'a',uri:'https://site.com/report'}]},priorSnapshot:{originalInventory:[{id:'G001'}]}};
 assert.throws(()=>validateStep5Round1(raw,'potato-starch'));
 assert.doesNotThrow(()=>validateStep5Round1(raw,'soybean'));
});
