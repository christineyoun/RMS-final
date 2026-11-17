import assert from 'node:assert/strict';
import {test} from 'node:test';
import {discoverErsReportSeries,inspectErsReport,readErsRelease} from '../ersReportNews.ts';
import {verifyOtherCommodityArticles} from '../all8ArticleVerification.ts';
import {jsPDF} from 'jspdf';

const hub='https://www.ers.usda.gov/api/publications/v1.0?series=OCS';
const release='https://www.ers.usda.gov/publications/999890';
const document='https://www.ers.usda.gov/media/9998/ocs-29m.pdf';
const html=`<main><h1>Oil Crops Outlook: April 2029</h1><div>by Test Publisher</div>
  <div>4/12/2029</div><div>OCS-29m</div><h2>Overview</h2>
  <p>Overview of commodities and agricultural production.</p><h2>Full Report</h2>
  <a href="${document}">Download</a></main>`;
const forecast='USDA raised the global soybean oil consumption forecast to 71 million metric tons as food demand increased in major importing markets.';
const report='Oil Crops Outlook: April 2029 April 12, 2029 OCS-29m. '+forecast;
const web=(body:BodyInit,type='text/html')=>new Response(body,{headers:{'content-type':type}});
const fetcher=(async (url:string)=>{
  if(url===hub)return web(JSON.stringify({rows:[{
    id:'999890',url:'/publications/999890',series:{code:'OCS'},
    title:'Oil Crops Outlook: April 2029',releaseDate:'2029-04-12',reportNumber:'OCS-29m'
  }]}),'application/json');
  if(url===release)return web(html);
  if(url===document)return web('%PDF-1.7','application/pdf');
  throw Error('Unexpected URL '+url);
}) as typeof fetch;
test('discovers an unseen edition and uses the release date, not the index date', async()=>{
  const {candidates}=await discoverErsReportSeries(hub,fetcher,new Date('2029-04-15'));
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].originalUrl,release);
  assert.equal(candidates[0].publishedAt,'2029-04-12');
  assert.equal(candidates[0].rawSnippet,'');
});
test('binds report evidence to the same publisher, issue, date and commodity', async()=>{
  const checked=await inspectErsReport(html,new URL(release),/soybean oil/i,fetcher,async()=>report);
  assert.ok(checked?.snippet.includes(forecast));
  assert.match(checked.documentSha256,/^[a-f0-9]{64}$/);
  assert.equal(await inspectErsReport(html,new URL(release),/palm oil/i,fetcher,async()=>report),null);
  assert.equal(await inspectErsReport(html,new URL(release),/soybean oil/i,fetcher,async()=>report.replace('OCS-29m','OCS-29n')),null);
  assert.equal(readErsRelease(html.replace(document,document.replace('www.ers.usda.gov','example.org')),new URL(release)),null);
});
test('shared verifier accepts an unseen relevant PDF but rejects that PDF for an unrelated commodity', async()=>{
  const now=new Date(), date=now.toISOString().slice(0,10);
  const [yyyy,mm,dd]=date.split('-');
  const dateLabel=new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
  const title='Oil Crops Outlook: '+dateLabel.replace(/ \d+,/,'');
  const announcement=html.replace('Oil Crops Outlook: April 2029',title).replace('4/12/2029',`${mm}/${dd}/${yyyy}`);
  const paragraph=forecast+' Soybean oil inventories are projected lower following increased industrial use and a broader rise in consumption. Global soybean oil exports are projected higher as demand grows in major importing markets. The forecast remains subject to changes in production, prices, and demand during the marketing year.';
  const doc=new jsPDF();
  doc.text(doc.splitTextToSize(title+'. '+dateLabel+' OCS-29m. '+paragraph,175),15,18);
  const original=globalThis.fetch;
  try {
    globalThis.fetch=(async (url:string)=>{
      if(url===release)return web(announcement);
      if(url===document)return web(doc.output('arraybuffer'),'application/pdf');
      throw Error('Unexpected URL '+url);
    }) as typeof fetch;
    const candidate={rawId:'test-new-release',rawTitle:title,rawSnippet:'',originalUrl:release,
      retrievedAt:now.toISOString(),publishedAt:date,sourceType:'official' as const,sourceName:'USDA ERS'};
    const reasons:string[]=[];
    const accepted=await verifyOtherCommodityArticles([candidate],'soybean-oil',r=>reasons.push(r.reason));
    assert.equal(accepted.length,1,reasons.join(', '));
    assert.match(accepted[0].rawSnippet,/71 million metric tons/);
    assert.equal(accepted[0].evidenceDocument?.url,document);
    assert.equal((await verifyOtherCommodityArticles([candidate],'palm-oil')).length,0);
  } finally { globalThis.fetch=original; }
});
