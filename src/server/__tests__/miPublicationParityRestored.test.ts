import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {compareNewsContent,canonicalNewsUrl} from '../newsContentChanges.ts';

const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const manual=read('scripts/mi/local-news-refresh.mjs');
const scheduled=read('src/server/scheduledAi.ts');
const article=(slug:string,summary:string)=>({originalUrl:`https://example.invalid/news/${slug}`,title:'Synthetic commodity report',summary,publishedAt:'2026-01-01',sourceName:'Synthetic',sourceHeadline:'Synthetic headline'});

test('manual and scheduled checks use substantive comparison, not just unseen URLs',()=>{
 assert.match(manual,/const changes=compareNewsContent\(prior,selected\)/);
 assert.match(manual,/!selected\.length\s*\|\|\s*!changes\.hasNewContent/);
 assert.match(scheduled,/compareNewsContent\(prior,selected\)\.hasNewContent/);
 assert.doesNotMatch(manual,/selected\.some\(x=>!existing\.has\(x\.originalUrl\)\)/);
 assert.doesNotMatch(scheduled,/No verified candidate improves the current selection/);
});
test('scheduled path compares against saved publication when priorNews not provided',()=>{
 assert.match(scheduled,/readScheduledContent\('news-'\+id,root\)\?\.payload\?\.articles/);
});
test('a new, independently accepted summary for the same URL registers as update',()=>{
 const first=article('a','Initial grounded summary');
 const second={...first,summary:'Revised grounded summary'};
 const r=compareNewsContent([first],[second]);
 assert.equal(r.hasNewContent,true);
 assert.equal(r.added.length,0);
 assert.equal(r.updated.length,1);
});
test('order, timestamps of fetching, and removal alone are not new content',()=>{
 const a=article('a','Summary A'),b=article('b','Summary B');
 assert.equal(compareNewsContent([a,b],[b,a]).hasNewContent,false);
 assert.equal(compareNewsContent([a],[{...a,retrievedAt:'2026-01-02'}]).hasNewContent,false);
 assert.equal(compareNewsContent([a,b],[a]).hasNewContent,false);
});
test('article canonicalization removes tracking markers without collapsing substantive query filters',()=>{
 const a=canonicalNewsUrl({originalUrl:'https://example.invalid/news?category=wheat&utm_source=newsletter'});
 const b=canonicalNewsUrl({originalUrl:'https://example.invalid/news?category=corn'});
 assert.notEqual(a,b);
 assert.doesNotMatch(a,/utm_source/);
});
test('existing paid-call authorization and evidence checks remain in both paths',()=>{
 for(const req of ["approval !== 'YES'",'fs.existsSync(journalFile)','hasOutstandingPaidRequest()','maxCalls:2','acceptedScheduledNews','publishScheduledContent'])assert.ok(manual.includes(req),'missing manual safeguard: '+req);
 for(const req of ['hasOutstandingPaidRequest()','maxCalls:2','acceptedScheduledNews','publishScheduledContent','onReserve:','monthlyOperatingBudgetKrw'])assert.ok(scheduled.includes(req),'missing scheduled safeguard: '+req);
 assert.match(manual,/record\.updatedArticles=changes\.updated\.length/);
 assert.match(manual,/record\.newlyAcceptedArticles=changes\.added\.length/);
 assert.doesNotMatch(manual+scheduled,/CLOUD_MI_PUBLICATIONS|EXACT_VIEW_RESTORE|cloudArticleOverride/);
});
