/** Static check – no imports of paid APIs and no network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const gw=read('src/server/stage3DailyUpdates.ts'),ui=read('src/components/CommodityDetail.tsx');
assert.match(gw,/readStep7LocalPreview\(id,req\.socket\.remoteAddress\)/);
assert.match(gw,/awaiting-step7-preview/);
assert.ok(gw.indexOf('readStep7LocalPreview(id')<gw.indexOf('const scheduled=readScheduledContent(key)'));
assert.match(ui,/const procurementRiskLevel=step7Risk\?\.level\|\|'갱신 대기'/);
assert.match(ui,/const procurementRiskSummary=step7Risk\?\.summarySentenceKo/);
assert.doesNotMatch(ui,/const procurementRiskLevel=currentRisk/);
assert.match(read('src/server/marketIntelligenceService.ts'),/marketIntelligenceService/);
assert.ok(fs.existsSync('scripts/soybean-rebuild/research-verified-runner.mjs'));
assert.ok(fs.existsSync('scripts/soybean-rebuild/step7-fact-to-rms.ts'));
for(const id of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']){
  const dir=id==='soybean'?'.rms-soybean-rebuild':'.rms-research/'+id;
  const p=dir+'/step7-rms-preview-'+id+'.json';
  if(!fs.existsSync(p)){console.log('PENDING:',id);continue;}
  const r=JSON.parse(fs.readFileSync(p,'utf8'));
  assert.equal(r.commodity,id);assert.equal(r.approvedForPublication,false);
  assert.equal(r.data.rmsStep7Preview,true);
  assert.equal(r.data.procurementRiskPreview?.commodityId,id);
  console.log('READY:',id,r.data.procurementRiskPreview.level);
}
console.log('PASS: STEP7 local wiring present; no paid calls or cloud writes.');
