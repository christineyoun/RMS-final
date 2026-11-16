import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {PotatoRawSupplyCard} from '../../components/PotatoRawSupplyCard';
import {OriginRadar} from '../../components/OriginRadar';
import {mergePotatoJrcPublication,retainedPotatoJrcPublication} from '../../utils/potatoJrcPublication';

test('supply and radar follow the same issue and the previous verified comparison',()=>{
 const now=new Date('2030-11-16T01:00:00Z'),seed=retainedPotatoJrcPublication(now)!;
 const makeIssue=(publishedAt:string,forecast:number)=>({...seed.current,forecastYear:Number(publishedAt.slice(0,4)),publishedAt,
  sourceUrl:'https://publications.jrc.ec.europa.eu/repository/bitstream/JRC999999/bulletin.pdf',
  rows:seed.current.rows.map(r=>({...r,forecast,previousYear:40}))});
 const prior=makeIssue('2030-08-21',40),current=makeIssue('2030-10-25',42);
 const publication=mergePotatoJrcPublication({current:prior},current,now)!;
 assert.deepEqual(mergePotatoJrcPublication(publication,{...current,rows:[]},now),publication);
 assert.deepEqual(mergePotatoJrcPublication(publication,{...current,publishedAt:'2030-11-30'},now),publication);
 const next=mergePotatoJrcPublication(publication,makeIssue('2031-01-20',38),new Date('2031-01-22'))!;
 assert.equal(next.previous,undefined,'new crop year does not reuse older baseline');
 const supply=load(renderToStaticMarkup(<PotatoRawSupplyCard data={{harvestYear:'2029',productionMMT:35.25,area1000HA:781.6,weightedYieldMTHA:45.11}} publication={publication}/>));
 assert.ok(supply.text().includes('35.25 MMT'));
 assert.ok(supply.text().includes(current.publishedAt));
 assert.ok(supply.text().includes('08.21 전망'));
 assert.ok(supply.text().includes('+5%'));
 const radar=load(renderToStaticMarkup(<OriginRadar commodityId="potato-starch" potatoJrcPublication={publication} origins={[{
  region:'독일 (Lower Saxony)',production:'13.87M MT (전체 감자)',marketYear:'2029',
  supplyIndicators:[{source:'Eurostat',text:'전년 생산 비교',period:'2029',url:'https://ec.europa.eu',display:'origin-summary'}]
 }]}/>));
 assert.equal(radar('[data-potato-national-yield]').text(),'2030년 국가 단수 전망 42.0t/ha (2029년 대비 +5.0%)');
 assert.ok(radar.text().includes('13.87M MT'));
 assert.ok(radar.text().includes('최근 강수 자료 갱신 대기'));
 assert.equal(radar('[data-origin-sources] a').attr('href'),current.sourceUrl);
});
