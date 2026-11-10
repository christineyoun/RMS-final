// RMS-STEP7-WEEKDAY-20261109
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readStep7LocalPreview} from '../step7LocalPreview.ts';
const id='wheat';
const pub='https://www.usda.gov/topics/farming';
const receipt=(generatedAt:string,withRisk:boolean,summary:string)=>({
 stage:'step7-local-ui-preview',approvedForPublication:false,commodity:id,
 data:{rmsStep7Preview:true,status:'cached',generatedAt,deskRecommendation:'Evidence-backed',executiveSummary:summary,
 purchaseActions:[],bullishFactors:[],bearishFactors:[],watchItems:[],sources:[{title:'Publisher',url:pub}],
 ...(withRisk?{procurementRiskPreview:{commodityId:id,level:'주의',summarySentenceKo:'Evidence-backed risk',
 evidence:[{url:pub,source:'Publisher',date:'2026-11-09',text:'Publisher excerpt'}]}}:{})}
});
function exercise(fn:(root:string)=>void){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-newest-step7-'));
 const old={...process.env};
 try{process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.NODE_ENV='test';delete process.env.RMS_PUBLIC_READONLY;fn(root)}
 finally{fs.rmSync(root,{recursive:true,force:true});process.env.RMS_STEP7_LOCAL_PREVIEW=old.RMS_STEP7_LOCAL_PREVIEW||'';
 if(old.NODE_ENV===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old.NODE_ENV;
 if(old.RMS_PUBLIC_READONLY===undefined)delete process.env.RMS_PUBLIC_READONLY;else process.env.RMS_PUBLIC_READONLY=old.RMS_PUBLIC_READONLY;}
}
function save(root:string,rel:string,obj:unknown){const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(obj));}
test('newest generated risk-bearing STEP7 wins over old root and misleading directory name',()=>exercise(root=>{
 const base='.rms-research/wheat',name='step7-rms-preview-wheat.json';
 save(root,path.join(base,name),receipt('2026-11-01T08:00:00Z',true,'Old root'));
 save(root,path.join(base,'daily/2026-11-02',name),receipt('2026-11-09T01:00:00Z',true,'New generated analysis'));
 assert.equal(readStep7LocalPreview(id,'127.0.0.1',root)?.executiveSummary,'New generated analysis');
}));
test('newer riskless report never overrides older complete risk-bearing report',()=>exercise(root=>{
 const base='.rms-research/wheat',name='step7-rms-preview-wheat.json';
 save(root,path.join(base,name),receipt('2026-11-08T08:00:00Z',true,'Complete'));
 save(root,path.join(base,'daily/2026-11-09',name),receipt('2026-11-09T08:00:00Z',false,'Missing risk'));
 assert.equal(readStep7LocalPreview(id,'127.0.0.1',root)?.executiveSummary,'Complete');
}));
test('newest complete market-only is used when no risk-bearing output exists',()=>exercise(root=>{
 const base='.rms-research/wheat',name='step7-rms-preview-wheat.json';
 save(root,path.join(base,name),receipt('2026-11-01T08:00:00Z',false,'Old'));
 save(root,path.join(base,'daily/2026-11-09',name),receipt('2026-11-09T08:00:00Z',false,'New'));
 assert.equal(readStep7LocalPreview(id,'127.0.0.1',root)?.executiveSummary,'New');
}));
