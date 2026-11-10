import test from 'node:test';
import assert from 'node:assert/strict';
import {boerenbusinessArticleLinks,discoverPotatoSpecialistNews,originalBoerenbusinessDate} from '../potatoStarchSpecialistDiscovery.ts';
import {newsRetentionDays} from '../newsRetentionPolicy.ts';
import {potatoStarchMarketSubject} from '../newsCandidateQuality.ts';
import {hasMarketArticleBody} from '../newsEvidenceQuality.ts';
import {hasPotatoStarchLink} from '../newsEditorialPolicy.ts';
const now=new Date('2026-11-05T09:00:00Z');
const index=`<main>
<a href="/akkerbouw/aardappelen/artikel/10917153/aardappelprijs-avebe-gaat-met-10-euro-per-ton-omhoog">Avebe prijs</a>
<a href="/akkerbouw/aardappelen/artikel/10917046/avebe-aardappelen-naar-buitenlandse-verwerkers">Avebe transport</a>
<a href="https://evil.example/akkerbouw/aardappelen/artikel/10917153/malicious">Impostor</a>
</main>`;
const original=(date:string,headline:string)=>`<html><head><meta property="og:title" content="${headline}"/></head><body><main><h1>${headline}</h1><p>${date} - redacteur</p><article>${headline}. Avebe heeft meer zetmeelaardappelen nodig, maar lagere volumes en droogte beperken de aanvoer en prijs. De prijs is gestegen en de betaling komt volgende maand. Verwerking en leveringen zijn aangepast.</article></main></body></html>`;
test('original Dutch dates are civil dates, bounded and not invented',()=>{
 assert.equal(originalBoerenbusinessDate(original('8 Oktober 2026','Aardappelprijs Avebe gaat met 10 euro per ton omhoog'),now),'2026-10-08');
 assert.equal(originalBoerenbusinessDate(original('22 September 2026','Avebe-aardappelen naar buitenlandse verwerkers'),now),'2026-09-22');
 assert.equal(originalBoerenbusinessDate(original('8 Januari 2026','Aardappelprijs Avebe gaat omhoog'),now),null);
 assert.equal(originalBoerenbusinessDate(original('31 November 2026','Aardappelprijs Avebe gaat omhoog'),now),null);
});
test('visible article date must belong to the article header, not a sidebar',()=>{
 const html='<main><h1>Avebe reports starch-potato supply conditions</h1>'+
   '<article><p>No dated publication notice here. Supply and price details follow.</p></article>'+
   '<aside><p>8 Oktober 2026</p></aside></main>';
 assert.equal(originalBoerenbusinessDate(html,now),null);
});
test('adjacent HTML elements are treated as separate date-bearing text',()=>{
 const html='<main><h1>Avebe potato starch costs rise</h1><div><time>8 Oktober 2026</time></div></main>';
 assert.equal(originalBoerenbusinessDate(html,now),'2026-10-08');
});
test('index only accepts original publisher article links',()=>{
 assert.equal(boerenbusinessArticleLinks(index).length,2);
});
test('live pattern discovers dated original stories but never approves summaries',async()=>{
 const calls:string[]=[];
 const fetcher=(async(input:any)=>{
  const url=String(input);calls.push(url);
  const html=url.includes('10917153')?original('8 Oktober 2026','Aardappelprijs Avebe gaat met 10 euro per ton omhoog'):
    url.includes('10917046')?original('22 September 2026','Avebe-aardappelen naar buitenlandse verwerkers'):index;
  return new Response(html,{status:200,headers:{'content-type':'text/html'}});
 }) as typeof fetch;
 const out=await discoverPotatoSpecialistNews(fetcher,now);
 assert.equal(out.candidates.length,2);
 assert.deepEqual(out.candidates.map(x=>x.publishedAt),['2026-10-08','2026-09-22']);
 assert.ok(out.candidates.every(x=>x.rawSnippet===''));
 assert.equal(out.candidates[0].sourceName,'Boerenbusiness');
 assert.equal(calls.length,3);
});
test('Dutch original market language passes source-body gate without using fabricated English',()=>{
 const title='Aardappelprijs Avebe gaat met 10 euro per ton omhoog';
 const body='Avebe betaalt telers meer voor zetmeelaardappelen. De prijs stijgt door droogte en lager volume van leveringen.';
 assert.equal(potatoStarchMarketSubject(title,body),true);
 assert.equal(hasMarketArticleBody(body,title),true);
 assert.equal(hasPotatoStarchLink({sourceHeadline:title}),true);
});
test('starch retention window is configured without changing seven other commodities',()=>{
 assert.equal(newsRetentionDays('potato-starch'),60);
 for(const id of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','tapioca-starch'])
  assert.equal(newsRetentionDays(id),30);
});
