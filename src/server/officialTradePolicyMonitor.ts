/**
 * Free official trade-policy screening. No AI, no legal-effect inference.
 * Search endpoints are stable government *sources*, never saved policy results.
 * Candidate articles must pass official-origin URL, publication date,
 * commodity + trade-policy relevance, and original-page verification.
 */
export type PolicyCandidate = {
  kind:'policy'; title:string; summary:string; publishedOn:string; url:string;
  sourceName:string; jurisdiction:string; recordKind:'proposed'|'announcement';
  commodities:string[]; statusType:'neutral'; statusTag:'원문 검토 필요';
};
export type PolicySourceCheck = {source:string;status:'ok'|'unavailable';candidates:number;error?:string};
export type PolicyScreening = {version:1; checkedAt:string; policy:PolicyCandidate|null;
  reviewedCount:number; sourceChecks:PolicySourceCheck[]; coverage:string;
  status:'verified-official-publication'|'no-relevant-publication'|'sources-unavailable';
};

const DAY=86400000;
const MAX_AGE_DAYS=45;
// The monitored commodity vocabulary is configuration; it does not pin any
// document, event, headline, numerical fact, or procurement recommendation.
const TERMS:[string,RegExp,string][]=[
 ['wheat',/\bwheat\b|\bflour\b|밀|소맥/i,'wheat'],
 ['corn',/\bcorn\b|\bmaize\b|옥수수/i,'corn'],
 ['soybean',/\bsoybeans?\b|\bsoya?\b|대두|콩(?!나물)/i,'soybean'],
 ['soybean-oil',/\bsoybean[\s-]+oil\b|\bsoya[\s-]+oil\b|대두유/i,'soybean oil'],
 ['palm-oil',/\bpalm[\s-]+oil\b|팜유|팜오일/i,'palm oil'],
 ['sugar',/\bsugar\b|\bsucrose\b|설탕|원당/i,'sugar'],
 ['potato-starch',/\bpotato[\s-]+starch\b|감자전분/i,'potato starch'],
 ['tapioca-starch',/\btapioca\b|\bcassava\b|타피오카|카사바/i,'tapioca starch'],
];
const POLICY_WORDS=/(?:\btariffs?\b|\bquotas?\b|\bexport\s+(?:bans?|restrictions?|licenses?|controls?)\b|\bimport\s+(?:bans?|restrictions?|licenses?|controls?)\b|\bdut(?:y|ies)\b|\banti[- ]dumping\b|\bsafeguard\b|\bsanctions?\b|관세|할당|쿼터|수출\s*(?:금지|제한|규제|통제|허가)|수입\s*(?:금지|제한|규제|통제|허가)|덤핑|무역구제|긴급수입제한)/i;
const RSS_FEEDS=[
 {name:'Korea Customs Service — 공고',url:'https://www.customs.go.kr/kcs/selectBoardRss.do?mi=2895&bbsId=1364'},
 {name:'Korea Customs Service — 행정예고',url:'https://www.customs.go.kr/kcs/selectBoardRss.do?mi=2897&bbsId=1366'},
 {name:'Korea Customs Service — 보도자료',url:'https://www.customs.go.kr/kcs/selectBoardRss.do?mi=15265&bbsId=1362'},
];
const FR_ENDPOINT='https://www.federalregister.gov/api/v1/documents.json';

function day(v:unknown):string|null {
 if(typeof v!=='string'||!v.trim())return null;
 const s=v.trim();
 const d=/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):new Date(s).toISOString().slice(0,10);
 if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
 const ms=Date.parse(d+'T12:00:00Z');
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===d?d:null;
}
export function recentOfficialDay(v:unknown,now:Date):string|null {
 let d:string|null=null;try{d=day(v);}catch{return null;}
 if(!d)return null;
 const age=(now.getTime()-Date.parse(d+'T12:00:00Z'))/DAY;
 return age>=-1&&age<=MAX_AGE_DAYS?d:null;
}
const unescapeXml=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"')
 .replace(/&apos;/gi,"'").replace(/&amp;/gi,'&');
const clean=(s:string)=>unescapeXml(s).replace(/<[^>]*>/g,' ').normalize('NFKC').replace(/\s+/g,' ').trim();
function xmlValue(item:string,tag:string):string {
 const re=new RegExp('<(?:[A-Za-z0-9_-]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?'+tag+'>','i');
 return clean(item.match(re)?.[1]||'');
}
function feedItems(xml:string):Array<{title:string;description:string;url:string;date:string}> {
 const found:string[]=[];
 for(const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))found.push(m[1]);
 for(const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi))found.push(m[1]);
 return found.slice(0,70).map(raw=>{
  const link=xmlValue(raw,'link')||unescapeXml(raw.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1]||'');
  return {title:xmlValue(raw,'title'),description:xmlValue(raw,'description')||xmlValue(raw,'summary'),
   url:link,date:xmlValue(raw,'pubDate')||xmlValue(raw,'date')||xmlValue(raw,'published')||xmlValue(raw,'updated')};
 });
}
function canonicalOfficialUrl(url:string,source:'korea'|'us'):string|null {
 try{const u=new URL(url);
  if(source==='korea'&&u.protocol==='http:'&&(u.hostname==='customs.go.kr'||u.hostname.endsWith('.customs.go.kr')))u.protocol='https:';
  if(u.protocol!=='https:')return null;
  const allowed=(
  source==='korea'?(u.hostname==='customs.go.kr'||u.hostname.endsWith('.customs.go.kr')):
  u.hostname==='www.federalregister.gov'&&/^\/documents\/\d{4}\/\d{2}\/\d{2}\//.test(u.pathname)
 );
  return allowed?u.href:null;
 }catch{return null;}
}
export function screenOfficialItem(input:{title:string;description?:string;url:string;date:string;sourceName:string;source:'korea'|'us';documentType?:string}, now=new Date()):PolicyCandidate|null {
 const publishedOn=recentOfficialDay(input.date,now);
 const title=clean(input.title||'');
 const originalUrl=canonicalOfficialUrl(input.url,input.source);
 if(!publishedOn||!title||title.length<15||title.length>280||!originalUrl)return null;
 const searchable=(title+' '+clean(input.description||'')).slice(0,2500);
 if(!POLICY_WORDS.test(searchable))return null;
 const commodities=TERMS.filter(([,rx])=>rx.test(searchable)).map(([id])=>id);
 if(!commodities.length)return null;
 const proposed=input.documentType==='PRORULE'||/행정예고|입법예고|proposed\s+rule/i.test(title);
 return {kind:'policy',title,publishedOn,url:originalUrl,sourceName:input.sourceName,
  jurisdiction:input.source==='korea'?'대한민국':'미국',recordKind:proposed?'proposed':'announcement',
  commodities,statusType:'neutral',statusTag:'원문 검토 필요',
  summary:proposed?'관련 품목의 공식 정책 제안 문서가 확인되었습니다. 확정·시행 여부와 실제 적용 범위를 원문에서 검토해야 합니다.':
   '관련 품목의 공식 무역정책 문서가 확인되었습니다. 적용 품목·원산지·시행일·조달 영향은 원문 확인이 필요합니다.'};
}
function sourceHeadlineIsPresent(html:string,title:string):boolean {
 const page=clean(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));
 const t=title.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(t.length>=14&&page.toLowerCase().includes(t.toLowerCase()))return true;
 // Publisher title may have normalized punctuation/spacing. Require meaningful
 // overlapping words, not merely the commodity name.
 const words=t.toLowerCase().match(/[a-z]{4,}|[가-힣]{2,}/g)||[];
 const distinct=[...new Set(words)];
 return distinct.length>=5&&distinct.filter(w=>page.toLowerCase().includes(w)).length>=Math.ceil(distinct.length*.8);
}
async function fetchText(url:string,fetcher:typeof fetch,accept:string):Promise<string> {
 const res=await fetcher(url,{headers:{Accept:accept,'User-Agent':'RMS-Trade-Policy-Monitor/1.0'},signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('HTTP '+res.status);
 const contentType=res.headers.get('content-type')||'';
 if(!/html|xml|json|text|rss|atom/i.test(contentType))throw Error('Unsupported content type');
 const buf=await res.arrayBuffer();
 if(buf.byteLength>2_000_000)throw Error('Response too large');
 const charset=contentType.match(/charset\s*=\s*['"]?([a-z0-9_-]+)/i)?.[1]||'utf-8';
 try{return new TextDecoder(charset).decode(buf);}catch{return new TextDecoder().decode(buf);}
}
async function verifyOriginal(candidate:PolicyCandidate,fetcher:typeof fetch):Promise<boolean> {
 if(!canonicalOfficialUrl(candidate.url,candidate.jurisdiction==='미국'?'us':'korea'))return false;
 try{
  const html=await fetchText(candidate.url,fetcher,'text/html');
  if(!/<html|<title|<h1\b/i.test(html.slice(0,50000)))return false;
  return sourceHeadlineIsPresent(html,candidate.title);
 }catch{return false;}
}
function dateMinus(now:Date,days:number){return new Date(now.getTime()-days*DAY).toISOString().slice(0,10);}

/** Network only when invoked by scheduled free job or explicit CLI probe. */
export async function screenOfficialTradePolicy(options:{fetcher?:typeof fetch;now?:Date}={}):Promise<PolicyScreening>{
 const now=options.now||new Date(),fetcher=options.fetcher||fetch,checkedAt=now.toISOString();
 const checked:PolicySourceCheck[]=[];const candidates:PolicyCandidate[]=[];
 const jobs:Promise<void>[]=[];
 for(const feed of RSS_FEEDS){
  jobs.push((async()=>{
   try{
    const xml=await fetchText(feed.url,fetcher,'application/rss+xml, application/xml, text/xml');
    if(!/<rss\b|<rdf:RDF\b|<feed\b/i.test(xml.slice(0,2000)))throw Error('Not RSS or Atom');
    const parsed=feedItems(xml).map(x=>screenOfficialItem({...x,sourceName:feed.name,source:'korea'},now)).filter((x):x is PolicyCandidate=>!!x);
    checked.push({source:feed.name,status:'ok',candidates:parsed.length});candidates.push(...parsed);
   }catch(e){checked.push({source:feed.name,status:'unavailable',candidates:0,error:String(e).slice(0,110)});}
  })());
 }
 // Search each commodity in the U.S. Federal Register without assuming an
 // announcement exists. No hardcoded documents or supplier-specific conclusions.
 for(const [id,,query] of TERMS){
  jobs.push((async()=>{
   const label='U.S. Federal Register — '+id;
   try{
    const api=new URL(FR_ENDPOINT);
    api.searchParams.set('conditions[term]',query);
    api.searchParams.set('conditions[publication_date][gte]',dateMinus(now,MAX_AGE_DAYS));
    api.searchParams.set('order','newest');api.searchParams.set('per_page','20');
    const json=JSON.parse(await fetchText(api.toString(),fetcher,'application/json'));
    const records=Array.isArray(json?.results)
      ?json.results
      :(json?.count===0?[]:null);
    if(!records)throw Error('Missing official results');
    const parsed=records.map((r:any)=>screenOfficialItem({title:r.title,description:r.abstract||'',url:r.html_url,date:r.publication_date,
     documentType:r.type,sourceName:'U.S. Federal Register',source:'us'},now)).filter((x:PolicyCandidate|null):x is PolicyCandidate=>!!x);
    checked.push({source:label,status:'ok',candidates:parsed.length});candidates.push(...parsed);
   }catch(e){checked.push({source:label,status:'unavailable',candidates:0,error:String(e).slice(0,110)});}
  })());
 }
 await Promise.all(jobs);
 const unique=[...new Map(candidates.map(x=>[x.url,x])).values()].sort((a,b)=>b.publishedOn.localeCompare(a.publishedOn));
 // Limit page requests, but prioritize current and broadly relevant notices.
 const ordered=unique.sort((a,b)=>b.commodities.length-a.commodities.length||b.publishedOn.localeCompare(a.publishedOn));
 let verified:PolicyCandidate|null=null;
 // Bound total requests and avoid serial multi-minute waits when a publisher fails.
 const checks=ordered.slice(0,12);
 for(let offset=0;offset<checks.length&&!verified;offset+=4){
  const group=checks.slice(offset,offset+4);
  const valid=await Promise.all(group.map(candidate=>verifyOriginal(candidate,fetcher)));
  verified=group.find((_,i)=>valid[i])||null;
 }
 const available=checked.filter(x=>x.status==='ok').length;
 return {version:1,checkedAt,policy:verified,reviewedCount:unique.length,
  sourceChecks:checked.sort((a,b)=>a.source.localeCompare(b.source)),
  coverage:'대한민국 관세청 공식 공지·행정예고·보도자료 및 미국 연방관보(8개 원자재 검색). 다른 국가의 수출 제한은 포괄하지 않습니다.',
  status:verified?'verified-official-publication':available?'no-relevant-publication':'sources-unavailable'};
}
