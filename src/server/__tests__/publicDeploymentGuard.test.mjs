import test from 'node:test';
import assert from 'node:assert/strict';
import {denyPublicRequest,publicDeploymentGuard} from '../publicDeploymentGuard.mjs';

for (const url of ['/', '/assets/app.js', '/api/health', '/api/market-intelligence?commodity=wheat',
  '/api/ai-analysis/potato-starch','/api/overview/comparison','/api/rms/refresh-status','/api/pipeline/telemetry','/api/rms/free-publication','/api/rms/saved-market-data','/api/usda/corn?marketYear=2025']) {
  test('allow passive '+url, () => assert.equal(denyPublicRequest('GET',url),null));
}
for (const [method,url] of [
  ['POST','/api/rms/palm/free-refresh'],
  ['POST','/api/gemini/live-market-data'],
  ['POST','/api/rms/control/standalone-analysis'],
  ['GET','/api/rms/origin-radar-all?commodity=corn&force=true'],
  ['GET','/api/market-intelligence?forceRefresh=false'],
  ['GET','/api/ai-analysis/wheat?force=true'],
  ['GET','/api/origins/live?commodity=wheat'],
  ['POST','/api/rms/saved-market-data'],
  ['GET','/api/rms/free-publication?admin=false'],
  ['GET','/api/history?commodity=corn&timeframe=6M&force=false'],
  ['GET','/api/gemini/live-market-data'],
  ['GET','/api/market-data/refresh'],
  ['GET','/api/scm/live-market-issues'],
  ['GET','/api/ai-analysis/not-a-commodity'],
  ['GET','/api/ai-analysis/%77heat'],
]) {
  test('block '+method+' '+url,()=>assert.notEqual(denyPublicRequest(method,url),null));
}
test('middleware returns 403 without invoking next',()=>{
  let nextCount=0,code=0,body;
  const res={setHeader(){},status(n){code=n;return this;},json(v){body=v;return this;}};
  publicDeploymentGuard({method:'POST',originalUrl:'/api/rms/palm/free-refresh'},res,()=>{nextCount++});
  assert.equal(code,403);assert.equal(nextCount,0);assert.equal(body.success,false);
});
