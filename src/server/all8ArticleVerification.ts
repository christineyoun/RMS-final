import {hasMarketArticleBody} from './newsEvidenceQuality.ts';
/** Conservative original-publisher check for non-pilot RMS commodities.
 * Article candidates from model search are not accepted just because a URL exists.
 */
import { load } from 'cheerio';
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';
const topics:Record<string,RegExp>={
  'soybean-oil':/soybean\s*oil|soya\s*oil|soyoil|대두유/i,
  'palm-oil':/palm\s*oil|palm\s*olein|\bCPO\b|palm\s*kernel|팜유/i,
  sugar:/sugar|sugarcane|raw\s*sugar|원당|설탕/i,
  'potato-starch':/potato\s*starch|starch\s*potato|potato\s*processing|감자\s*전분/i,
  'tapioca-starch':/tapioca|cassava\s*starch|cassava\s*root|카사바|타피오카/i,
};
const forbiddenHost=/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
function checkedUrl(s:string){
  try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    !forbiddenHost.test(u.hostname)&&!u.hostname.endsWith('.local')&&!/\/search(?:\/|\?|$)/.test(u.pathname)?u:null;
  }catch{return null;}
}
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
async function inspect(a:RetrievedSourceMetadata,key:string):Promise<RetrievedSourceMetadata|null>{
  const url=checkedUrl(a.originalUrl);if(!url||a.unavailable)return null;
  const allowed=topics[key];if(!allowed)return null;
  // Unknown publishers remain preserved on disk, but cannot establish procurement evidence.
  if(key==='soybean-oil' && !/(^|\.)(usda\.gov|ers\.usda\.gov|ukragroconsult\.com|world-grain\.com|reuters\.com|agriculture\.com|dtnpf\.com|ahdb\.org\.uk|fas\.usda\.gov|biodieselmagazine\.com)$/.test(url.hostname))return null;
  try{
    const r=await fetch(url.toString(),{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'User-Agent':'Mozilla/5.0 (compatible; RMS Market Quality/1.0)','Accept':'text/html'}});
    if(!r.ok||!String(r.headers.get('content-type')).includes('html'))return null;
    const body=await r.text();if(!body.trim()||body.length>2_000_000)return null;
    const $=load(body);$('script,style,noscript,nav,footer,header').remove();
    const headline=clean($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').first().text());
    const text=clean($('article').first().text()||$('main').first().text()||$('body').text());
    const headText=clean(headline+' '+text.slice(0,6000));
    if(!headline||!hasMarketArticleBody(text,headline)||!allowed.test(headText))return null;
    const date=String($('meta[property="article:published_time"]').attr('content')||$('meta[name="date"]').attr('content')||$('time[datetime]').first().attr('datetime')||'');
    if(!date)return null;
    const pubDate=new Date(date);
    if(!Number.isFinite(pubDate.getTime())||Date.now()-pubDate.getTime()>31*86400000||pubDate.getTime()>Date.now()+86400000)return null;
    const day=pubDate.toISOString().slice(0,10);
    if(a.publishedAt && Math.abs(Date.parse(a.publishedAt)-Date.parse(day))>3*86400000)return null;
    return {...a,rawTitle:headline.slice(0,200),rawSnippet:text.slice(0,5000),publishedAt:day,
      sourceName:url.hostname.replace(/^www\./,''),unavailable:false};
  }catch{return null;}
}
export async function verifyOtherCommodityArticles(items:RetrievedSourceMetadata[],key:string){
  const selected=items.filter(v=>v.originalUrl&&!v.unavailable).slice(0,16);
  const findings=await Promise.all(selected.map(a=>inspect(a,key)));
  return findings.filter((a):a is RetrievedSourceMetadata=>!!a).slice(0,8);
}
