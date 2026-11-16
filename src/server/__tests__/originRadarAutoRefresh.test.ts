import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {savedOriginRadarUrl,watchSavedOriginRadar,ORIGIN_RADAR_POLL_MS} from '../../services/savedOriginRadar';
import {AFSIS_ACO_INDEX,THAI_CASSAVA_SURVEYS,readStarchOriginSupply,refreshStarchOriginSupply} from '../starchOriginSupplyRefresh';
import {completeOriginRadar} from '../all8OriginRadarService';

test('all eight routed readers load, poll and resume without a forced collection',async()=>{
 const doc=Object.assign(new EventTarget(),{hidden:false}),win=new EventTarget();
 let timer:()=>void=()=>{},cleared=false;
 Object.assign(win,{setInterval:(fn:()=>void,ms:number)=>{assert.equal(ms,ORIGIN_RADAR_POLL_MS);timer=fn;return 1;},clearInterval:()=>{cleared=true;}});
 const expected=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
 assert.equal(new Set(expected.map(savedOriginRadarUrl)).size,8);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 for(const id of expected){
  let seen=0,accepted=0;
  const stop=watchSavedOriginRadar(id,()=>accepted++,{document:doc as unknown as Document,window:win as unknown as Window,
   fetcher:async input=>{
    assert.equal(input,savedOriginRadarUrl(id));seen++;
    return seen===3?new Response('',{status:503}):Response.json({success:true,origins:[{id}]});
   }});
  await flush();assert.equal(accepted,1);
  doc.hidden=true;timer();await flush();assert.equal(seen,1);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(accepted,2);
  win.dispatchEvent(new Event('focus'));await flush();assert.equal(seen,3);assert.equal(accepted,2);
  stop();assert.ok(cleared);
  win.dispatchEvent(new Event('focus'));await flush();assert.equal(seen,3);
 }
});

const thai=(year:number,value:number)=>`<h5>CASSAVA CROP SURVEYS</h5><table>
<tr><td>Year (A.D.)</td><td>${year-1}/${String(year).slice(-2)}</td><td>*${year}/${String(year+1).slice(-2)}</td></tr>
<tr><td>Total Production (Ton)</td><td>18,000,000</td><td>${value.toLocaleString('en-US')}</td></tr>
</table><p>Tapioca Crop Survey in August ${year}</p>`;
const aco=(issue:number,month:string,year:number)=>`ASEAN Agricultural Commodity Outlook
No. ${issue}, ${month}, ${year}
Cassava (fresh root)
Table 96. Cassava production in ASEAN countries from ${year-1} to ${year+1}.
Unit: 1,000 tons
Country (${year-2}/${year-1}) (${year-1}/${year}) (${year}/${year+1})
ASEAN 80,000 81,000 1,000 1 82,000 1,000 1
Cambodia 12,000 13,000 1,000 1 14,000 1,000 1
Lao PDR 7,000 7,100 100 1 7,200 100 1
Vietnam 9,000 10,000 1,000 1 11,000 1,000 1
Remarks:
`;
test('saved starch supply advances each verified source independently and preserves weather',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-starch-radar-'));
 const now=new Date('2030-11-16T01:00:00Z');
 let failThai=false,failAll=false,year=2029,issue=80,pdfReads=0;
 const fetcher:typeof fetch=async input=>{
  const u=String(input);
  if(failAll||failThai&&u===new URL(THAI_CASSAVA_SURVEYS).href)return new Response('',{status:503});
  if(u===new URL(THAI_CASSAVA_SURVEYS).href)return new Response(thai(year,19000000));
  if(u===AFSIS_ACO_INDEX)return new Response('<a href="/wp-content/uploads/ACO-No.-'+issue+'.pdf">Download PDF</a>');
  if(u.endsWith('.pdf')){pdfReads++;return new Response('%PDF-fixture');}
  const dimensions={freq:['A'],geo:['PL'],crops:['R1000'],strucpro:['HPRD_THS_T'],time:['2028','2029']};
  return Response.json({id:Object.keys(dimensions),size:Object.values(dimensions).map(d=>d.length),updated:'2030-01-25T12:00:00Z',
   dimension:Object.fromEntries(Object.entries(dimensions).map(([k,v])=>[k,{category:{index:v,label:k==='strucpro'?{HPRD_THS_T:'Harvested production in thousand tonnes'}:undefined}}])),
   value:{0:6000,1:7200},status:{1:'e'}});
 };
 const options={root,now,fetcher,extractPdf:async()=>aco(issue,'June',year)};
 try{
  assert.deepEqual(await refreshStarchOriginSupply('tapioca-starch',options),[]);
  assert.deepEqual(await refreshStarchOriginSupply('potato-starch',options),[]);
  assert.equal(readStarchOriginSupply(root).length,5);
  const prior=readStarchOriginSupply(root).find(r=>r.originKey==='thailand');
  const radar={success:true,statusCode:200,lastUpdated:'',sourcesUsed:[],sourceFooterText:'',origins:[{
   originKey:'thailand',region:'태국',production:'',weatherSource:'Open-Meteo',weatherAsOf:'2030-11-15',weatherEvidence:{lastDay:'2030-11-15'}
  }]} as any;
  const completed=completeOriginRadar('tapioca-starch',radar,root,now);
  assert.equal(completed.origins[0].productionNumericMMT,19);
  assert.deepEqual(completed.origins[0].weatherEvidence,radar.origins[0].weatherEvidence);
  await refreshStarchOriginSupply('tapioca-starch',options);
  assert.equal(pdfReads,1,'unchanged ACO avoids repeated PDF downloads');
  issue++;year=2030;failThai=true;
  assert.deepEqual(await refreshStarchOriginSupply('tapioca-starch',options),['thai-survey']);
  assert.deepEqual(readStarchOriginSupply(root).find(r=>r.originKey==='thailand'),prior);
  assert.equal(readStarchOriginSupply(root).find(r=>r.originKey==='vietnam')?.reportingYear,'2030/31');
  assert.equal(readStarchOriginSupply(root).find(r=>r.originKey==='poland')?.estimateStatus,'estimated');
  const saved=readStarchOriginSupply(root);failAll=true;
  assert.equal((await refreshStarchOriginSupply('tapioca-starch',options)).length,2);
  assert.deepEqual(readStarchOriginSupply(root),saved);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
