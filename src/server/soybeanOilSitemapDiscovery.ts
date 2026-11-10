import {load} from 'cheerio';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';

const ROOT = 'https://www.ers.usda.gov/sitemap.xml';
const ARTICLE = /^https:\/\/www\.ers\.usda\.gov\/data-products\/charts-of-note\/(\d+)\/?$/;

export async function discoverErsSoybeanOil(fetcher:typeof fetch=fetch) {
  const errors:string[] = [];
  const candidates:RetrievedSourceMetadata[] = [];

  async function read(url:string) {
    const response = await fetcher(url,{
      redirect:'error',
      signal:AbortSignal.timeout(9000)
    });
    if(!response.ok) throw Error(`HTTP ${response.status}`);
    const content=await response.text();
    if(content.length>2_000_000) throw Error('Response too large');
    return content;
  }

  try {
    const root=load(await read(ROOT),{xmlMode:true});
    const pages=root('loc').map((_,el)=>root(el).text().trim()).get()
      .filter(url=>/^https:\/\/www\.ers\.usda\.gov\/sitemap\.xml\?page=\d+$/.test(url))
      .slice(0,12);

    const xmlPages=await Promise.all(pages.map(async url=>{
      try { return await read(url); }
      catch(e) {
        errors.push(`USDA sitemap unavailable: ${url}`);
        return '';
      }
    }));

    const urls=new Set<string>();
    for(const xml of xmlPages) {
      if(!xml) continue;
      const $=load(xml,{xmlMode:true});
      $('loc').each((_,el)=>{
        const url=$(el).text().trim();
        if(ARTICLE.test(url)) urls.add(url);
      });
    }

    const ranked=[...urls].sort((a,b)=>{
      const ai=Number(a.match(ARTICLE)?.[1]||0);
      const bi=Number(b.match(ARTICLE)?.[1]||0);
      return bi-ai;
    }).slice(0,36);

    for(let start=0;start<ranked.length&&candidates.length<4;start+=6) {
      const batch=await Promise.all(ranked.slice(start,start+6).map(async url=>{
        try {
          const $=load(await read(url));
          const title=($('meta[property="og:title"]').attr('content')
            ||$('h1').first().text()).replace(/\s+/g,' ').trim();
          const main=$('main').first().text().replace(/\s+/g,' ').trim();

          if(!/soybean\s*oil|soya\s*oil|soyoil/i.test(title)) return null;
          if(main.length<400) return null;

          const match=main.slice(0,1600)
            .match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/);
          if(!match) return null;

          const date=`${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
          const timestamp=Date.parse(`${date}T00:00:00Z`);
          const age=Date.now()-timestamp;
          if(!Number.isFinite(timestamp)||age>30*86400000||age< -86400000)
            return null;

          return {
            rawId:`ers-sitemap-${match[3]}-${url.match(ARTICLE)?.[1]}`,
            rawTitle:title,
            rawSnippet:'',
            originalUrl:url,
            publishedAt:date,
            sourceName:'USDA ERS',
            sourceType:'official' as const,
            retrievedAt:new Date().toISOString()
          };
        } catch {
          return null;
        }
      }));
      candidates.push(...batch.filter((a):a is NonNullable<typeof a>=>a!==null));
    }
  } catch(e) {
    errors.push(`USDA sitemap discovery failed: ${String(e)}`);
  }

  return {candidates:candidates.slice(0,4),errors};
}
