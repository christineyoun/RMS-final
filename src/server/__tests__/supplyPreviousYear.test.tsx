import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {normalizeVerifiedOtherCommodityWasde} from '../../lib/verifiedWorldWasde';
import {normalizeVerifiedSoybeanOilWasde} from '../../components/CommodityWasdeCard';
import {parseSoybeanOilSupply} from '../../lib/soybeanOilSupply';
import {PotatoRawSupplyCard} from '../../components/PotatoRawSupplyCard';
import {savedFreeDataResponse} from '../savedFreeDataResponse';
for(const id of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar']){
 const current=JSON.parse(fs.readFileSync('src/data/'+(id==='soybean-oil'?'usda_soybean_oil_last_verified.json':'usda_world_last_verified_'+id+'.json'),'utf8'));
 const year=Number(current.data.marketYear)-1,saved=JSON.parse(fs.readFileSync(`src/data/usda_world_verified_${id}_${year}.json`,'utf8')),receipt=JSON.parse(fs.readFileSync(`.rms-stage3/evidence/usda-${id}-${year}.json`,'utf8'));
 assert.equal(createHash('sha256').update(receipt.body).digest('hex'),receipt.sha256);assert(saved.data.rawRecords.every((r:any)=>Number(r.marketYear)===year&&r.countryCode==='00'));
 const record=id==='soybean-oil'?normalizeVerifiedSoybeanOilWasde(saved.data,'last-verified',saved.verifiedAt,true):normalizeVerifiedOtherCommodityWasde(saved.data,'last-verified',saved.verifiedAt,id);assert(record);assert.equal(Number(record.marketYear),year);
 const raw=saved.data.rawRecords;assert.equal(record.productionKMT,raw.find((r:any)=>r.attributeId===28).value);assert.equal(record.exportsKMT,raw.find((r:any)=>r.attributeId===88).value);
 const api=await savedFreeDataResponse(`/api/usda/${id}?marketYear=${year}`);assert.equal(api?.status,200);assert.deepEqual(api?.payload.data,saved.data);assert.equal((await savedFreeDataResponse(`/api/usda/${id}?marketYear=2010`))?.status,503);
 if(id==='soybean-oil'){assert.equal(parseSoybeanOilSupply(raw,year),null,'current-year validation remains strict');assert(parseSoybeanOilSupply(raw,year,new Date(),true));}
 const untouched=await savedFreeDataResponse('/api/usda/'+id);assert.deepEqual(untouched?.payload.data.rawRecords,current.data.rawRecords,'current publication unchanged');assert.equal(untouched?.payload.data.marketYear,current.data.marketYear);
}
const receipt=JSON.parse(fs.readFileSync('.rms-stage3/evidence/potato-stats.json','utf8')),potato=JSON.parse(receipt.body),before=JSON.stringify(potato);
const $=load(renderToStaticMarkup(createElement(PotatoRawSupplyCard,{data:potato.data,history:potato.history})));
assert.equal($('[data-supply-grid]').length,1);assert.equal($('[data-supply-grid="current"] > div').length,3);assert.equal($('[data-supply-grid="previous"]').length,0);assert.equal($('[data-supply-year="previous"]').length,0);assert.equal($('p').length,0);assert($('[data-jrc-potato-table]').length);
assert($('[data-supply-grid="current"]').text().includes(potato.data.productionMMT.toFixed(2)+' MMT'));assert(!$.text().includes('총소비 · 4국'));assert(!$.text().includes('기말재고 · 4국'));assert(!$.text().includes('총수출량 · 4국'));assert.equal(JSON.stringify(potato),before);
const tapioca=JSON.parse(fs.readFileSync('src/data/tapioca_supply_history_verified.json','utf8')),row=tapioca.rows.find((r:any)=>r.marketYear==='2024/2025');assert.equal(row.productionTonnes,24983311);assert.equal(row.plantedAreaRai,8445471);assert.equal(row.yieldMtPerRai,2.958);
const ui=fs.readFileSync('src/components/CommodityWasdeCard.tsx','utf8');assert(!ui.includes('<p className='));assert(ui.includes('data-supply-year="previous"'));assert(!ui.includes('2024 3,205,584'),'calendar export values not mixed into crop year');
console.log('PASS all six original USDA prior-year receipts/normalizers, identity/units, independent current publications, strict current oil validation, three original Potato metrics without unsupported or previous-year cards, original four-country history, no narratives, verified TTSA crop-year scope.');
