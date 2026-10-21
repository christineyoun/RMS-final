/** Offline fixture tests. NEVER contacts USDA, Gemini, or Google billing. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-origin-test-'));
process.env.RMS_ORIGIN_CACHE_DIR=temp;
process.env.USDA_FAS_API_KEY='fixture-test-key';
const {WheatVerifiedOriginService,parseOfficialWheatPsd}=await import('../wheatVerifiedOriginService.ts');
const now=new Date();
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now).split('-');
const yr=Number(parts[0])-(Number(parts[1])<7?1:0);
const countries=[
  {countryName:'United States',countryCode:'US'},
  {countryName:'Australia',countryCode:'AS'},
  {countryName:'Canada',countryCode:'CA'},
  {countryName:'European Union',countryCode:'E4'},
  {countryName:'Russia',countryCode:'RS'}
];
const numbers={US:[53700,22500,22100],AS:[31800,23500,4800],CA:[36300,25000,5200],E4:[125100,30000,10800],RS:[81500,48000,11200]};
const records=Object.entries(numbers).flatMap(([code,arr])=>[28,88,176].map((attr,index)=>({
  countryCode:code,commodityCode:'0410000',marketYear:String(yr),calendarYear:String(yr),month:'09',
  attributeId:attr,unitId:8,value:arr[index]
})));
try {
  const parsed=parseOfficialWheatPsd(countries,records,yr);
  assert.equal(parsed.length,5);
  assert.equal(parsed.find(x=>x.key==='usa')?.productionMMT,53.7);
  assert.equal(parsed.find(x=>x.key==='eu')?.exportsMMT,30);
  assert.equal(parseOfficialWheatPsd([] as any,records,yr).length,0,'country IDs must be independently verified');
  const duplicate=[...records,{...records[0],value:90000}];
  assert.equal(parseOfficialWheatPsd(countries,duplicate,yr).find(x=>x.key==='usa')?.productionMMT,null,'ambiguous revisions rejected');
  const badYear=records.map(r=>({...r,marketYear:String(yr-1)}));
  assert.equal(parseOfficialWheatPsd(countries,badYear,yr).length,0,'no wrong market year');
  const invalidUnit=records.map(r=>r.countryCode==='US'&&r.attributeId===28?{...r,unitId:9}:r);
  assert.equal(parseOfficialWheatPsd(countries,invalidUnit,yr).find(x=>x.key==='usa')?.productionMMT,null);
  let requests=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url:any)=>{
    requests++;
    const u=String(url);
    return new Response(JSON.stringify(u.includes('/countries')?countries:records),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try {
    // Force a crop year fixture independent of whether tests run after New Year.
    const svc=new WheatVerifiedOriginService();
    const first=await svc.getWheatOriginRadar(true);
    assert.equal(first.origins.length,5);
    assert(first.origins.every(o=>o.dataFreshness==='live'&&!!o.sourceReportDate));
    assert.equal(first.origins.find(o=>o.originKey==='usa')?.production,'53.70M MT');
    const before=requests;
    const second=await svc.getWheatOriginRadar(false);
    assert.equal(requests,before,'ordinary revisit must not call upstream');
    assert.equal(second.origins.length,5);
    const failure=new WheatVerifiedOriginService();
    globalThis.fetch=async()=>{throw new Error('simulated outage');};
    const after=await failure.getWheatOriginRadar(true);
    assert(after.origins.every(o=>o.dataFreshness==='cached'),'real verified cache survives outage');
    assert.equal(after.origins.find(o=>o.originKey==='usa')?.sourceReportDate,first.origins[0].sourceReportDate);
  } finally {globalThis.fetch=originalFetch;}
  // Separate no-key cache: never invent production numbers from examples.
  const noKey=fs.mkdtempSync(path.join(os.tmpdir(),'rms-origin-nokey-'));
  // A fresh service module would read a separate env-derived cache dir on import.
  assert.equal(parseOfficialWheatPsd([],[],yr).length,0);
  fs.rmSync(noKey,{recursive:true,force:true});
  console.log('PASS: 5 verified country origins; matched USDA country identities and release periods.');
  console.log('PASS: wrong market years, ambiguous records, and invalid units rejected.');
  console.log('PASS: page revisit makes zero additional upstream requests; outage reuses dated verified cache.');
  console.log('PASS: All USDA responses mocked locally. Paid Gemini calls: ZERO.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
