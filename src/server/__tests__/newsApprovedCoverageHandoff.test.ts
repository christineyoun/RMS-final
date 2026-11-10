import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canSummarizeUsingApprovedCoverage} from '../newsFreeFirstPolicy.ts';
const now=new Date('2026-11-09T01:00:00Z');
const page=(host:string,id:string,day:string)=>({originalUrl:`https://${host}/reports/${id}`,publishedAt:day});
const saved=[page('original-source-a.example','prior-a','2026-11-03'),page('original-source-b.example','prior-b','2026-10-29')];
const discovered=[page('original-source-c.example','new-c','2026-11-08'),page('original-source-d.example','new-d','2026-11-07')];
test('new verified originals can complement previously approved saved news without another paid search',()=>{
 assert.equal(canSummarizeUsingApprovedCoverage(discovered,saved,now),true);
});
test('no fresh originals or only duplicates never bypass source discovery',()=>{
 assert.equal(canSummarizeUsingApprovedCoverage([],saved,now),false);
 assert.equal(canSummarizeUsingApprovedCoverage([...saved],saved,now),false);
 assert.equal(canSummarizeUsingApprovedCoverage([{...saved[0],originalUrl:saved[0].originalUrl+'?utm_source=somefeed'}],saved,now),false);
});
test('too few unique sources, stale originals and forged future dates fail closed',()=>{
 assert.equal(canSummarizeUsingApprovedCoverage(discovered.slice(0,1),saved.slice(0,1),now),false);
 assert.equal(canSummarizeUsingApprovedCoverage([page('c.example','c','2026-10-27')],saved,now),false);
 assert.equal(canSummarizeUsingApprovedCoverage([page('c.example','c','2026-12-05')],saved,now),false);
});
test('free-first handoff is shared and retains publisher-verification boundary',()=>{
 const s=fs.readFileSync(new URL('../marketIntelligenceService.ts',import.meta.url),'utf8');
 assert.match(s,/acceptedScheduledNews\(key,/);
 assert.match(s,/canSummarizeUsingApprovedCoverage\(independentlyVerified,approvedPublished/);
 assert.match(s,/verifyOtherCommodityArticles\(/);
 assert.match(s,/evaluateSavedNewsSummaries\(/);
});

// Regression: discovered originals and published cards have different types.
test('source metadata and saved articles have independently typed structures',()=>{
 const newOriginals=[{rawId:'candidate',rawTitle:'Source title',rawSnippet:'Original article body',originalUrl:'https://new-source.example/article',publishedAt:'2026-11-08'}];
 const savedCards=[{title:'Saved summary',summary:'Verified summary',sourceName:'Original source',originalUrl:'https://old-source.example/article',publishedAt:'2026-11-06'}];
 assert.equal(typeof canSummarizeUsingApprovedCoverage(newOriginals,savedCards,now),'boolean');
});
