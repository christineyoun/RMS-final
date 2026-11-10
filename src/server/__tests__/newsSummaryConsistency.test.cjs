'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'server/newsSummaryConsistency.ts'),'utf8');
const integration=fs.readFileSync(path.join(root,'server/marketIntelligenceService.ts'),'utf8');

test('all eight commodities share one evidence-first, soft editorial standard',()=>{
 assert.match(source,/all commodities/i);
 assert.match(source,/2–4 information-rich sentences/);
 assert.match(source,/200–300 Korean characters/);
 assert.match(source,/NOT a minimum\/maximum/);
 assert.match(source,/Do not pad a thin source/);
 assert.match(source,/do not remove essential supported facts/i);
 assert.match(source,/NEVER reject or mutate verified news based on length/);
 assert.match(integration,/\$\{NEWS_SUMMARY_EDITORIAL_GUIDANCE\}/);
});

test('existing verified-source gating, paid budget and selection stay in place',()=>{
 assert.match(integration,/newsSourceBindingIssue\(/);
 assert.match(integration,/evaluateSavedNewsSummaries\(/);
 assert.match(integration,/planNewsSummaryRepair\(/);
 assert.match(integration,/selectProcurementNews\(/);
 assert.match(integration,/getStage3RunContext\(/);
 assert.match(integration,/\$\{JSON\.stringify\(/);
});

test('no article text, source URL, or dated market facts are embedded in guidance',()=>{
 assert.doesNotMatch(source, /https?:\/\//);
 assert.doesNotMatch(source, /2026|2025|2027/);
 assert.doesNotMatch(source, /AHDB|Commodity Board|MPOB|TTSA|USDA/);
});
