import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {acceptedScheduledNews,readScheduledContent,publishScheduledContent} from '../scheduledContent.ts';

const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function story(i:number){
 const originalUrl=`https://independent-${i}.example.org/grain-market-report`;
 const sourceHeadline=`Corn export and supply market development ${i}`;
 return {originalUrl,publishedAt:today,sourceHeadline,sourceName:`Publisher ${i}`,sourceType:'news',
  title:`옥수수 공급 및 수출 시장 변화 ${i}`,summary:'옥수수 수출 여건이 개선되고 물류 수요가 증가하면서 선적과 공급 전망에 변화가 나타났습니다. 수급과 운임 변화를 확인하며 구매 조건을 비교할 필요가 있습니다.',
  linkStatus:'verified',unavailable:false,verifiedSourceEvidence:{originalUrl,publishedAt:today,sourceHeadline,
   excerpt:`Corn exports and supply have increased amid changing market demand and freight availability. Market price and supply developments ${i}.`,verifiedAt:new Date().toISOString()}};
}
function writeSnapshot(root:string,key:string,articles:any[]){
 const dir=path.join(root,'.rms-stage3','snapshots','scheduled-content');fs.mkdirSync(dir,{recursive:true});
 const bytes=JSON.stringify({key,payload:{success:true,articles},runId:'offline-test',updatedAt:new Date().toISOString()});
 const digest=createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(dir,digest+'.json'),bytes);return digest;
}
test('reconciles historical verified coverage from a reduced manifest without fixed snapshot IDs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-reconcile-'));
 try{
  const key='news-corn',all=[story(1),story(2),story(3),story(4)];
  assert.equal(acceptedScheduledNews('corn',all).length,4,'fixtures must satisfy real evidence gates');
  writeSnapshot(root,key,all);
  const twoHash=writeSnapshot(root,key,all.slice(0,2));
  const manifestPath=path.join(root,'.rms-stage3','scheduled-content-current.json');
  fs.writeFileSync(manifestPath,JSON.stringify({version:1,entries:{[key]:{sha256:twoHash}}}));
  assert.equal(readScheduledContent(key,root)?.payload?.articles?.length,2);
  const result=publishScheduledContent({[key]:{success:true,articles:[]}},'offline-reconcile',root);
  assert.deepEqual(result.accepted,[key]);
  const restored=readScheduledContent(key,root)?.payload?.articles||[];
  assert.equal(restored.length,4);
  assert.equal(publishScheduledContent({[key]:{success:true,articles:[]}},'no-op',root).accepted.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('lock fails closed without replacing another writer or touching manifest',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-lock-'));
 try{
  const stage=path.join(root,'.rms-stage3'),lock=path.join(stage,'scheduled-content-current.lock');
  fs.mkdirSync(lock,{recursive:true});
  assert.throws(()=>publishScheduledContent({},'offline-locked',root),/locked/);
  assert(fs.existsSync(lock));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
