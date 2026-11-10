import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const srcDir=process.env.TEST_ROOT || process.cwd();
const root=srcDir+'/scripts/soybean-rebuild/';
const {parseFinalResult,buildFinalPrompt,renderFinal,auditFinalResult}=await import(pathToFileURL(root+'step7-core.ts'));
const {adaptStep7ToRms}=await import(pathToFileURL(root+'step7-rms-adapter.ts'));
const {readStep7LocalPreview}=await import(pathToFileURL(srcDir+'/src/server/step7LocalPreview.ts'));
const commodities=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const source={id:'G001',grade:'A',title:'Production release',url:'https://publisher.org/reports/2026',citationUrl:null,date:'2026-10-30',excerpts:[{id:'E001',text:'A production report supports the supply assessment.',topic:'production'}]};
const bsource={id:'G002',grade:'B',title:'Inaccessible publisher',url:'https://publisher.org/another/2026',citationUrl:null,date:null,excerpts:[]};
const report={headline:'수급 전망과 분할 조달',marketOutlook:'원료 공급과 가격에 관한 시장전망입니다.',procurementStrategy:'공급 상황에 따라 분할 조달합니다.',bullishFactors:[{text:'작황 악화',sourceIds:['G001']}],bearishFactors:[{text:'이월 재고',sourceIds:['G001']}],monitoringFactors:[{text:'재배면적',sourceIds:['G002']}],sourceIds:['G001'],uncertainties:['수율 미확인']};
const saved=(commodity,result)=>({stage:'final-market-outlook-and-procurement',status:'report-created',commodity,recordedAt:'2026-10-31T10:05:00Z',result});
const risk={level:'주의',summary:'원료 작황이 악화되어 공급 차질 우려가 있으나 이월 재고가 단기 부담을 일부 완충하며 실제 출하량과 납기는 추가 확인이 필요합니다.',sourceIds:['G001']};
const parsed=(x)=>parseFinalResult(JSON.stringify(x));
for(const commodity of commodities){
  test('legacy output unchanged and new AI risk displays for '+commodity,()=>{
    const legacy=adaptStep7ToRms(saved(commodity,parsed(report)),[source,bsource]);
    assert.equal(legacy.data.deskRecommendation,report.headline);
    assert.equal(legacy.data.executiveSummary,report.marketOutlook);
    assert.equal(legacy.data.purchaseActions[0],report.procurementStrategy);
    assert.equal(legacy.data.procurementRiskPreview,undefined); // old output not inferred
    const got=adaptStep7ToRms(saved(commodity,parsed({...report,procurementRisk:risk})),[source,bsource]);
    assert.equal(got.data.procurementRiskPreview.level,'주의');
    assert.equal(got.data.procurementRiskPreview.commodityId,commodity);
    assert.equal(got.data.procurementRiskPreview.summarySentenceKo,risk.summary);
    assert.equal(got.data.procurementRiskPreview.evidence[0].url,source.url);
    assert.deepEqual(got.data.purchaseActions,legacy.data.purchaseActions);
  });
}
test('existing STEP7 primary JSON parsing unaffected by malformed optional risk',()=>{
 for(const bad of [{level:'unknown',summary:'description',sourceIds:['G001']},
   {level:'주의',summary:'A'.repeat(121),sourceIds:['G001']},
   {level:'주의',summary:'sample',sourceIds:'G001'}]){
  const p=parsed({...report,procurementRisk:bad});assert(p);assert.equal(p.procurementRisk,undefined);
  const adapted=adaptStep7ToRms(saved('soybean',p),[source,bsource]);assert.equal(adapted.data.purchaseActions[0],report.procurementStrategy);
 }
});
test('invalid source IDs or B-only sources cannot make a Gemini risk card',()=>{
 const bad=adaptStep7ToRms(saved('soybean',parsed({...report,procurementRisk:{...risk,sourceIds:['G999']}})),[source,bsource]);
 assert.equal(bad.data.procurementRiskPreview,undefined);assert(bad.warnings.some(s=>s.includes('ID')));
 const b=adaptStep7ToRms(saved('soybean',parsed({...report,procurementRisk:{...risk,sourceIds:['G002']}})),[source,bsource]);
 assert.equal(b.data.procurementRiskPreview,undefined);assert(b.warnings.some(s=>s.includes('A등급')));
});
test('unsupported A text and no excerpt does not cause forced risk assessment',()=>{
 const no={...source,excerpts:[]};const x=adaptStep7ToRms(saved('soybean',parsed({...report,procurementRisk:risk})),[no,bsource]);
 assert.equal(x.data.procurementRiskPreview,undefined);
});
test('source used only by risk is added to footer links',()=>{
 const x={...source,id:'G003',url:'https://publisher.org/report/extra'};
 const z=adaptStep7ToRms(saved('soybean',parsed({...report,procurementRisk:{...risk,sourceIds:['G003']}})),[source,bsource,x]);
 assert(z.data.sources.some(s=>s.url===x.url));
});
test('explicit unknown risk can be shown but will never invent evidence',()=>{
 const p=parsed({...report,procurementRisk:{level:'판정 보류',summary:'현재 검증된 공급 자료가 충분하지 않아 조달 위험 판단을 보류합니다.',sourceIds:[]}});
 const result=adaptStep7ToRms(saved('soybean',p),[source,bsource]);
 assert.equal(result.data.procurementRiskPreview.level,'판정 보류');assert.deepEqual(result.data.procurementRiskPreview.evidence,[]);
});
test('prompt retains original guardrails and adds only same-call risk field',()=>{
 const core=fs.readFileSync(root+'step7-core.ts','utf8');
 assert.match(core,/Never invent numerical purchase percentages/);
 assert.match(core,/There is NO new uncertainty card/);
 assert.match(core,/"procurementRisk":/);
 assert.match(core,/Produce it in the SAME synthesis call/);
 const prompt=buildFinalPrompt({date:'2026-10-31',commodity:'palm-oil',counts:{},priorFindings:[],decision:{},sources:[]});
 assert.match(prompt,/palm-oil/);assert.match(prompt,/procurementRisk/);
});
test('report rendering keeps legacy text untouched and appends risk text on new report',()=>{
 const data={route:'stop-after-round1',counts:{sources:1,excerpts:1}};
 const old=renderFinal(data,parsed(report)),next=renderFinal(data,parsed({...report,procurementRisk:risk}));
 assert(old.includes('## 상승 요인'));assert(!old.includes('## 조달 리스크'));
 assert(next.includes('## 조달 리스크'));assert(next.includes(risk.summary));
});
test('receipt read allowed only local and rejects forged risk',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'step7-ai-'));
 const old=Object.fromEntries(['RMS_STEP7_LOCAL_PREVIEW','NODE_ENV','RMS_PUBLIC_READONLY'].map(k=>[k,process.env[k]]));
 try{
 const dir=path.join(tmp,'.rms-research','potato-starch');fs.mkdirSync(dir,{recursive:true});
 const data=adaptStep7ToRms(saved('potato-starch',parsed({...report,procurementRisk:risk})),[source,bsource]).data;
 const p=path.join(dir,'step7-rms-preview-potato-starch.json');
 const receipt={stage:'step7-local-ui-preview',approvedForPublication:false,commodity:'potato-starch',data};
 fs.writeFileSync(p,JSON.stringify(receipt));
 process.env.NODE_ENV='development';process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.RMS_PUBLIC_READONLY='0';
 assert.equal(readStep7LocalPreview('potato-starch','127.0.0.1',tmp).procurementRiskPreview.level,'주의');
 assert.equal(readStep7LocalPreview('potato-starch','192.168.0.3',tmp),null);
 process.env.NODE_ENV='production';assert.equal(readStep7LocalPreview('potato-starch','127.0.0.1',tmp),null);
 process.env.NODE_ENV='development';
 fs.writeFileSync(p,JSON.stringify({...receipt,data:{...data,procurementRiskPreview:{...data.procurementRiskPreview,commodityId:'wheat'}}}));
 assert.throws(()=>readStep7LocalPreview('potato-starch','127.0.0.1',tmp),/Malformed/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('STEP7 SCM risk unconditionally replaces old SCM grading in the same strip',()=>{
 const c=fs.readFileSync(srcDir+'/src/components/CommodityDetail.tsx','utf8');
 assert(c.includes('const procurementRiskLevel=step7Risk?.level'));
 assert(c.includes('const procurementRiskSummary=step7Risk?.summarySentenceKo'));
 assert(!c.includes('riskRank[localStep7Risk.level]'));
 assert(c.includes('id="scm-procurement-risk-card"'));
});
