import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {adaptStep7ToRms,advisoryWarnings,safePublisherOriginal} from './step7-rms-adapter.ts';
import type {FinalResult,EvidenceSource} from './step7-core.ts';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';

const sample:FinalResult={
  headline:'수급 약보합, 조건부 매수',marketOutlook:'생산량은 123만 톤으로 전망됩니다. 실제 실적은 미확정입니다.',
  procurementStrategy:'공급 확대가 지속되면 분할 협상을 검토하고, 기상 악화 시 납기를 우선 확인합니다.',
  bullishFactors:[{text:'수출 수요 증가',sourceIds:['G100']}],
  bearishFactors:[{text:'생산 증가 전망',sourceIds:['G001']}],
  monitoringFactors:[{text:'기상 변화가 실물 계약에 미치는 영향',sourceIds:['G100']}],
  sourceIds:['G001','G100'],uncertainties:['기상 영향 불확실'],
};
const sources:EvidenceSource[]=[
  {id:'G001',grade:'A',title:'Official crop outlook',url:'https://www.usda.gov/reports/soy',citationUrl:null,date:null,excerpts:[]},
  {id:'G100',grade:'B',title:'Market commentary',url:'https://example-ag.com/crop/market',citationUrl:'https://vertexaisearch.cloud.google.com/redirect',date:null,excerpts:[]},
  {id:'G101',grade:'EXCLUDED',title:'Unrelated',url:'https://publisher.org/anything',citationUrl:null,date:null,excerpts:[]},
];
const report={stage:'final-market-outlook-and-procurement',status:'report-created',commodity:'soybean',recordedAt:'2026-10-30T09:54:16.416Z',model:'gemini-3.8-flash',result:sample};

test('converts STEP7 into existing card slots and hides uncertainties field',()=>{
  const {data,warnings}=adaptStep7ToRms(report,sources);
  assert.equal(data.deskRecommendation,sample.headline);
  assert.equal(data.executiveSummary,sample.marketOutlook);
  assert.deepEqual(data.purchaseActions,[sample.procurementStrategy]);
  assert.deepEqual(data.watchItems,[sample.monitoringFactors[0].text]);
  assert.equal(data.sources.length,2);assert.equal(warnings.length,0);
  assert.ok(!('uncertainties' in data));
  assert.equal(data.status,'cached');assert.equal(data.rmsStep7Preview,true);
});

test('source IDs cannot be invented, B sources preserved if original present',()=>{
  const q=structuredClone(report);q.result.bullishFactors[0].sourceIds=['G999'];
  assert.throws(()=>adaptStep7ToRms(q,sources),/source\/length audit failed/);
  const {data}=adaptStep7ToRms(report,sources);
  assert.ok(data.sources.find(s=>s.url==='https://example-ag.com/crop/market'));
  assert.ok(!data.sources.find(s=>s.url?.includes('vertexaisearch')));
  assert.ok(!data.sources.find(s=>s.url?.includes('publisher.org')));
});

test('no invented website, no localhost, no GOOGLE relay, no excluded source',()=>{
  assert.equal(safePublisherOriginal('https://vertexaisearch.cloud.google.com/link'),false);
  assert.equal(safePublisherOriginal('http://www.usda.gov/report'),false);
  assert.equal(safePublisherOriginal('https://127.0.0.1/secret'),false);
  assert.equal(safePublisherOriginal('https://www.usda.gov/reports/a'),true);
  assert.throws(()=>adaptStep7ToRms(report,[{...sources[0],url:null},{...sources[1],url:null},sources[2]]),/No cited publisher original/);
});

test('price and percentage buying thresholds are REVIEW FLAGS, not invented replacements',()=>{
  const q=structuredClone(sample);
  q.procurementStrategy='1,230~1,250센트에서 소요량 50~60% 매수 권고.';
  const flags=advisoryWarnings(q);
  assert.ok(flags.some(s=>s.includes('비중')));
  assert.ok(flags.some(s=>s.includes('가격')));
  assert.equal(sample.procurementStrategy,'공급 확대가 지속되면 분할 협상을 검토하고, 기상 악화 시 납기를 우선 확인합니다.');
});

test('only loopback, explicit opt-in, non-production can display; never saved publication',()=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'rms-step7-local-'));
  const dir=path.join(cwd,'.rms-soybean-rebuild');fs.mkdirSync(dir);
  const old=Object.fromEntries(['RMS_STEP7_LOCAL_PREVIEW','NODE_ENV','RMS_PUBLIC_READONLY'].map(k=>[k,process.env[k]]));
  try{
    const data=adaptStep7ToRms(report,sources).data;
    fs.writeFileSync(path.join(dir,'step7-rms-preview-soybean.json'),JSON.stringify({stage:'step7-local-ui-preview',approvedForPublication:false,commodity:'soybean',data}));
    process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.NODE_ENV='development';delete process.env.RMS_PUBLIC_READONLY;
    assert.deepEqual(readStep7LocalPreview('soybean','127.0.0.1',cwd),data);
    assert.equal(readStep7LocalPreview('soybean','10.0.0.9',cwd),null);
    assert.equal(readStep7LocalPreview('corn','127.0.0.1',cwd),null);
    process.env.NODE_ENV='production';assert.equal(readStep7LocalPreview('soybean','127.0.0.1',cwd),null);
    process.env.NODE_ENV='development';process.env.RMS_PUBLIC_READONLY='1';assert.equal(readStep7LocalPreview('soybean','127.0.0.1',cwd),null);
    delete process.env.RMS_PUBLIC_READONLY;delete process.env.RMS_STEP7_LOCAL_PREVIEW;
    assert.equal(readStep7LocalPreview('soybean','127.0.0.1',cwd),null);
  }finally{
    for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    fs.rmSync(cwd,{recursive:true,force:true});
  }
});

test('common prompt includes numerical discipline and reuse of existing monitoring area',async()=>{
 const fs=await import('node:fs');
 const text=fs.readFileSync(path.join(import.meta.dirname,'step7-core.ts'),'utf8');
 assert.match(text,/Never invent numerical purchase percentages/);
 assert.match(text,/monitoringFactors list, not a new UI section/);
 assert.doesNotMatch(text,/Use a soybean-specific/);
});
