import fs from 'node:fs';import assert from 'node:assert/strict';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {getRecommendationColor} from '../../utils/recommendationPresentation';
import AiRecommendation,{getRecommendationColor as aiColor} from '../../components/AiRecommendation';
import {PotatoPriceChangesDisplay} from '../../components/PotatoPriceChanges';
import {potatoDisplayConversion} from '../../components/PotatoBenchmarkValue';
import {calculatePotatoExportChanges} from '../officialPotatoComextService';
import {parseDatedDisplayFx} from '../../utils/soybeanPriceSnapshot';
assert.equal(aiColor,getRecommendationColor);
const cases:[string,string][]=[
 ['재고 부족: 즉시 물량 확보','negative'],['긴급 시정 조치','negative'],
 ['우호적 구매 기회','positive'],['긴급성 낮음','positive'],['즉시 대응 불필요','positive'],
 ['30~45일 확보','warning'],['60~75일 확보','warning'],['유럽 수입 계약','warning'],['매수 확대','warning'],['조치 필요','warning'],
 ['부족 시 즉시 확보','warning'],['공급 악화시 즉시 확보','warning'],['우호적이나 분할 구매 검토','warning'],['매수 기회 없음','warning'],['긴급 아님','warning'],['긴급성 낮지 않음','warning'],['즉시 매수할 필요 없음','warning'],['','warning'],
];
for(const [text]of cases){const cls=getRecommendationColor(text);assert(cls.includes('bg-[#FFF7ED]')&&cls.includes('text-[#EC870C]')&&cls.includes('border-[#FED7AA]'));assert.equal(cls,getRecommendationColor(''));const $=load(renderToStaticMarkup(createElement(AiRecommendation,{commodityId:'palm-oil',recommendedCoverage:text,researchStatus:'cached'})));const badge=$('.rms-desk-recommendation');assert.equal(badge.text(),text);assert(badge.hasClass('font-bold'));assert(badge.hasClass('px-2.5')&&badge.hasClass('py-1')&&badge.hasClass('rounded-md'));}
const saved=JSON.parse(fs.readFileSync('.rms-price-history/potato-export-unit-value.json','utf8')),changes=calculatePotatoExportChanges(saved.data,saved.series),quote={success:true,data:saved.data,changes}as any;
const raw=JSON.parse(fs.readFileSync('.rms-stage3/free-fx.json','utf8')),fx=parseDatedDisplayFx(raw.raw,raw.verifiedAt)!;
for(const currency of ['EUR','USD','KRW']as const){const $=load(renderToStaticMarkup(createElement(PotatoPriceChangesDisplay,{quote,currency,fx}))),cells=$('.grid > div');for(const [i,key]of (['mom','yoy']as const).entries()){
 const c=changes[key],amount=c.amountEurPerMT!*potatoDisplayConversion(currency,fx).factor;
 const number=currency==='KRW'?Math.round(Math.abs(amount)).toLocaleString('en-US'):Math.abs(amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const expected=(amount>=0?'+':'−')+potatoDisplayConversion(currency,fx).symbol+number;assert.equal(cells.eq(i).children('span').last().text().trim(),expected);assert(cells.eq(i).text().includes(c.pct!.toFixed(2)+'%'));assert(cells.eq(i).children('span').last().prev().hasClass('font-mono'),'amount directly under percentage');
 }assert(!$.text().includes('→')&&!$.text().includes('적용 환율'));}
assert.equal(changes.yoy.referencePeriod,'2025-08');assert.equal(changes.mom.referencePeriod,'2026-07');assert.equal(changes.yoy.amountEurPerMT!.toFixed(2),'-248.52');assert.equal(changes.mom.amountEurPerMT!.toFixed(2),'29.77');
const original=JSON.stringify(quote);renderToStaticMarkup(createElement(PotatoPriceChangesDisplay,{quote,currency:'KRW',fx:{...fx,USD_KRW:fx.USD_KRW*1.1}}));assert.equal(JSON.stringify(quote),original,'FX display never mutates EUR percentage or monthly quote');
const fallback=renderToStaticMarkup(createElement(PotatoPriceChangesDisplay,{quote,currency:'USD',fx:null}));assert(fallback.includes('−€248.52')&&fallback.includes('+€29.77')&&!fallback.includes('/MT')&&!fallback.includes('$'));
const ui=fs.readFileSync('src/components/CommodityDetail.tsx','utf8');assert(!ui.includes('const getRecommendationColor ='));assert(ui.includes('getRecommendationColor(activeDeskRecommendation)'));assert(!ui.includes("isPalmOil?'bg-slate-50 border border-slate-200 text-slate-700'"));
console.log('PASS shared uniform soft-orange recommendation styling without intent/Palm overrides, identical AI helper, exact monthly EUR differences, three dated-FX conversions, invariant percentages and no extra date/explanation lines.');
