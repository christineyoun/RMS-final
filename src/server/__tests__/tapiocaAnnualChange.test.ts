import assert from 'node:assert/strict';import fs from 'node:fs';
import {tapiocaAnnualChange,quoteFromResponse,mapCommodityForDisplay,commodityComparisonDisplay} from '../../services/commodityQuoteSource';
import {parseDatedDisplayFx} from '../../utils/soybeanPriceSnapshot';
const sourceUrl='https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price';
const row=(date:string,usdPerMT:number,provenance='source-verified')=>({date,usdPerMT,sourceUrl,provenance});
const actual=JSON.parse(fs.readFileSync('.rms-price-history/tapioca-starch.json','utf8')).points.map((p:any)=>({...p,usdPerMT:p.value}));
const input=actual.filter((p:any)=>p.date<=new Date().toISOString().slice(0,10));assert.deepEqual(tapiocaAnnualChange(input),{changeYoY:51.65,changeYoYUsdMt:235,yoyReferenceDate:'2025-10-21'},'same saved graph history includes the previous-year imported observations');
const points=[row('2025-10-14',450),row('2025-10-21',455),row('2026-09-22',700),row('2026-10-20',690)];
const annual=tapiocaAnnualChange(points);assert.equal(annual.yoyReferenceDate,'2025-10-21');assert.equal(annual.changeYoY,51.65);assert.equal(annual.changeYoYUsdMt,235);
for(const previous of [{...row('2025-10-21',455),isSynthetic:true},{...row('2025-10-21',455),sourceUrl:'https://example.com'},row('2025-10-01',455)])assert.equal(tapiocaAnnualChange([previous,points.at(-1)]).changeYoY,null);
assert.equal(tapiocaAnnualChange([row('2023-02-28',500),row('2024-02-29',600)]).changeYoY,20);
const quote=quoteFromResponse('tapioca-starch',{success:true,data:points})!;assert.equal(quote.changeMoM,-1.43);assert.equal(quote.changeYoY,annual.changeYoY);
const fx=parseDatedDisplayFx({base:'USD',date:'2026-10-23',rates:{KRW:1324.45,EUR:.8934}},'2026-10-24T00:00:00Z')!;
for(const currency of ['KRW','USD','EUR']as const){const mapped=mapCommodityForDisplay({id:'tapioca-starch',price:quote.priceUsdMt,changeMoM:quote.changeMoM,changeYoY:quote.changeYoY}as any,currency,fx);assert.equal(commodityComparisonDisplay(mapped,'yoy','YoY'),'+51.65% YoY');assert.equal(commodityComparisonDisplay(mapped,'mom'),'-1.43%');}
assert.equal(commodityComparisonDisplay({id:'tapioca-starch',changeYoY:null}as any,'yoy','YoY'),'--% YoY');
console.log('PASS TTSA weekly anniversary matching, saved graph import provenance retained, missing/synthetic/unrelated history, leap dates, unchanged MoM and currency-invariant canonical YoY.');
