import test from 'node:test';
import assert from 'node:assert/strict';
import {screenOfficialItem,screenOfficialTradePolicy} from '../officialTradePolicyMonitor.ts';
const now=new Date('2030-06-10T09:00:00Z');
const official='https://www.federalregister.gov/documents/2030/06/08/synthetic-id';
const title='Proposed tariff-rate quota adjustments for sugar imports';
const fixture={title,description:'Official consultation on sugar import quota',url:official,date:'2030-06-08',sourceName:'U.S. Federal Register',source:'us'};
const response=(body,type='application/json',status=200)=>new Response(body,{status,headers:{'Content-Type':type}});
test('official source and commodity relevance required',()=>{
 assert(screenOfficialItem(fixture,now));
 assert.equal(screenOfficialItem({...fixture,url:'https://fake-articles.invalid/documents/2030/06/08/x'},now),null);
 assert.equal(screenOfficialItem({...fixture,url:'http://www.federalregister.gov/documents/2030/06/08/x'},now),null);
 assert.equal(screenOfficialItem({...fixture,date:'2030-01-02'},now),null);
 assert.equal(screenOfficialItem({...fixture,title:'General procurement outlook',description:'A sugar industry outlook'},now),null);
 assert.equal(screenOfficialItem({...fixture,title:'New quota regulation for car parts',description:''},now),null);
});
test('proposals never labeled enacted or automatically favorable',()=>{
 const x=screenOfficialItem({...fixture,documentType:'PRORULE'},now);
 assert.equal(x.recordKind,'proposed');
 assert.equal(x.statusType,'neutral');
 assert.equal(x.statusTag,'원문 검토 필요');
 assert(!('procurementImplication' in x));
});
test('independently checks original government page, no static announcements',async()=>{
 let originals=0;
 const fetcher=async raw=>{
  const u=new URL(raw);
  if(u.hostname==='www.federalregister.gov'&&u.pathname.startsWith('/api/'))
   return response(JSON.stringify({results:[{title,abstract:'Sugar tariff rate quota proposed',publication_date:'2030-06-08',html_url:official,type:'PRORULE'}]}));
  if(u.href===official){originals++;return response('<html><head><title>'+title+'</title></head><body><h1>'+title+'</h1></body></html>','text/html');}
  throw Error('Offline fixture: source unavailable');
 };
 const r=await screenOfficialTradePolicy({now,fetcher});
 assert.equal(r.status,'verified-official-publication');
 assert.equal(r.policy?.url,official);
 assert.equal(r.policy?.recordKind,'proposed');
 assert(r.sourceChecks.some(x=>x.status==='unavailable'));
 assert(originals>0);
});
test('no announcement is not confused with source outage',async()=>{
 const empty=await screenOfficialTradePolicy({now,fetcher:async raw=>{
  if(String(raw).includes('/api/v1/'))return response(JSON.stringify({results:[]}));
  throw Error('Government RSS unreachable');
 }});
 assert.equal(empty.status,'no-relevant-publication');
 assert.equal(empty.policy,null);
 const down=await screenOfficialTradePolicy({now,fetcher:async()=>{throw Error('offline')}});
 assert.equal(down.status,'sources-unavailable');
 assert.equal(down.policy,null);
});
test('unverified original page cannot be promoted',async()=>{
 const r=await screenOfficialTradePolicy({now,fetcher:async raw=>{
  if(String(raw).includes('/api/v1/'))return response(JSON.stringify({results:[{title,abstract:'sugar tariff',html_url:official,publication_date:'2030-06-08',type:'RULE'}]}));
  return response('<html><title>Different document</title></html>','text/html');
 }});
 assert.equal(r.policy,null);
 assert.equal(r.status,'no-relevant-publication');
});
test('Korean official RSS metadata parsed, independently checked',async()=>{
 const url='https://www.customs.go.kr/kcs/synthetic-policy-announcement';
 const ko='원당 수입 할당관세 조정안 행정예고 안내';
 const xml=`<?xml version="1.0"?><rss version="2.0"><channel><item><title><![CDATA[${ko}]]></title><link>${url}</link><description>원당 할당관세 조정 제안</description><pubDate>Sat, 08 Jun 2030 00:00:00 GMT</pubDate></item></channel></rss>`;
 const r=await screenOfficialTradePolicy({now,fetcher:async raw=>{
  const u=new URL(raw);
  if(u.hostname.endsWith('customs.go.kr') && u.pathname.endsWith('selectBoardRss.do'))return response(xml,'application/rss+xml');
  if(u.href===url)return response(`<html><head><title>${ko}</title></head><body><h1>${ko}</h1></body></html>`,'text/html');
  if(u.hostname==='www.federalregister.gov')return response(JSON.stringify({results:[]}));
  throw Error('unexpected request');
 }});
 assert.equal(r.policy?.url,url);
 assert.equal(screenOfficialItem({title:ko,description:'원당 관세',url:url.replace('https:','http:'),date:'2030-06-08',sourceName:'관세청',source:'korea'},now)?.url,url);
 assert.equal(r.policy?.jurisdiction,'대한민국');
 assert(r.policy.commodities.includes('sugar'));
});
