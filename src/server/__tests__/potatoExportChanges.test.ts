import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculatePotatoExportChanges,parsePotatoExportSeries,createPotatoExportQuoteService} from '../officialPotatoComextService.ts';
import {PotatoPriceChanges} from '../../components/PotatoPriceChanges.tsx';
const now=new Date('2026-10-22T03:00:00Z');
function fixture(){
 const entries={freq:['M'],reporter:['EU27_2020'],partner:['KR'],product:['11081300'],flow:['2'],indicators:['VALUE_IN_EUROS','QUANTITY_IN_100KG'],time:['2025-08','2026-06','2026-07','2026-08']};
 return {id:Object.keys(entries),size:Object.values(entries).map(v=>v.length),dimension:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,{category:{index:Object.fromEntries(v.map((c,i)=>[c,i]))}}])),value:{0:800,1:900,2:1000,3:1100,4:10,5:10,6:10,7:10} as Record<string,number>,status:{} as Record<string,string>};
}
const series=parsePotatoExportSeries(fixture(),now),changes=calculatePotatoExportChanges(series[0],series,now);
assert.equal(changes.mom.referencePeriod,'2026-07');assert.equal(changes.mom.currentPeriod,'2026-08');assert.equal(changes.mom.pct,10);assert.equal(changes.mom.amountEurPerMT,100);
assert.equal(changes.yoy.referencePeriod,'2025-08');assert.equal(changes.yoy.pct,37.5);
for(const mode of ['missing','zero','confidential','nonfinite']){
 const f=fixture();if(mode==='missing')delete f.value['2'];if(mode==='zero')f.value['6']=0;if(mode==='confidential')f.status['2']='c';if(mode==='nonfinite')f.value['6']=NaN;
 const rows=parsePotatoExportSeries(f,now),c=calculatePotatoExportChanges(rows[0],rows,now);
 assert.equal(c.mom.pct,null,mode);assert.equal(c.mom.referencePeriod,'2026-07');assert.equal(c.yoy.pct,37.5);
}
{const f=fixture();delete f.value['0'];const rows=parsePotatoExportSeries(f,now);assert.equal(calculatePotatoExportChanges(rows[0],rows,now).yoy.pct,null);}
assert.equal(calculatePotatoExportChanges(null,series,now).mom.pct,null);
assert.equal(calculatePotatoExportChanges({...series[0],netWeightMT:0},series,now).yoy.pct,null);
assert.equal(calculatePotatoExportChanges(series[0],series.map(p=>({...p,partner:'US'} as any)),now).mom.pct,null);
assert.equal(calculatePotatoExportChanges(series[0],series.map(p=>({...p,eurPerMT:p.eurPerMT*2})),now).mom.pct,null,'reject incompatible price/unit cache');
{const incomplete=fixture();incomplete.value['7']=0;
 const service=createPotatoExportQuoteService({fetcher:(async()=>new Response(JSON.stringify(incomplete))) as typeof fetch,now:()=>now});
 const result=await service.get();assert.equal(result.changes?.mom.currentPeriod,'2026-08');assert.equal(result.changes?.mom.pct,null,'do not shift an incomplete latest month backwards');assert.equal(result.changes?.yoy.pct,null);
}
let saved:any,calls=0,fail=false;
const fetcher=(async()=>{calls++;if(fail)throw Error('offline');return new Response(JSON.stringify(fixture()));}) as typeof fetch;
const store={read:()=>saved,write:(v:any)=>{saved=structuredClone(v);}};
const service=createPotatoExportQuoteService({fetcher,store,now:()=>now});
const quote=await service.get();assert.equal(quote.changes?.mom.pct,10);assert.equal(saved.series.length,4);
await service.get();assert.equal(calls,1);fail=true;
const fallback=await createPotatoExportQuoteService({fetcher,store,now:()=>now}).get();assert.deepEqual(fallback.changes,quote.changes);assert.ok(fallback.refreshFailed);
delete saved.series;const old=await createPotatoExportQuoteService({fetcher,store,now:()=>now}).get();assert.equal(old.changes?.mom.pct,null,'old cache must not invent comparisons');
const markup=renderToStaticMarkup(createElement(PotatoPriceChanges,{quote}));for(const label of ['YoY','MoM','37.50%','10.00%'])assert.ok(markup.includes(label),label);assert.ok(!markup.includes('WoW'));
assert.ok(renderToStaticMarkup(createElement(PotatoPriceChanges,{quote:null})).includes('확인 불가'));
console.log('PASS: exact calendar comparisons, source scope/units, missing/zero/confidential values, null current, persistent comparisons, legacy cache, rendering');
if(process.argv[2]){
 const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),rows=parsePotatoExportSeries(raw,new Date()),current=rows[0];assert.ok(current);
 const c=calculatePotatoExportChanges(current,rows);for(const change of [c.mom,c.yoy]){const r=rows.find(p=>p.period===change.referencePeriod);assert.ok(r);assert.equal(change.pct,(current.eurPerMT-r.eurPerMT)/r.eurPerMT*100);}
 console.log('OFFICIAL RESPONSE VERIFIED:',JSON.stringify({current,mom:c.mom,yoy:c.yoy}));
}

for(const hidden of ['2025-08','2026-07','2026-08'])assert(!markup.includes(hidden));
