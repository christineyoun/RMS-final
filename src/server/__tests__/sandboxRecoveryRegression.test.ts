/** Offline regression for the October 27 Tapioca replacement and reader recovery.
 * No provider, network, Cloud Storage or real RMS workspace writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {snapshotIssues} from '../mvpEvidence.ts';
import {analysisReplacementIssues} from '../analysisPublicationQuality.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-sandbox-regression-'));
const key='analysis-tapioca-starch';
const summary='2026년 타피오카전분 시장의 검증된 가격 자료와 공급·수요를 구분해 살피고, 구매에 영향을 주는 변화가 있는지 확인합니다. '.repeat(5);
const prior={success:true,data:{status:'live',generatedAt:'2026-10-20T00:46:32Z',
 executiveSummary:summary,deskRecommendation:'관측 자료와 후속 오퍼를 비교하십시오.',
 bullishFactors:['검증된 원료 수급상의 가격 지지 요인','후속 수확 일정 관련 공급 제약'],
 bearishFactors:['제한된 수요에 따른 추가 상승 억제','후속 공급 회복 가능성'],
 watchItems:['공식 발표에 따른 수확 변화 확인','실물 오퍼와 계약 시점 검토'],
 sources:[{title:'OFFLINE verified original',url:'https://example.org/offline-original'}]}};
const weak={success:true,data:{...prior.data,generatedAt:'2026-10-27T01:47:40Z',
 executiveSummary:'TTSA 10월 6일 695 USD/MT, 10월 20일 690 USD/MT. '.repeat(5),
 bullishFactors:[],bearishFactors:[],watchItems:[]}};

try{
 assert.deepEqual(snapshotIssues(key,prior),[]);
 assert(snapshotIssues(key,weak).includes('watchItems-empty'));
 assert(analysisReplacementIssues(weak.data,prior.data).length>0);
 assert.deepEqual(publishScheduledContent({[key]:prior},'offline-good',root).accepted,[key]);
 const before=readScheduledContent(key,root);assert(before);
 const firstHash=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8')).entries[key].sha256;
 assert.throws(()=>publishScheduledContent({[key]:weak},'offline-rejected',root),/not accepted/);
 assert.deepEqual(readScheduledContent(key,root),before,'rejection must retain the unchanged selected report');

 // Simulate a pre-fix published bad report: a correctly hashed immutable file
 // pointing to content that the *new* acceptance rules reject.
 const dir=path.join(root,'.rms-stage3');
 const bad=JSON.stringify({key,payload:weak,runId:'historical-weak',updatedAt:'2026-10-27T02:00:00Z',sourceStatus:'scheduled-verified'});
 const badHash=createHash('sha256').update(bad).digest('hex');
 fs.writeFileSync(path.join(dir,'snapshots/scheduled-content',badHash+'.json'),bad);
 const manifest=path.join(dir,'scheduled-content-current.json');
 fs.writeFileSync(manifest,JSON.stringify({version:1,runId:'historical-weak',entries:{[key]:{sha256:badHash}}}));
 const manifestBefore=fs.readFileSync(manifest);
 const recovered=readScheduledContent(key,root);
 assert.equal(recovered?.runId,'offline-good','read must recover the older accepted immutable analysis');
 assert.equal(recovered?.payload.data.generatedAt,prior.data.generatedAt,'old generation date must not be relabeled');
 assert.deepEqual(fs.readFileSync(manifest),manifestBefore,'read-time recovery must not modify active manifest');

 // Invalid or missing historical content is not silently fabricated.
 fs.unlinkSync(path.join(dir,'snapshots/scheduled-content',firstHash+'.json'));
 assert.equal(readScheduledContent(key,root),null,'no valid prior analysis means unavailable');

 // Four issues maximum; distinct commodities win over near-duplicate new stories.
 const date='2026-10-29',now=Date.parse('2026-10-30T00:00:00Z');
 const issue=(id:string,i:number,sourceName='Publisher A')=>({title:id+' original market report '+i,
  summary:'Published supply-and-demand development with direct procurement implications.',
  originalUrl:`https://example.org/${id}-${i}`,publishedAt:date,linkStatus:'verified',sourceName,sourceType:'news'});
 const overview=aggregateOverview([
  {id:'wheat',analysis:null,articles:[issue('wheat',1),issue('wheat',2),issue('wheat',3),issue('wheat',4)]},
  {id:'corn',analysis:null,articles:[issue('corn',1,'Publisher B')]},
  {id:'soybean',analysis:null,articles:[issue('soybean',1,'Publisher C')]},
  {id:'palm-oil',analysis:null,articles:[issue('palm-oil',1,'Publisher D')]}
 ],now);
 assert.equal(overview.issues.length,4);
 assert.equal(new Set(overview.issues.flatMap(x=>x.commodities)).size,4,'commodity coverage must beat duplicates');
 console.log('PASS sandbox: weak AI rejected, previous selection retained, historical invalid pointer recovered without mutation, no invented fallback, four diverse market issues. Paid calls: 0.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
