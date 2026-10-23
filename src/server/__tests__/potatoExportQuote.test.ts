import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PotatoBenchmarkDisplay} from '../../components/PotatoBenchmarkValue.tsx';
import assert from 'node:assert/strict';
import {createPotatoExportQuoteService,parsePotatoExportUnitValue} from '../officialPotatoComextService.ts';
// Synthetic fixtures only; none of these observations is written to the RMS cache.
const now=new Date('2026-10-22T03:00:00Z');
function fixture(){
 const entries:Record<string,string[]>={freq:['M'],reporter:['EU27_2020'],partner:['KR'],product:['11081300'],flow:['2'],indicators:['VALUE_IN_EUROS','QUANTITY_IN_100KG'],time:['2026-07','2026-08','2026-09','2026-10','2026-11']};
 return {id:Object.keys(entries),size:Object.values(entries).map(v=>v.length),dimension:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,{category:{index:Object.fromEntries(v.map((c,i)=>[c,i]))}}])),value:{0:12000,1:15000,3:99999,4:99999,5:100,6:120,7:0,8:100,9:100} as Record<string,number>,status:{} as Record<string,string>};
}
const parsed=parsePotatoExportUnitValue(fixture(),now)!;
assert.equal(parsed.period,'2026-08');assert.equal(parsed.netWeightMT,12);assert.equal(parsed.eurPerMT,1250);
for(const [dim,wrong] of [['partner','EXT_EU27_2020'],['reporter','DE'],['product','11081400'],['flow','1'],['indicators','VALUE_IN_DOLLARS']]){
 const f=fixture();f.dimension[dim].category.index={[wrong]:0};assert.equal(parsePotatoExportUnitValue(f,now),null,dim);
}
{const f=fixture();f.status['1']='c';assert.equal(parsePotatoExportUnitValue(f,now)?.period,'2026-07');}
{const f=fixture();f.status['1']='p';assert.equal(parsePotatoExportUnitValue(f,now)?.provisional,true);}
{const f=fixture();f.value['6']=NaN;assert.equal(parsePotatoExportUnitValue(f,now)?.period,'2026-07');}
{const f=fixture();f.id.push('unknown');f.size.push(1);assert.equal(parsePotatoExportUnitValue(f,now),null);}
let time=+now,calls=0,fail=false,stored:any=null;
const fetcher=(async(input:any)=>{calls++;const u=new URL(String(input));assert.equal(u.hostname,'ec.europa.eu');assert.equal(u.searchParams.get('partner'),'KR');assert.equal(u.searchParams.get('reporter'),'EU27_2020');assert.equal(u.searchParams.get('flow'),'2');assert.deepEqual(u.searchParams.getAll('indicators'),['VALUE_IN_EUROS','QUANTITY_IN_100KG']);if(fail)throw Error('offline');return new Response(JSON.stringify(fixture()));}) as typeof fetch;
const store={read:()=>stored,write:(r:any)=>{stored=structuredClone(r);}};
const service=createPotatoExportQuoteService({fetcher,store,now:()=>new Date(time)});
const [a,b]=await Promise.all([service.get(),service.get()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.dataStatus,'live-verified');
await service.get();assert.equal(calls,1,'TTL reuses verified receipt');
time+=31*60000;await service.get();assert.equal(calls,2,'TTL expiry rechecks publication');
await service.get(true);assert.equal(calls,3,'manual refresh bypasses TTL');
fail=true;const fallback=await service.get(true);assert.equal(fallback.dataStatus,'last-verified');assert.equal(fallback.refreshFailed,true);assert.equal(fallback.data?.eurPerMT,1250);
const restarted=createPotatoExportQuoteService({fetcher,store,now:()=>new Date(time)});assert.equal((await restarted.get()).data?.eurPerMT,1250,'restart retains last verified value');
const empty=createPotatoExportQuoteService({fetcher,now:()=>new Date(time)});assert.equal((await empty.get()).dataStatus,'unavailable');
stored.data.partner='US';const corrupt=createPotatoExportQuoteService({fetcher,store,now:()=>new Date(time)});assert.equal((await corrupt.get()).data,null,'reject wrong-scope cache');
const markup=renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote:a}));
for(const label of ['1,250.00','EUR/MT','2026-08','평균 수출단가','실제 계약가격 아님','Eurostat Comext','EU27','한국'])assert.ok(markup.includes(label),label);
const cachedMarkup=renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote:fallback,failed:true}));assert.ok(cachedMarkup.includes('마지막 검증값'));
const missingMarkup=renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote:null}));assert.ok(missingMarkup.includes('데이터 미확보'));assert.ok(!missingMarkup.includes('1,250.00'));
console.log('PASS: benchmark available, missing and retained-value rendering');
console.log('PASS: isolated synthetic parser, scope, units, missing/future/confidential values, TTL, force, concurrency, failure and restart cache tests');
if(process.argv.includes('--live')){
 const live=await createPotatoExportQuoteService().get();assert.equal(live.dataStatus,'live-verified');assert.ok(live.data);
 assert.equal(live.data.partner,'KR');assert.equal(live.data.reporter,'EU27_2020');
 assert.equal(live.data.eurPerMT,live.data.valueEur/live.data.netWeightMT);
 console.log('LIVE official Eurostat (memory only):',JSON.stringify(live));
}
