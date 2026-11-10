import test from 'node:test';
import assert from 'node:assert/strict';
import {otherCommodityVerificationPool} from '../otherCommodityNewsPool.ts';

const now=new Date('2026-11-04T05:00:00Z');
const source=(date:string,host:string,slug:string)=>({
  originalUrl:`https://${host}/${slug}`,publishedAt:date,
  sourceName:host,rawTitle:'Cassava/palm original publisher report'
});

test('saved free tapioca candidates enter verification alongside Gemini search results',()=>{
  const saved=[source('2026-11-03','tqindustry.com','cassava-prices'),source('2026-11-02','vietbacagroimex.com','starch-exports')];
  const discovered=[source('2026-10-23','world-grain.com','older')];
  const searched=[source('2026-11-04','reuters.com','cassava-demand')];
  const result=otherCommodityVerificationPool(saved,discovered,searched,now);
  assert.equal(result.length,4);
  assert.deepEqual(result.map(x=>x.publishedAt),['2026-11-04','2026-11-03','2026-11-02','2026-10-23']);
  for(const item of saved)assert(result.includes(item));
});

test('recent palm articles are not crowded out by sixteen old publisher reports',()=>{
  const old=Array.from({length:16},(_,i)=>source('2026-10-15','repeating-weekly.example',`weekly-${i}`));
  const newItem=source('2026-11-03','mpoc.org.my','palm-stocks');
  const selection=otherCommodityVerificationPool([],old,[newItem],now,16);
  assert.equal(selection.length,16);
  assert.equal(selection[0],newItem);
  assert.equal(selection.filter(x=>x.originalUrl===newItem.originalUrl).length,1);
});

test('duplicate URLs, invalid URLs, future dates and publisher concentration are handled conservatively',()=>{
  const a=source('2026-11-03','a.example','alpha');
  const b=source('2026-11-02','a.example','beta');
  const c=source('2026-11-01','a.example','gamma');
  const d=source('2026-10-29','b.example','delta');
  const pool=otherCommodityVerificationPool([a,b],[{...a,originalUrl:a.originalUrl+'/'},c,d],[
    {...source('2026-11-30','c.example','future')},
    {originalUrl:'http://insecure.example/x',publishedAt:'2026-11-03'},
    {originalUrl:'not-a-url',publishedAt:'2026-11-03'}
  ],now,4);
  assert.deepEqual(pool.map(x=>x.originalUrl),[a.originalUrl,b.originalUrl,d.originalUrl,c.originalUrl]);
});

test('potato starch direct-market evidence is verified before generic table-potato headlines',()=>{
 const oldTable=Array.from({length:15},(_,i)=>({
  ...source('2026-11-04','commodity-board.com','table-'+i),
  rawTitle:'European table potato market prices steady with fresh harvest'
 }));
 const targeted={...source('2026-10-25','potatoes.news','starch-contract'),
  rawTitle:'Starch potatoes contract prices rise after poor harvest'};
 const selected=otherCommodityVerificationPool(oldTable,[],[targeted],now,8,'potato-starch');
 assert.equal(selected[0],targeted);
 assert.equal(selected.length,8);
});
