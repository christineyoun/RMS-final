import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMODITIES,COMMODITY_NAMES,commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';
import {COMMODITY_ALIASES,findCommodityHits,classifyCommodityText} from './commodity-aliases.ts';
import {chooseGrade} from './source-grade.ts';
import {extractEvidenceCandidates,buildEvidenceReview} from './step3-evidence.ts';
import {buildPrompt,integrate} from './step4-pipeline.ts';
import path from 'node:path';

test('exactly 8 supported commodities and no missing or empty aliases',()=>{
  assert.equal(COMMODITIES.length,8);
  for(const c of COMMODITIES){assert.ok(COMMODITY_ALIASES[c].strong.length>0);assert.ok(COMMODITY_ALIASES[c].related.length>0);}
});
test('CLI commodity selection is explicit; old no-args soybean default stays compatible',()=>{
  assert.equal(commodityFromArgv([],{}),'soybean');
  assert.equal(commodityFromArgv(['--commodity','potato-starch'],{}),'potato-starch');
  assert.equal(commodityFromArgv(['--commodity=tapioca-starch'],{}),'tapioca-starch');
  assert.equal(commodityFromArgv([],{RMS_RESEARCH_COMMODITY:'corn'}),'corn');
  assert.throws(()=>commodityFromArgv(['--commodity','potato-starch','--commodity','wheat'],{}));
  assert.throws(()=>commodityFromArgv(['--commodity','potatostarch'],{}));
});
test('legacy soybean snapshots are left in original directory; all other commodities isolated',()=>{
  assert.equal(resultFolder('soybean','/root'),path.join('/root','.rms-soybean-rebuild'));
  for(const c of COMMODITIES.filter(x=>x!=='soybean'))assert.equal(resultFolder(c,'/root'),path.join('/root','.rms-research',c));
});
test('a mismatched STEP input is rejected before a paid call or output write',()=>{
  assert.throws(()=>assertSnapshotCommodity({commodity:'soybean'},'potato-starch','2'),/mismatch/);
  assert.doesNotThrow(()=>assertSnapshotCommodity({commodity:'corn'},'corn','3'));
});
const directExamples:Record<typeof COMMODITIES[number],string>={
  wheat:'Wheat production is projected to rise 10% across the belt.',
  corn:'Brazil milho output and maize harvest may rise 10% this year.',
  soybean:'USDA reports soybean production and export volumes for 2026.',
  'soybean-oil':'Óleo de soja production is forecast to rise 10% in Brazil.',
  'palm-oil':'Malaysia minyak sawit output is expected to increase 10%.',
  sugar:'Brazil açúcar output is forecast to rise 10%.',
  'potato-starch':'France: Fécule de pomme de terre output is forecast to decline 10%.',
  'tapioca-starch':'Thailand แป้งมันสำปะหลัง exports increased 10% this quarter.',
};
for(const c of COMMODITIES){
 test(`${c} has shared Step2 A grading and Step3 verbatim excerpt for a multilingual direct-name text`,()=>{
   const source=directExamples[c]+' Relevant production numbers for the same crop remain subject to review. '.repeat(6);
   assert.equal(classifyCommodityText(source,c),'strong');
   const grade=chooseGrade({citation:true,publisherUrl:'https://www.example.org/crop-report',status:200,type:'html',text:source},c);
   assert.equal(grade.grade,'A');
   const snippets=extractEvidenceCandidates(source,'G001',6,c);
   assert.ok(snippets.length>0);
   const normalized=source.replace(/\s+/g,' ').trim();
   assert.ok(snippets.every(s=>normalized.includes(s.exactExcerpt)));
 });
}
test('English word boundaries block partial words; CJK and Asian-script names match',()=>{
  assert.equal(classifyCommodityText('corner shop', 'corn'),'none');
  assert.equal(classifyCommodityText('ordinary playground', 'sugar'),'none');
  assert.equal(classifyCommodityText('马铃薯淀粉 production', 'potato-starch'),'strong');
  assert.equal(classifyCommodityText('แป้งมันสำปะหลัง exports', 'tapioca-starch'),'strong');
  assert.equal(classifyCommodityText('возросла Пшеница', 'wheat'),'strong');
});
test('specific soybean oil name is NOT direct soybean crop evidence; related evidence retained',()=>{
  assert.equal(classifyCommodityText('Soybean oil output rose by 8%.','soybean'),'related');
  assert.equal(classifyCommodityText('Soybean oil output rose by 8%.','soybean-oil'),'strong');
  assert.equal(classifyCommodityText('大豆油价格上升。','soybean'),'related');
  assert.equal(classifyCommodityText('大豆油价格上升。','soybean-oil'),'strong');
  assert.equal(classifyCommodityText('콩기름 가격', 'soybean-oil'),'strong');
  assert.equal(classifyCommodityText('Soybean output rose and soybean oil demand grew','soybean'),'strong');
});
test('generic raw material or related product is related, not a direct product',()=>{
  assert.equal(classifyCommodityText('Potato harvest was down in France.','potato-starch'),'related');
  assert.equal(classifyCommodityText('Cassava chips supply tightened in Cambodia.','tapioca-starch'),'related');
  assert.equal(classifyCommodityText('Wheat flour inventories rose.','wheat'),'related');
  assert.equal(classifyCommodityText('Palm kernel oil markets are firm.','palm-oil'),'related');
});
test('a readable related-only origin is still eligible A, unrelated remains B and retained',()=>{
  const seed={citation:true,publisherUrl:'https://www.usda.gov/crop-report',status:200,type:'html' as const};
  assert.equal(chooseGrade({...seed,text:'Potato harvest trends and starch crop yields.'.repeat(12)},'potato-starch').grade,'A');
  assert.deepEqual(chooseGrade({...seed,text:'The company careers page. '.repeat(15)},'potato-starch'),{grade:'B',reason:'publisher-unrelated'});
});
test('STEP3 B source stays in inventory, never fabricates excerpts',()=>{
  const items=buildEvidenceReview([{
    grade:'B',reason:'publisher-unreachable',googleCitation:{index:1,title:'Cassava industry',uri:'https://google.com/citation'},
    publisherUrl:null,publisherHost:null,httpStatus:null,documentType:null,title:null,publishedAt:null,
    extractedText:null,extractedCharacters:0,
  }],'tapioca-starch');
  assert.equal(items.length,1);assert.equal(items[0].evidence.length,0);assert.equal(items[0].grade,'B');
});
test('STEP4 uses same English instructions with only commodity names changed',()=>{
  const p1=buildPrompt([],{},'2026-10-31','soybean');
  for(const c of COMMODITIES){
    const q=buildPrompt([],{},'2026-10-31',c);
    assert.equal(q,p1.replaceAll('soybean',COMMODITY_NAMES[c]));
    assert.ok(q.includes('Do NOT use Google Search'));
  }
});
test('STEP4 preserves original excerpts even with no findings',()=>{
  const items=buildEvidenceReview([{grade:'A',reason:'verified-html',googleCitation:{index:1,title:'Potato starch article',uri:'https://google.com'},
    publisherUrl:'https://www.example.com/starch',publisherHost:'www.example.com',httpStatus:200,documentType:'html',title:'Potato starch article',publishedAt:'2026-10-01',
    extractedText:directExamples['potato-starch'].repeat(10),extractedCharacters:directExamples['potato-starch'].length*10}],'potato-starch');
  const result=integrate(items,{candidateReviews:[],findings:[],researchGaps:[]});
  assert.equal(result.originalInventory.length,1);assert.ok(result.audit.candidateCount>0);
  assert.equal(result.audit.autoPreservedUnreviewed,result.audit.candidateCount);
});
