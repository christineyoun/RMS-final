// Static no-network regression tests for the pre-deployment local integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const scheduler=read('src/server/scheduledAi.ts');
const gateway=read('src/server/stage3DailyUpdates.ts');
const gemini=read('src/server/geminiApi.ts');
const ui=read('src/components/CommodityDetail.tsx');
const MI=read('src/server/marketIntelligenceService.ts');

test('scheduled paid job contains Market Intelligence NEWS only, no old AI analysis generation',()=>{
 assert.match(scheduler,/return ids\.map\(id=>\(\{id,kind:'news' as const\}\)\)/);
 assert.match(scheduler,/marketIntelligenceService\.getCommodityIntelligence\(id,true\)/);
 assert.doesNotMatch(scheduler,/getGroundedAiAnalysis\(/);
 assert.doesNotMatch(scheduler,/kind==='analysis'/);
});
test('old direct Gemini analysis and old supplemental strategy endpoint are retired',()=>{
 assert.doesNotMatch(gemini,/getGroundedAiAnalysis\(/);
 assert.match(gemini,/Legacy AI analysis disabled/);
 assert.match(gemini,/Legacy AI strategy retired/);
 assert.match(gemini,/statusCode = 410/);
});
test('STEP 7 is the only saved analysis route; no fallback to previous snapshots',()=>{
 assert.match(gateway,/if\(req\.method==='GET' && u\.pathname\.startsWith\('\/api\/ai-analysis\/'\)\)/);
 assert.match(gateway,/step7-not-configured/);
 assert.match(gateway,/awaiting-step7-preview/);
 assert.ok(gateway.indexOf('readStep7LocalPreview(id,req.socket.remoteAddress)') < gateway.indexOf('const scheduled=readScheduledContent(key)'));
 assert.match(gateway,/\s'\/api\/rms\/control\/standalone-analysis'/);
 assert.doesNotMatch(gateway,/runStandaloneAnalysis\(/);
});
test('SCM risk is shown only from STEP 7, without fetching old calculated risk',()=>{
 assert.match(ui,/const procurementRiskLevel=step7Risk\?\.level\|\|'갱신 대기'/);
 assert.match(ui,/const procurementRiskSummary=step7Risk\?\.summarySentenceKo/);
 assert.doesNotMatch(ui,/setSavedRisk|procurementRiskDisplayText|nonWheatRisk/);
 assert.match(ui,/scm-procurement-risk-card/);
});
test('Market Intelligence and independent source refresh remain available',()=>{
 assert.match(MI,/marketIntelligenceService/);
 assert.match(gemini,/\/api\/market-intelligence/);
 assert.match(read('server.ts'),/startFreeSourceScheduler\(\)/);
});
