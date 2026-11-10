import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nextStage,buildRound2Prompt,loadStep6Context} from './step6-core.ts';
import {buildFinalData,buildFinalPrompt,parseFinalResult,auditFinalResult} from './step7-core.ts';

const d=(decision:'stop'|'search'|'uncertain')=>({stage:'round1-evidence-sufficiency-decision',status:'decision-recorded',commodity:'soybean',
  decision:{decision,reason:'test',covered:[],remainingGaps:decision==='search'?[{topic:'market gap',whyImportant:'potential price impact',searchQuestion:'What is the latest evidence?'}]:[],cautions:[]},
  inputFiles:{step4:'step4-recovered-test.json',step5Graded:'step5-round1-graded-test.json'}});
function fixture(decision:'stop'|'search'|'uncertain'){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-branch-'));
  const dir=path.join(root,'.rms-soybean-rebuild');fs.mkdirSync(dir);
  const old={commodity:'soybean',analysis:{originalInventory:[{id:'G001',grade:'A',publisherUrl:'https://old.org/doc',googleTitle:'old',
    evidence:[{id:'G001-E1',theme:'supply',exactExcerpt:'soybean data 123'}]}],candidateAssessments:[{id:'G001-E1',status:'confirmed',original:{theme:'supply',exactExcerpt:'soybean data 123'}}],
    findings:[{statement:'soybean 123 forecast',status:'provisional',sourceIds:['G001']}],researchGaps:[]}};
  const newer={commodity:'soybean',stage:'additional-google-original-verification-round1',round:1,
    review:[{id:'G100',grade:'B',googleTitle:'news',publisherUrl:null,evidence:[]},
      {id:'G101',grade:'A',googleTitle:'source',publisherUrl:'https://new.org/doc',
        evidence:[{id:'G101-E1',theme:'trade',exactExcerpt:'export 2026, soybeans up'}]}]};
  fs.writeFileSync(path.join(dir,'step4-recovered-test.json'),JSON.stringify(old));
  fs.writeFileSync(path.join(dir,'step5-round1-graded-test.json'),JSON.stringify(newer));
  fs.writeFileSync(path.join(dir,'step5-round1-decision-test.json'),JSON.stringify(d(decision)));
  return {root,dir};
}
test('STOP skips STEP6 and routes directly to STEP7, preserving old/new sources',()=>{
  const x=fixture('stop');try{
    const c=loadStep6Context(x.root,'2026-10-30');
    assert.equal(c.route,'step7-final');assert.equal(c.prompt,null);
    const end=buildFinalData(x.dir,'2026-10-30');
    assert.equal(end.route,'stop-after-round1');assert.equal(end.files.step6Graded,null);
    assert.deepEqual(end.counts,{sources:3,A:2,B:1,EXCLUDED:0,excerpts:2});
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('SEARCH requires verified STEP6 before STEP7 and builds non-commodity-fixed English prompt',()=>{
  const x=fixture('search');try{
    const c=loadStep6Context(x.root,'2026-10-30');
    assert.equal(c.route,'step6-search');assert.match(c.prompt!,/SECOND AND FINAL/);
    assert.match(c.prompt!,/What is the latest evidence/);
    assert.throws(()=>buildFinalData(x.dir),/run STEP6/);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('SEARCH after second round uses 3 inventories, and never makes third search',()=>{
  const x=fixture('search');try{
    const a={stage:'additional-google-original-verification-round2',round:2,commodity:'soybean',
      decisionFile:'step5-round1-decision-test.json',inputFiles:d('search').inputFiles,
      review:[{id:'G200',grade:'B',googleTitle:'paywalled',evidence:[]},
        {id:'G201',grade:'A',googleTitle:'verified source',publisherUrl:'https://fresh.org/x',
          evidence:[{id:'G201-E1',theme:'prices',exactExcerpt:'soybean price change documented'}]}]};
    fs.writeFileSync(path.join(x.dir,'step6-round2-graded-test.json'),JSON.stringify(a));
    const data=buildFinalData(x.dir,'2026-10-30');
    assert.equal(data.route,'after-round2');assert.equal(data.counts.sources,5);
    assert.equal(data.counts.excerpts,3);assert.equal(data.counts.B,2);
    assert.match(buildFinalPrompt(data),/same underlying announcement/);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('UNCERTAIN never automatically starts the next step',()=>{
  const x=fixture('uncertain');try{
    assert.equal(nextStage(d('uncertain') as any),'manual-review');
    assert.throws(()=>buildFinalData(x.dir),/uncertain/);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('A decision that says SEARCH but provides no research gap cannot execute STEP6',()=>{
  const incomplete=d('search');incomplete.decision.remainingGaps=[];
  assert.equal(nextStage(incomplete as any),'manual-review');
});
test('Step7 rejects invented citation IDs and validates required output fields',()=>{
  const x=fixture('stop');try{
    const data=buildFinalData(x.dir,'2026-10-30');
    const raw=JSON.stringify({headline:'대두 대응',marketOutlook:'공급 증가',procurementStrategy:'분할 구매',
      bullishFactors:[{text:'기상 위험',sourceIds:['G001']}],
      bearishFactors:[{text:'공급 증가',sourceIds:['G101']}],
      monitoringFactors:[{text:'유가',sourceIds:['G999']}],sourceIds:['G001'],uncertainties:[]});
    const p=parseFinalResult(raw);assert.ok(p);
    assert.deepEqual(auditFinalResult(p!,data).invalidSourceIds,['G999']);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('Second search prompt has no hardcoded soybean-specific search questions',()=>{
  const txt=buildRound2Prompt({date:'2026-10-30',commodity:'potato-starch',
    decision:{decision:'search',reason:'test',covered:[],remainingGaps:[{topic:'weather',whyImportant:'risk',searchQuestion:'How is the crop?'}]},
    previousFindings:[],knownSources:[]});
  assert.match(txt,/Commodity: potato-starch/);
  assert.doesNotMatch(txt,/China|CBOT|Brazil|soybean|USDA/);
});
