import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cloudCompatibleVerifiedSourcePool} from '../newsCloudSourceOrder.ts';

const now=new Date('2026-11-12T12:00:00Z');
type Source={sourceName:string;rawTitle:string;publishedAt:string;originalUrl:string;rawId:string};
function make(id:string,sourceName:string,day:string,title:string):Source{
  return {rawId:id,sourceName,publishedAt:day,rawTitle:title,originalUrl:`https://${sourceName}/article/${id}`};
}

test('verified input diversity reaches the summary prompt without dropping source evidence',()=>{
  const items=[
    make('a1','publisher-a.example','2026-11-11','Crop price report'),
    make('a2','publisher-a.example','2026-11-10','Crop supply report'),
    make('a3','publisher-a.example','2026-11-09','Crop demand report'),
    make('b1','publisher-b.example','2026-11-08','Crop weather report'),
    make('c1','publisher-c.example','2026-10-29','Crop export report'),
    make('a4','publisher-a.example','2026-10-28','Crop storage report')
  ];
  const before=items.map(x=>({...x}));
  const ordered=cloudCompatibleVerifiedSourcePool(items,'potato-starch',now);
  assert.equal(ordered.length,items.length);
  assert.deepEqual(new Set(ordered),new Set(items));
  assert.deepEqual(ordered.slice(0,3).map(x=>x.sourceName),[
    'publisher-a.example','publisher-b.example','publisher-c.example'
  ]);
  assert.deepEqual(items,before,'must not mutate verification records');
});

test('when only one verified publisher exists, no articles are dropped or fabricated',()=>{
  const items=[
    make('a1','publisher-a.example','2026-11-11','Crop price report'),
    make('a2','publisher-a.example','2026-11-10','Crop supply report'),
    make('a3','publisher-a.example','2026-11-09','Crop demand report')
  ];
  assert.deepEqual(cloudCompatibleVerifiedSourcePool(items,'sugar',now),items);
});

test('the pre-existing Corn cross-commodity eligibility guard remains active',()=>{
  const unrelated=make('sugar','publisher-a.example','2026-11-11','Sugarcane price surge');
  const relevant=make('corn','publisher-b.example','2026-11-10','Maize export supply');
  assert.deepEqual(cloudCompatibleVerifiedSourcePool([unrelated,relevant],'corn',now),[relevant]);
});

test('shared ordering works for all eight RMS commodities, without commodity-specific article targets',()=>{
  const items=[
    make('a1','publisher-a.example','2026-11-11','Market supply report'),
    make('a2','publisher-a.example','2026-11-10','Market price report'),
    make('b1','publisher-b.example','2026-11-09','Market export report')
  ];
  for(const commodity of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']){
    const ordered=cloudCompatibleVerifiedSourcePool(items,commodity,now);
    assert.deepEqual(ordered.map(x=>x.rawId),['a1','b1','a2'],commodity);
  }
});
