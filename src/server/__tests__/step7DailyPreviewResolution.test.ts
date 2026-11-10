import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readStep7LocalPreview} from '../step7LocalPreview.ts';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const makeReceipt=(id:string, summary:string)=>({
  stage:'step7-local-ui-preview',
  approvedForPublication:false,
  commodity:id,
  data:{
    rmsStep7Preview:true,status:'cached',
    deskRecommendation:'검증된 분석',executiveSummary:summary,
    purchaseActions:[],bullishFactors:[],bearishFactors:[],watchItems:[],
    sources:[{title:'Official publisher',url:'https://www.usda.gov/topics/farming'}]
  }
});
const write=(root:string,rel:string,receipt:unknown)=>{
  const target=path.join(root,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(receipt));
};
const setup=()=>{
  const saved={preview:process.env.RMS_STEP7_LOCAL_PREVIEW,
    production:process.env.NODE_ENV,readonly:process.env.RMS_PUBLIC_READONLY};
  process.env.RMS_STEP7_LOCAL_PREVIEW='1';
  process.env.NODE_ENV='test';
  delete process.env.RMS_PUBLIC_READONLY;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-step7-daily-'));
  return {root,finish:()=>{
    fs.rmSync(root,{recursive:true,force:true});
    for(const [key,old] of Object.entries({RMS_STEP7_LOCAL_PREVIEW:saved.preview,NODE_ENV:saved.production,RMS_PUBLIC_READONLY:saved.readonly})){
      if(old===undefined)delete process.env[key];
      else process.env[key]=old;
    }
  }};
};

test('all eight commodities load a valid saved STEP7 receipt from a dated daily directory',()=>{
  const {root,finish}=setup();
  try{
    for(const id of ids){
      const rel=path.join('.rms-research',id,'daily','2026-11-02',`step7-rms-preview-${id}.json`);
      write(root,rel,makeReceipt(id,`Daily saved ${id}`));
      assert.equal(readStep7LocalPreview(id,'127.0.0.1',root)?.executiveSummary,`Daily saved ${id}`,id);
    }
  }finally{finish();}
});

test('latest dated folder is preferred, but an existing direct saved preview remains authoritative',()=>{
  const {root,finish}=setup();
  try{
    const dir='.rms-research/palm-oil';
    const name='step7-rms-preview-palm-oil.json';
    write(root,path.join(dir,'daily/2026-11-01',name),makeReceipt('palm-oil','Old daily'));
    write(root,path.join(dir,'daily/2026-11-02',name),makeReceipt('palm-oil','New daily'));
    assert.equal(readStep7LocalPreview('palm-oil','::1',root)?.executiveSummary,'New daily');
    write(root,path.join(dir,name),makeReceipt('palm-oil','Direct saved'));
    assert.equal(readStep7LocalPreview('palm-oil','::1',root)?.executiveSummary,'Direct saved');
  }finally{finish();}
});

test('soybean daily preview supports legacy and research folders',()=>{
  const {root,finish}=setup();
  try{
    write(root,'.rms-research/soybean/daily/2026-11-02/step7-rms-preview-soybean.json',makeReceipt('soybean','Research saved'));
    assert.equal(readStep7LocalPreview('soybean','127.0.0.1',root)?.executiveSummary,'Research saved');
    write(root,'.rms-soybean-rebuild/daily/2026-11-02/step7-rms-preview-soybean.json',makeReceipt('soybean','Rebuild saved'));
    assert.equal(readStep7LocalPreview('soybean','127.0.0.1',root)?.executiveSummary,'Rebuild saved');
  }finally{finish();}
});

test('daily lookup cannot bypass owner-only mode, invalid commodity, or receipt validation',()=>{
  const {root,finish}=setup();
  try{
    const rel='.rms-research/palm-oil/daily/2026-11-02/step7-rms-preview-palm-oil.json';
    write(root,rel,makeReceipt('palm-oil','Verified'));
    assert.equal(readStep7LocalPreview('palm-oil','10.0.0.2',root),null);
    assert.equal(readStep7LocalPreview('unapproved','127.0.0.1',root),null);
    process.env.RMS_STEP7_LOCAL_PREVIEW='0';
    assert.equal(readStep7LocalPreview('palm-oil','127.0.0.1',root),null);
    process.env.RMS_STEP7_LOCAL_PREVIEW='1';
    write(root,rel,{...makeReceipt('soybean','Wrong commodity')});
    assert.throws(()=>readStep7LocalPreview('palm-oil','127.0.0.1',root),/Malformed local STEP7 preview receipt/);
  }finally{finish();}
});
