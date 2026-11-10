import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';
import {adaptStep7ToRms} from '../soybean-rebuild/step7-rms-adapter.ts';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const source={id:'G001',grade:'A',title:'Bulletin',url:'https://agri.example.org/research/2026',date:'2026-10-31',excerpts:[{id:'G001-E1',text:'Production and deliveries have sufficient coverage',topic:'supply'}]};
const result={headline:'수급 기반 분할 구매 권고',marketOutlook:'생산량은 충분하지만 지역별 운송 차질을 고려해야 합니다.',procurementStrategy:'실수요를 중심으로 분할 구매를 검토합니다.',bullishFactors:[{text:'운송 차질',sourceIds:['G001']}],bearishFactors:[{text:'공급 충분',sourceIds:['G001']}],monitoringFactors:[{text:'인도 일정',sourceIds:['G001']}],sourceIds:['G001'],uncertainties:[],procurementRisk:{level:'안정',summary:'원문 확인된 공급량이 충분해 조달 위험은 안정적이지만 일부 배송 차질 가능성이 남습니다.',sourceIds:['G001']}};
const before=Object.fromEntries(['RMS_STEP7_LOCAL_PREVIEW','NODE_ENV','RMS_PUBLIC_READONLY'].map(k=>[k,process.env[k]]));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-step7-local-integration-'));
try{
 process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.NODE_ENV='development';process.env.RMS_PUBLIC_READONLY='0';
 for(const id of ids){
  await test('STEP7 risk preview for '+id,()=>{
   const d=id==='soybean'?path.join(temp,'.rms-soybean-rebuild'):path.join(temp,'.rms-research',id);fs.mkdirSync(d,{recursive:true});
   const payload=adaptStep7ToRms({stage:'final-market-outlook-and-procurement',status:'report-created',commodity:id,recordedAt:'2026-11-01T01:00:00Z',result},[source]).data;
   const p=path.join(d,`step7-rms-preview-${id}.json`);fs.writeFileSync(p,JSON.stringify({stage:'step7-local-ui-preview',approvedForPublication:false,commodity:id,data:payload}));
   const loaded=readStep7LocalPreview(id,'127.0.0.1',temp);
   assert.equal(loaded.rmsStep7Preview,true);
   assert.equal(loaded.procurementRiskPreview.level,'안정');
   assert.equal(loaded.procurementRiskPreview.commodityId,id);
   assert.equal(loaded.procurementRiskPreview.summarySentenceKo,result.procurementRisk.summary);
   assert.equal(readStep7LocalPreview(id,'192.0.2.99',temp),null);
   const bad={stage:'step7-local-ui-preview',approvedForPublication:false,commodity:id,data:{...payload,procurementRiskPreview:{...payload.procurementRiskPreview,commodityId:'invalid'}}};
   fs.writeFileSync(p,JSON.stringify(bad));
   assert.throws(()=>readStep7LocalPreview(id,'127.0.0.1',temp),/Malformed/);
  });
 }
 await test('production cannot read local previews',()=>{process.env.NODE_ENV='production';assert.equal(readStep7LocalPreview('corn','127.0.0.1',temp),null);});
}finally{
 for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 fs.rmSync(temp,{recursive:true,force:true});
}
