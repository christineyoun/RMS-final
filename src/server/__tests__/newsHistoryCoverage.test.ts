import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readVerifiedNewsHistory,recoverVerifiedNewsCoverage} from '../newsHistoryCoverage.ts';
import {acceptedScheduledNews} from '../scheduledContent.ts';

const now=new Date('2026-11-06T05:00:00Z');
const day='2026-11-03';
const summary='옥수수 수출 여건이 개선되고 물류 수요가 증가하면서 선적과 공급 전망에 변화가 나타났습니다. 수급과 운임 변화를 확인하며 구매 조건을 비교할 필요가 있습니다.';
function story(id:string,date=day){
 const originalUrl=`https://verified-source-${id}.example.org/market-update`;
 const sourceHeadline=`Corn supply and exports market development ${id}`;
 return {title:`옥수수 수출·공급 여건 변화 보고 ${id}`,sourceHeadline,sourceName:`OFFLINE TEST ${id}`,sourceType:'news',
  originalUrl,publishedAt:date,summary,linkStatus:'verified',unavailable:false,
  verifiedSourceEvidence:{originalUrl,publishedAt:date,sourceHeadline,
   excerpt:`Corn exports and supply have increased amid changing market demand and freight availability in the current trading period. Market price and supply developments ${id}.`,
   verifiedAt:'2026-11-05T00:00:00Z'}};
}
function save(root:string,key:string,articles:any[],corrupt=false){
 const dir=path.join(root,'.rms-stage3','snapshots','scheduled-content');
 fs.mkdirSync(dir,{recursive:true});
 const content=Buffer.from(JSON.stringify({key,payload:{success:true,articles},runId:'OFFLINE-TEST'}));
 const sha=createHash('sha256').update(content).digest('hex');
 const filename=path.join(dir,sha+'.json');
 fs.writeFileSync(filename,corrupt?Buffer.from('tampered'):content);
 return filename;
}

test('recover four independently verified distinct articles from immutable prior publications, preserving new article',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-history-'));
 const saved=[story('old-a'),story('old-b'),story('old-c')];
 try{
  const fresh=story('new','2026-11-05');
  assert.equal(acceptedScheduledNews('corn',[fresh,...saved]).length,4,'test originals must pass current factual/evidence gates');
  save(root,'news-corn',saved);
  const output=recoverVerifiedNewsCoverage('corn',[fresh],root,now);
  assert.equal(output.length,4);
  assert(output.some(a=>a.originalUrl===fresh.originalUrl),'fresh article must not be displaced by history');
  for(const a of saved)assert(output.some(b=>b.originalUrl===a.originalUrl));
  assert.equal(recoverVerifiedNewsCoverage('corn',output,root,now).length,4);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('reject tampered, cross-commodity, receipt-mismatched, and expired saved articles; never invent a fourth',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-history-failclosed-'));
 try{
  const good=story('good'),bad={...story('mismatch'),verifiedSourceEvidence:{...story('mismatch').verifiedSourceEvidence,originalUrl:'https://different.example.org/'}},
   stale=story('expired','2026-09-01');
  save(root,'news-corn',[good,bad,stale]);
  save(root,'news-wheat',[story('not-corn')]);
  save(root,'news-corn',[story('tampered')],true);
  const accepted=readVerifiedNewsHistory('corn',root,now);
  assert.deepEqual(accepted.map(a=>a.originalUrl),[good.originalUrl]);
  const output=recoverVerifiedNewsCoverage('corn',[],root,now);
  assert.equal(output.length,1);
  assert.equal(recoverVerifiedNewsCoverage('wheat',[],root,now).length,0);
  assert.equal(recoverVerifiedNewsCoverage('unknown-commodity',[],root,now).length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('history recovery is read-only, offline and never changes source files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-history-readonly-'));
 const oldFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No network calls allowed');};
 try{
  const file=save(root,'news-corn',[story('source-a')]);
  const before=fs.readFileSync(file);
  const result=recoverVerifiedNewsCoverage('corn',[],root,now);
  assert.equal(result.length,1);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;fs.rmSync(root,{recursive:true,force:true});}
});
