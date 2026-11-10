import {visibleHeadlineArticleDate} from './newsVisibleArticleDate.ts';
import {publisherVerifiedDate} from './newsPublisherDateAuthority.ts';
import {structuredArticleDate} from './newsStructuredArticleDate.ts';
import {isNarrativeMarketDocument} from './newsDocumentType.ts';
import {verifyWithBoundedBackfill} from './newsVerifiedBackfill.ts';
import {hasMarketArticleBody} from './newsEvidenceQuality.ts';
/** Conservative original-publisher check for non-pilot RMS commodities.
 * Article candidates from model search are not accepted just because a URL exists.
 */
import { load } from 'cheerio';
import {originalBoerenbusinessDate} from './potatoStarchSpecialistDiscovery.ts';
import {materialMarketHeadline,potatoStarchMarketSubject} from './newsCandidateQuality.ts';
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';
const topics:Record<string,RegExp>={
  'soybean-oil':/soybean\s*oil|soya\s*oil|soyoil|대두유/i,
  'palm-oil':/palm\s*oil|palm\s*olein|\bCPO\b|palm\s*kernel|팜유/i,
  sugar:/sugar|sugarcane|raw\s*sugar|원당|설탕/i,
  'potato-starch':/potato\s*starch|starch\s*potato|potato\s*processing|zetmeelaardappelen|zetmeel|avebe|감자\s*전분/i,
  'tapioca-starch':/tapioca|cassava\s*starch|cassava\s*root|카사바|타피오카/i,
};
const forbiddenHost=/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
function checkedUrl(s:string){
  try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    !forbiddenHost.test(u.hostname)&&!u.hostname.endsWith('.local')&&!/\/search(?:\/|\?|$)/.test(u.pathname)?u:null;
  }catch{return null;}
}
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
async function inspect(a:RetrievedSourceMetadata,key:string,onReject?:(reason:string)=>void):Promise<RetrievedSourceMetadata|null>{
  const reject=(reason:string):null=>{onReject?.(reason);return null;};
  const url=checkedUrl(a.originalUrl);if(!url||a.unavailable)return reject('unsafe-or-unavailable-url');if(!materialMarketHeadline(a.rawTitle))return reject('non-market-discovery-headline');
  const allowed=topics[key];if(!allowed)return reject('unsupported-commodity');
  // Unknown publishers remain preserved on disk, but cannot establish procurement evidence.
  // Do not pre-approve or reject publishers by a frozen commodity-specific
  // domain list. Every candidate must pass the SAME original HTML, headline,
  // article-body, commodity-topic and publication-date checks below.
  // The HTTPS/public-host restrictions above remain mandatory.
  try{
    const r=await fetch(url.toString(),{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'User-Agent':'Mozilla/5.0 (compatible; RMS Market Quality/1.0)','Accept':'text/html'}});
    if(!r.ok||!String(r.headers.get('content-type')).includes('html'))return reject('publisher-unavailable-or-non-html');
    const body=await r.text();if(!body.trim()||body.length>2_000_000)return reject('publisher-body-empty-or-oversized');
    const $=load(body);const publisherJsonLd=$('script[type="application/ld+json"]').toArray().map(node=>$(node).html()||'');$('script,style,noscript,nav,footer,header').remove();
    const headline=clean($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').first().text());
    const articleText=clean($('article').first().text());
      const mainText=clean($('main').first().text());
      const text=articleText.length>=400
        ? articleText
        : mainText.length>=400
          ? mainText
          : clean($('body').text());
    const headText=clean(headline+' '+text.slice(0,6000));
    if(!materialMarketHeadline(headline))return reject('non-market-publisher-headline');
    if(key==='potato-starch'&&!potatoStarchMarketSubject(headline,text))return reject('irrelevant-market-subject');
    if(!headline||!hasMarketArticleBody(text,headline))return reject('not-substantive-article');if(!allowed.test(headText))return reject('commodity-relevance-not-established');
    if(!isNarrativeMarketDocument({
      headline, articleText, mainText:text,
      paragraphs:$('article p, main p').toArray().map(node=>clean($(node).text())),
      hasArticleMarkup:$('article').length>0
    }))return null;
    const metadataDate=String($('meta[property="article:published_time"]').attr('content')||$('meta[name="date"]').attr('content')||$('time[datetime]').first().attr('datetime')||'');
      // USDA ERS Charts of Note displays its publication date in the page body.
      // Only use this fallback for the known official ERS article format.
      const isErsChart=/^(?:www\.)?ers\.usda\.gov$/.test(url.hostname)&&url.pathname.startsWith('/data-products/charts-of-note/');
      const visibleDate=isErsChart?mainText.slice(0,1200).match(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/20\d{2}\b/):null;
      const visibleParts=visibleDate?.[0].split('/')||[];
      const visibleIso=visibleDate ? [visibleParts[2],visibleParts[0].padStart(2,'0'),visibleParts[1].padStart(2,'0')].join('-')+'T00:00:00Z' : '';
      const structuredDate=structuredArticleDate({scripts:publisherJsonLd,headline});
      const date=metadataDate||visibleIso||structuredDate||visibleHeadlineArticleDate({headline,pageText:clean($('body').text()),provisionalIndexDate:a.publishedAt});
    const tqVisibleDate = (() => {
      // Accept a visible date only on TQ Industry's article pages.
      if(url.hostname.replace(/^www\./,'')!=='tqindustry.com')
        return '';

      const visible=clean($('main').first().text()).slice(0,1800);
      const match=visible.match(/\bPublished\s+([0-3]?\d)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
      if(!match)return '';

      const months=[
        'january','february','march','april','may','june',
        'july','august','september','october','november','december'
      ];
      const month=months.indexOf(match[2].toLowerCase());
      if(month<0)return '';

      const published=new Date(Date.UTC(
        Number(match[3]),month,Number(match[1]),12
      ));

      return published.getUTCMonth()===month &&
        published.getUTCDate()===Number(match[1])
          ?published.toISOString():'';
    })();

    const industryVisibleDate=(()=>{
      if(date || !['mpoc.org.my','potatopro.com'].includes(url.hostname.replace(/^www\./,'')))return '';
      // Require the index date to also appear on the accessible original page.
      const iso=String(a.publishedAt||'').slice(0,10);
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(iso))return '';
      const dt=new Date(iso+'T12:00:00Z');
      if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==iso)return '';
      const mon=dt.toLocaleString('en-US',{month:'long',timeZone:'UTC'});
      const day=String(dt.getUTCDate());
      const year=String(dt.getUTCFullYear());
      const text=clean($('main').first().text()+' '+$('article').first().text()).slice(0,6000);
      const dayFirst=new RegExp('\\b0?'+day+'\\s+'+mon.slice(0,3)+'(?:[a-z]+)?\\s+'+year+'\\b','i');
      const monFirst=new RegExp('\\b'+mon.slice(0,3)+'(?:[a-z]+)?\\s+0?'+day+',?\\s+'+year+'\\b','i');
      return dayFirst.test(text)||monFirst.test(text)?dt.toISOString():'';
    })();
    // RMS_MI_POTATO_ORIGINAL_FEED_V4: publisher-visible DD.MM.YYYY article date.
    const potatoIndustryVisibleDate=(()=>{
      if(date||url.hostname.replace(/^www\./,'')!=='potatoes.news')return '';
      const visible=clean($('main').first().text()||$('article').first().text()).slice(0,2200);
      const m=visible.match(/\b([0-3]?\d)\.([01]?\d)\.(20\d{2})\b/);
      if(!m)return '';
      const dd=Number(m[1]),mm=Number(m[2]),yyyy=Number(m[3]);
      const parsed=new Date(Date.UTC(yyyy,mm-1,dd,12));
      if(parsed.getUTCDate()!==dd||parsed.getUTCMonth()!==mm-1||parsed.getUTCFullYear()!==yyyy)return '';
      return parsed.toISOString();
    })();

    const vietBacVisibleDate=(()=>{
      if(date||url.hostname.replace(/^www\./,'')!=='vietbacagroimex.com'||
         !url.pathname.startsWith('/en/posts/'))return '';
      const text=clean($('main').first().text()||$('body').text()).slice(0,3500);
      const m=/\bPublished:\s*([0-3]?\d)\/([01]?\d)\/(20\d{2})\b/i.exec(text);
      if(!m)return '';
      const dd=Number(m[1]),mm=Number(m[2]),yyyy=Number(m[3]);
      const d=new Date(Date.UTC(yyyy,mm-1,dd,12));
      return d.getUTCDate()===dd&&d.getUTCMonth()===mm-1&&d.getUTCFullYear()===yyyy
        ?d.toISOString():'';
    })();
    const boerenbusinessVisibleDate=key==='potato-starch' &&
      url.hostname.replace(/^www\./,'')==='boerenbusiness.nl'
      ? originalBoerenbusinessDate(body)||'' : '';
    // A publisher's human-visible calendar date is authoritative over a
    // UTC-shifted metadata timestamp. Restricted to PotatoPro's own article
    // heading, never related-article dates or a fixed story identifier.
    const potatoProVisibleDate=(()=>{
      if(key!=='potato-starch'||url.hostname.replace(/^www\./,'')!=='potatopro.com'||
        !/^\/news\/20\d{2}\//.test(url.pathname))return '';
      const headlineText=clean($('h1').first().text());
      if(!headlineText)return '';
      const main=clean($('main').first().text()||$('body').text());
      const at=main.indexOf(headlineText);
      if(at<0)return '';
      const portion=main.slice(at+headlineText.length,at+headlineText.length+850);
      const match=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([0-3]?\d),?\s+(20\d{2})\b/i.exec(portion);
      if(!match)return '';
      const names=['january','february','march','april','may','june','july','august','september','october','november','december'];
      const month=names.indexOf(match[1].toLowerCase());
      const published=new Date(Date.UTC(+match[3],month,+match[2],12));
      return published.getUTCMonth()===month&&published.getUTCDate()===+match[2]&&published.getUTCFullYear()===+match[3]
        ?published.toISOString():'';
    })();
    if(!date&&!tqVisibleDate&&!industryVisibleDate&&!potatoIndustryVisibleDate&&!vietBacVisibleDate&&!boerenbusinessVisibleDate&&!potatoProVisibleDate)return reject('publisher-date-not-established');
    if(potatoProVisibleDate&&date&&Math.abs(Date.parse(potatoProVisibleDate)-Date.parse(date))>86400000)return reject('contradictory-publisher-dates');
    const pubDate=new Date(potatoProVisibleDate||date||tqVisibleDate||industryVisibleDate||potatoIndustryVisibleDate||vietBacVisibleDate||boerenbusinessVisibleDate);
    if(!Number.isFinite(pubDate.getTime())||Date.now()-pubDate.getTime()>(key==='potato-starch'?61:31)*86400000||pubDate.getTime()>Date.now()+86400000)return reject('invalid-or-expired-publisher-date');
    const day=publisherVerifiedDate(pubDate,a.publishedAt,new Date(),key==='potato-starch'?61:31);
    if(!day)return null;
    
    return {...a,rawTitle:headline.slice(0,200),rawSnippet:text.slice(0,5000),publishedAt:day,
      sourceName:url.hostname.replace(/^www\./,''),unavailable:false};
  }catch{return reject('publisher-fetch-or-parse-error');}
}
export async function verifyOtherCommodityArticles(
  items:RetrievedSourceMetadata[],key:string,
  onRejected?:(item:{url:string;reason:string})=>void
){
  const selected=items.filter(v=>v.originalUrl&&!v.unavailable).slice(0,32);
  return verifyWithBoundedBackfill(selected,a=>inspect(a,key,reason=>onRejected?.({url:a.originalUrl,reason})));
}
