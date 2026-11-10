import assert from 'node:assert/strict';
import test from 'node:test';
import {structuredArticleDate} from '../newsStructuredArticleDate.ts';
const h='Soybean oil exports rise after new industry report';
const article=(overrides={})=>JSON.stringify({'@context':'https://schema.org','@type':'NewsArticle',headline:h,datePublished:'2026-11-08',...overrides});
test('accept original publisher news schema when headline is matched',()=>assert.equal(structuredArticleDate({scripts:[article()],headline:h}),'2026-11-08'));
test('reject chart WebPage and Product schemas',()=>assert.equal(structuredArticleDate({scripts:[article({'@type':'WebPage'})],headline:h}),''));
test('reject different story metadata',()=>assert.equal(structuredArticleDate({scripts:[article({headline:'Unrelated technology report has little in common'})],headline:h}),''));
test('reject future-invalid calendar dates and contradictory article dates',()=>{
 assert.equal(structuredArticleDate({scripts:[article({datePublished:'2026-02-30'})],headline:h}), '');
 assert.equal(structuredArticleDate({scripts:[article(),article({datePublished:'2026-11-07'})],headline:h}), '');
});
test('find graph article and ignore malformed scripts',()=>assert.equal(structuredArticleDate({scripts:['bad',JSON.stringify({'@graph':[{'@type':'WebPage'},JSON.parse(article())]})],headline:h}),'2026-11-08'));
