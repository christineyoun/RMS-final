import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decisionBrief} from '../../utils/overviewDecisionBrief.ts';
import {rankOverviewIssues} from '../../utils/overviewIssueRanking.ts';

const ids:[string,string][]=[['alpha','grains'],['beta','grains'],['gamma','grains'],['delta','oils'],['epsilon','oils'],['zeta','sweeteners'],['eta','starches'],['theta','starches']];
const analyses=ids.map(([id,group],i)=>({
 id,name:id.toUpperCase(),group,generatedAt:`2030-08-${String(15+i).padStart(2,'0')}T09:00:00Z`,
 executiveSummary:`${id} verified market outlook. Additional sentence.`,
 deskRecommendation:`${id} verified procurement guidance.`,
 bearishFactors:[`${id} abundant supply means lower price pressure.`],
 watchItems:[`${id} confirmed watch signal.`],
 ...(id==='beta'?{procurementRiskPreview:{level:'주의',summarySentenceKo:'Verified supply-risk assessment.',evidence:[{url:'https://publisher.example.net/report'}]}}:{})
}));

test('all eight available saved reports represented, not only two newest',()=>{
 const result=decisionBrief(analyses);
 assert(result.text.includes('[오늘의 시장 판단]'));
 assert(result.text.includes('[구매 기회]'));
 assert.equal(new Set(result.fragments.filter(x=>['executiveSummary','deskRecommendation'].includes(x.field)).map(x=>x.commodity)).size,8);
 for(const [id] of ids)assert(result.text.includes(id.toUpperCase()+':'));
 assert(!result.text.includes('abundant supply means lower price pressure'));
 assert(result.text.includes('Verified supply-risk assessment.'));
 assert(result.fragments.some(f=>f.commodity==='beta'&&f.field==='procurementRiskPreview.summarySentenceKo'));
});

test('unverified or neutral SCM status is not mislabeled as supply risk',()=>{
 const data=analyses.filter(a=>a.id!=='beta');
 const result=decisionBrief(data);
 assert(result.text.includes('[공급 위험] 공개된 근거에서 선정할 항목 없음'));
 assert(!result.fragments.some(x=>x.field==='bearishFactors'));
});

test('older higher-priority issue outranks newer trivial issue; no quota fill',()=>{
 const items=[
  {url:'https://publisher.example.net/latest',publishedAt:'2030-08-20',priority:1,theme:'market-development',sourceType:'news',commodities:['alpha']},
  {url:'https://publisher.example.net/important',publishedAt:'2030-08-01',priority:4,theme:'supply-balance',sourceType:'news',commodities:['beta']}
 ];
 assert.deepEqual(rankOverviewIssues(items).map(x=>x.url),[items[1].url,items[0].url]);
 assert.equal(rankOverviewIssues(items,4).length,2);
});

test('comparable importance prefers independent commodity before recency',()=>{
 const items=[
  {url:'https://publisher.example.net/1',publishedAt:'2030-08-20',priority:4,theme:'market-development',commodities:['alpha']},
  {url:'https://publisher.example.net/2',publishedAt:'2030-08-19',priority:4,theme:'market-development',commodities:['alpha']},
  {url:'https://publisher.example.net/3',publishedAt:'2030-08-02',priority:4,theme:'market-development',commodities:['gamma']},
 ];
 assert.deepEqual(rankOverviewIssues(items).map(x=>x.url),[items[0].url,items[2].url,items[1].url]);
});

test('issue ranking never invents entries, always caps at four and is deterministic',()=>{
 const items=Array.from({length:7},(_,i)=>({url:`https://publisher.example.net/${i}`,publishedAt:'2030-08-12',priority:4,commodities:[String(i)]}));
 const sorted=rankOverviewIssues(items);
 assert.equal(sorted.length,4);
 assert.deepEqual(rankOverviewIssues(items).map(x=>x.url),sorted.map(x=>x.url));
 assert.deepEqual(rankOverviewIssues([]),[]);
});
