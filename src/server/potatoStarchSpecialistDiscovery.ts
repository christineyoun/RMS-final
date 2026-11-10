/** Direct specialty-sector discovery. Indexes suggest URLs only; original publisher
 * verification and Korean-summary approval are separate mandatory stages.
 * Fixed publisher section URLs are adapters, NOT fixed article content.
 */
import {load} from 'cheerio';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';

const clean=(s:string)=>String(s||'').replace(/\s+/g,' ').trim();
const MONTHS=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const dutch=/(?:\bavebe\b|zetmeel(?:aardappelen|fabriek|productie|prijzen?)|starch[ -]?potato)/i;
const drivers=/(?:prijs|prijzen|volume|aanvoer|lever|verwerk|droogte|oogst|ton|afreken|tekort|productie|supply|price|cost|production|contract)/i;
const AGE_DAYS=60;
const INDEX='https://www.boerenbusiness.nl/trefwoord/142/bedrijfsnieuws-avebe';

/** Strict date read from THIS original page; never borrow another card's date. */
export function originalBoerenbusinessDate(html:string,now=new Date()):string|null{
 const $=load(html);
 const explicit=String($('meta[property="article:published_time"]').attr('content')||
   $('meta[itemprop="datePublished"]').attr('content')||$('time[datetime]').first().attr('datetime')||'');
 // A DOM .text() call concatenates adjacent elements without a separator.
 // Keep semantic boundaries before reading the date near this article's headline.
 // Do not search sidebars, navigation or unrelated article cards for a date.
 const page=($('main').first().length?$('main').first():$('body').first()).clone();
 page.find('script,style,nav,aside,footer').remove();
 const headline=clean(page.find('h1').first().text());
 const marked=(page.html()||'').replace(/<\/(?:h[1-6]|p|div|time|span|small|section|article)>/gi,' $&');
 const separated=clean(load('<main>'+marked+'</main>')('main').text());
 const headingAt=headline?separated.indexOf(headline):-1;
 const nearHeading=headingAt>=0
   ?separated.slice(headingAt+headline.length,headingAt+headline.length+200)
   :'';
 const hit=/\b([0-3]?\d)\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})\b/i.exec(nearHeading);
 const literal=explicit.match(/^(20\d{2})-(\d{2})-(\d{2})/);
 let year:number,month:number,day:number;
 if(literal){year=+literal[1];month=+literal[2]-1;day=+literal[3];}
 else if(hit){year=+hit[3];month=MONTHS.indexOf(hit[2].toLowerCase());day=+hit[1];}
 else return null;
 const d=new Date(Date.UTC(year,month,day,12));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month||d.getUTCDate()!==day||
   d.getTime()>now.getTime()+86400000||now.getTime()-d.getTime()>AGE_DAYS*86400000)return null;
 return d.toISOString().slice(0,10);
}

export function boerenbusinessArticleLinks(html:string):string[]{
 const $=load(html),urls:string[]=[];
 $('a[href]').each((_,link)=>{
  try{
   const u=new URL($(link).attr('href')||'',INDEX);
   if(u.protocol!=='https:'||u.username||u.password||u.port||
      u.hostname.replace(/^www\./,'')!=='boerenbusiness.nl'||
      !/^\/akkerbouw\/aardappelen\/artikel\/\d+\/[^/]+\/?$/.test(u.pathname))return;
   if(!urls.includes(u.href))urls.push(u.href);
  }catch{}
 });
 return urls.slice(0,10);
}

/** Article-level peek supplies truthful dates/headlines, not approved market data. */
export async function discoverPotatoSpecialistNews(fetcher:typeof fetch=fetch,now=new Date()){
 const candidates:RetrievedSourceMetadata[]=[],errors:string[]=[];
 try{
  const response=await fetcher(INDEX,{redirect:'error',signal:AbortSignal.timeout(9500),headers:{Accept:'text/html'}});
  if(!response.ok)throw Error('index HTTP '+response.status);
  const index=await response.text();
  if(index.length>1_500_000)throw Error('index too large');
  const urls=boerenbusinessArticleLinks(index);
  // Limit original-page peeks. All pages must still pass the full verifier later.
  const checked=await Promise.all(urls.slice(0,8).map(async(url,i)=>{
   try{
    const res=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8500),headers:{Accept:'text/html'}});
    if(!res.ok||!String(res.headers.get('content-type')||'').includes('html'))return null;
    const html=await res.text();if(html.length>1_600_000)return null;
    const $=load(html);
    const title=clean($('h1').first().text()||$('meta[property="og:title"]').attr('content')||'');
    if(title.length<20||title.length>230||!dutch.test(title)||!drivers.test(title))return null;
    const publishedAt=originalBoerenbusinessDate(html,now);if(!publishedAt)return null;
    return {rawId:'potato-sector-original-'+i,rawTitle:title,rawSnippet:'',originalUrl:url,
      publishedAt,sourceName:'Boerenbusiness',sourceType:'news' as const,retrievedAt:now.toISOString()};
   }catch{return null;}
  }));
  candidates.push(...checked.filter((x):x is NonNullable<typeof x>=>x!==null));
 }catch{errors.push('Boerenbusiness starch-potato publisher index unavailable');}
 return {candidates,errors};
}
