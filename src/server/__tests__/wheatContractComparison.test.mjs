import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {parseWheatContractTable,wheatContractCode} from '../wheatContractTable.ts';
import {mergePublishedWheatReport,buildWheatMetrics,toChartPoints,loadWheatHistory,saveWheatHistory} from '../wheatPriceHistoryStore.ts';
import {extractWheatContractTable,wheatPdfReceipt,persistWheatPdfReceipt,verifiedComparison,fillWheatComparisons} from '../wheatContractEvidence.ts';
const root=process.env.RMS_WHEAT_PDF_FIXTURES;
const expected=[[-2.43,-7.14],[.47,-5.11],[.51,-2.35]];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixtures=()=>JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).records.sort((a,b)=>a.point.date.localeCompare(b.point.date));
const fromCoords=r=>parseWheatContractTable(JSON.parse(fs.readFileSync(path.join(root,r.filename.replace('.pdf','.json')))),r.point.date);
function build(records,tables){
 let h={version:1,points:[]};
 for(const [i,r] of records.entries()){
  const t=tables[i];assert(t,'Settlement table missing: '+r.filename);
  assert.deepEqual([t.front.srwMt,t.front.hrwMt,t.front.hrsMt],[r.point.srwMt,r.point.hrwMt,r.point.hrsMt]);
  assert.equal(t.front.code,wheatContractCode(r.point.date,r.point.contractMonth));
  h=mergePublishedWheatReport(h,{...t.front,date:r.point.date,contractMonth:r.point.contractMonth,sourceUrl:r.source},new Date('2026-11-25T00:00Z')).history;
 }
 return h;
}
function compare(records,tables,h){
 const latest=h.points.at(-1);
 return records.slice(0,2).map((r,i)=>{
  const p=h.points[i],q=verifiedComparison(tables[i],p,latest);assert(q,'No verified secondary contract');
  const bytes=fs.readFileSync(path.join(root,r.filename));assert.equal(sha(bytes),r.sha256);
  const e=wheatPdfReceipt(bytes,r.source,200);assert.equal(e.receiptSha256,r.sha256);assert.equal(sha(Buffer.from(e.receipt.pdfBase64,'base64')),r.sha256);
  return {...q,frontCode:tables[i].front.code,frontMt:[p.srwMt,p.hrwMt,p.hrsMt],sourceUrl:r.source,receiptPath:e.receiptPath,receiptSha256:e.receiptSha256};
 });
}
const changes=m=>Object.values(m).map(v=>[v.wowChangePct,v.momChangePct]);
test('contract code distinguishes years and rolls across December',()=>{
 assert.equal(wheatContractCode('2026-11-20','March'),'H27');assert.equal(wheatContractCode('2027-11-20','March'),'H28');assert.equal(wheatContractCode('2027-03-01','March'),'H27');assert.equal(wheatContractCode('2027-02-30','March'),null);
});
test('no cross-contract percentages when no verified comparison',()=>{
 const p=[{date:'2026-11-13',contractMonth:'December',provenance:'source-verified',srwMt:218,hrwMt:231,hrsMt:230},{date:'2026-11-20',contractMonth:'March',provenance:'source-verified',srwMt:217,hrwMt:235,hrsMt:236}];
 assert.equal(buildWheatMetrics(p).srw.wowAvailable,false);
 assert.equal(buildWheatMetrics(p).srw.momAvailable,false);
});
test('three actual reports: position extraction, missing January columns, same-contract metrics, preserved graph and rejected tampering',{skip:!root},()=>{
 const records=fixtures(),tables=records.map(fromCoords),h=build(records,tables);assert.equal(tables[0].contracts.some(c=>c.code==='F27'),false);
 const points=JSON.stringify(toChartPoints(h.points)),c=compare(records,tables,h);assert.deepEqual(changes(buildWheatMetrics(h.points,c)),expected);assert.equal(JSON.stringify(toChartPoints(h.points)),points);
 assert.equal(buildWheatMetrics(h.points,[{...c[1],code:'H28'}]).srw.wowAvailable,false);
 assert.equal(buildWheatMetrics(h.points,[{...c[1],frontMt:[1,2,3]}]).srw.wowAvailable,false);
 assert.equal(verifiedComparison(tables[1],{...h.points[1],srwMt:218.98},h.points[2]),null);
 const bytes=fs.readFileSync(path.join(root,records[0].filename));assert.throws(()=>wheatPdfReceipt(bytes.subarray(0,0),records[0].source,200));
 const cells=JSON.parse(fs.readFileSync(path.join(root,records[1].filename.replace('.pdf','.json'))));assert.equal(parseWheatContractTable(cells,'2026-11-12'),null);
});
test('REQUIRED release check: actual PDF.js bytes, no network, persisted comparison replay',{skip:!root},async()=>{
 const records=fixtures(),tables=[];
 for(const r of records){const bytes=fs.readFileSync(path.join(root,r.filename));assert.equal(sha(bytes),r.sha256);const table=await extractWheatContractTable(bytes,r.point.date);assert(table,'PDF.js layout extraction failed: '+r.filename);assert.equal(sha(bytes),r.sha256,'Parser changed original PDF bytes');tables.push(table);}
 const h=build(records,tables),before=JSON.stringify(toChartPoints(h.points));const oldCwd=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-wheat-replay-')),oldFetch=globalThis.fetch;
 try{
  process.chdir(tmp);let calls=0;
  globalThis.fetch=async url=>{calls++;const r=records.find(x=>x.source===String(url));assert(r,'Unexpected lookup: '+url);const bytes=fs.readFileSync(path.join(root,r.filename));return {ok:true,status:200,url:r.source,headers:new Headers(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const updated=await fillWheatComparisons(h,records.map(r=>r.source));assert.equal(calls,2);assert.equal(updated.contractComparisons.length,2);
  assert.deepEqual(changes(buildWheatMetrics(updated.points,updated.contractComparisons)),expected);assert.equal(JSON.stringify(toChartPoints(updated.points)),before);
  await fillWheatComparisons(updated,[]);assert.equal(calls,2,'Already verified comparison was fetched again');
  // Exercise same persistence path used by both scheduled and saved-publication readers.
  saveWheatHistory(updated);const loaded=loadWheatHistory();assert.deepEqual(changes(buildWheatMetrics(loaded.points,loaded.contractComparisons)),expected);
  const receipt=loaded.contractComparisons[0].receiptPath;fs.writeFileSync(receipt,'{}');const tampered=loadWheatHistory();assert.equal(tampered.contractComparisons.length,1);
  const latest=records.at(-1),e=wheatPdfReceipt(fs.readFileSync(path.join(root,latest.filename)),latest.source,200);persistWheatPdfReceipt(e);assert.equal(e.receiptSha256,latest.sha256);
 }finally{globalThis.fetch=oldFetch;process.chdir(oldCwd);fs.rmSync(tmp,{recursive:true,force:true});}
});
