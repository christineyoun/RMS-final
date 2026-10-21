/** Free Soybean editorial cards bound to retained original evidence, not generated summaries.
 * Uses the same content-addressed receipt directory/schema as Palm. Saved Gemini snapshots stay immutable. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {load} from 'cheerio';
import {discoverSoybeanFreeSources} from './soybeanVerifiedNews.ts';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const clean=(v:string)=>v.replace(/[\u2011\u2010]/g,'-').replace(/\s+/g,' ').trim();
export const SOYBEAN_NEWS_CARDS=[
 {originalUrl:'https://commodity-board.com/soybeans-slip-as-harvest-accelerates-and-us-exports-edge-ahead-of-brazil',sourceName:'Commodity Board',sourceHeadline:'Soybeans Slip as Harvest Accelerates and US Exports Edge Ahead of Brazil',publishedAt:'2026-10-19',title:'미국 대두 수확 가속 및 수출 경쟁력 강화',summary:'Commodity Board는 미국 수확 여건 개선과 기술적 매도로 대두 선물이 하락했다고 보도했습니다. 10월 15일 기준 11월 선적 미국산 FOB 오퍼가 브라질산보다 낮았으며, 중국의 추가 관세는 수요 제약 요인으로 제시됐습니다.',patterns:[/technical selling.*improving US harvest weather/i,/October 15.*November shipment.*505\.23.*517\.38/,/10%.*(?:import tariff|Chinese import tariff)/i]},
 {originalUrl:'https://commodity-board.com/soybeans-steady-as-futures-firm-but-physical-differentials-diverge',sourceName:'Commodity Board',sourceHeadline:'Soybeans Steady as Futures Firm but Physical Differentials Diverge',publishedAt:'2026-10-19',title:'대두 선물 소폭 반등·마토그로소 파종 진척',summary:'Commodity Board는 CBOT 대두 선물이 소폭 반등하고 산지별 현물 가격은 엇갈렸다고 전했습니다. 브라질 마토그로소의 2026/27년 대두 파종률은 약 52%로 5년 평균 약 43%를 앞섰지만, 일부 북부 지역의 건조 우려도 함께 보도했습니다.',patterns:[/Soybean futures are edging higher on the CBOT/i,/2026\/27 soybean planting.*Mato Grosso planting is reported at around 52% complete, ahead of its five-year average near 43%.*northern areas.*dryness/i]},
 {originalUrl:'https://www.world-grain.com/articles/23333-plenty-of-grain-but-lots-of-questions',sourceName:'World Grain',sourceHeadline:'Plenty of grain but lots of questions',publishedAt:'2026-10-15',title:'미국 대두 공급 증가와 수확·관세 변수',summary:'World Grain은 USDA의 9월 2026/27년 미국 대두 생산 전망을 45억 3,500만 부셸로 전했습니다. 10월 초 수확 지연에 따른 일시적 현물 공급 제약과 중국의 추가 관세가 민간 수입 수요에 미치는 영향을 함께 보도했습니다.',patterns:[/USDA in September raised its 2026-27 soybean production forecast to 4\.535 billion bushels/i,/Harvest was 25% complete as of Oct\. 4.*five-year average of 33%/i,/additional 10% tariff on US soybeans intact.*private Chinese crushers/i]},
 {originalUrl:'https://www.ers.usda.gov/topics/crops/soybeans-and-oil-crops/market-outlook',sourceName:'USDA ERS',sourceHeadline:'Soybeans and Oil Crops - Market Outlook',publishedAt:'2026-10-15',title:'USDA, 2026/27 미국 대두 생산 전망치 상향',summary:'USDA는 단수 상향에 힘입어 2026/27년 미국 대두 생산량을 45억 6,000만 부셸로 2,700만 부셸 상향 조정했습니다. 수출 전망은 1,000만 부셸 늘어난 약 17억 부셸이며, 기말 재고는 3억 1,500만 부셸로 예상됩니다.',patterns:[/2026\/27 U\.S\. soybean production forecast by 27 million bushels to 4\.56 billion bushels/i,/Soybean exports are raised by 10 million bushels to nearly 1\.7 billion bushels/i,/ending stocks for MY 2026\/27 are forecast at 315 million bushels/i]},
] as const;
type Card=typeof SOYBEAN_NEWS_CARDS[number];
export interface SoybeanBrowserRecord {kind:'publisher-browser-record';sourceUrl:string;sourceHeadline:string;publishedAt:string;verifiedAt:string;verificationMethod:'original-publisher-browser';section:string;quote:string;claims:{production:{marketingYear:string;forecastMonth:string;billionBushels:number};harvest:{date:string;percent:number;fiveYearAveragePercent:number};trade:{additionalTariffPercent:number;affectedBuyers:string}}}
const directory=(root:string)=>path.join(root,'.rms-stage3/evidence/articles');
const manifest=(root:string)=>path.join(root,'.rms-stage3/soybean-news-verified.json');
const validDay=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function recent(c:Card,now:Date){return validDay(c.publishedAt)&&Date.parse(c.publishedAt)<=now.getTime()&&now.getTime()-Date.parse(c.publishedAt)<31*86400000;}
function atomic(file:string,value:any){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
export function verifySoybeanNewsHtml(html:string,c:Card){
 if(html.length<500||html.length>2_000_000)return null;
 const $=load(html);const title=clean($('h1').first().text());
 if(title.toLowerCase()!==c.sourceHeadline.toLowerCase())return null;
 const official=c.sourceName==='USDA ERS';
 const raw=official?clean($('main').text()).match(/Updated\s*:\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/i):null;
 const meta=$('meta[property="article:published_time"]').attr('content')||$('time[datetime]').first().attr('datetime')||/"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]||'';
 const publishedAt=raw?`${raw[3]}-${raw[1].padStart(2,'0')}-${raw[2].padStart(2,'0')}`:meta.slice(0,10);
 if(!validDay(publishedAt)||publishedAt!==c.publishedAt)return null;
 $('script,style,nav,header,footer,aside,.related-articles,.related-reports,.related-stories').remove();
 const root=$('article').first().length?$('article').first():$('main').first();const text=clean(root.text());
 if(!c.patterns.every(p=>p.test(text)))return null;
 return {sourceHeadline:title,publishedAt,publicationDateKind:official?'publisher-update':'publication',text};
}
/** Explicit import of an actually inspected browser record. A 403 never creates one automatically. */
export function retainSoybeanBrowserRecord(root:string,record:SoybeanBrowserRecord){
 const c=SOYBEAN_NEWS_CARDS[2];
 if(record.kind!=='publisher-browser-record'||record.verificationMethod!=='original-publisher-browser'||record.sourceUrl!==c.originalUrl||record.sourceHeadline!==c.sourceHeadline||record.publishedAt!==c.publishedAt||record.section!=='대두: 가공 및 중국 수요'||!Number.isFinite(Date.parse(record.verifiedAt))||
   !/in September raised its 2026-27 soybean production forecast to 4\.535 billion bushels/.test(record.quote)||
   JSON.stringify(record.claims)!==JSON.stringify({production:{marketingYear:'2026/27',forecastMonth:'September',billionBushels:4.535},harvest:{date:'2026-10-04',percent:25,fiveYearAveragePercent:33},trade:{additionalTariffPercent:10,affectedBuyers:'중국 민간 가공업체'}}))throw Error('Unsupported original browser evidence');
 const content=JSON.stringify(record),digest=sha(content),receipt={...record,sha256:digest};saveReceipt(root,digest,receipt);return digest;
}
function saveReceipt(root:string,digest:string,receipt:any){fs.mkdirSync(directory(root),{recursive:true,mode:0o700});const f=path.join(directory(root),'article-'+digest+'.json');if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify(receipt),{mode:0o600,flag:'wx'});}
function receiptCard(root:string,digest:string,c:Card,now:Date):any|null {
 try{
  if(!/^[a-f0-9]{64}$/.test(digest)||!recent(c,now))return null;
  const r=JSON.parse(fs.readFileSync(path.join(directory(root),'article-'+digest+'.json'),'utf8'));
  if(r.sourceUrl!==c.originalUrl||r.sha256!==digest||!Number.isFinite(Date.parse(r.verifiedAt))||Date.parse(r.verifiedAt)>now.getTime()+60000)return null;
  let info:any;
  if(r.kind==='publisher-browser-record'){
   const {sha256,...record}=r;if(sha(JSON.stringify(record))!==digest||c.sourceName!=='World Grain')return null;
   // Validate the complete typed record without writing or performing a source request.
   if(record.verificationMethod!=='original-publisher-browser'||record.sourceHeadline!==c.sourceHeadline||record.publishedAt!==c.publishedAt||record.section!=='대두: 가공 및 중국 수요'||
     !/in September raised its 2026-27 soybean production forecast to 4\.535 billion bushels/.test(record.quote)||
     JSON.stringify(record.claims)!==JSON.stringify({production:{marketingYear:'2026/27',forecastMonth:'September',billionBushels:4.535},harvest:{date:'2026-10-04',percent:25,fiveYearAveragePercent:33},trade:{additionalTariffPercent:10,affectedBuyers:'중국 민간 가공업체'}}))return null;
   info={publishedAt:r.publishedAt,sourceHeadline:r.sourceHeadline,publicationDateKind:'publication'};
  }else {if(typeof r.html!=='string'||sha(r.html)!==digest)return null;info=verifySoybeanNewsHtml(r.html,c);if(!info)return null;}
  return {title:c.title,summary:c.summary,sourceHeadline:info.sourceHeadline,publishedAt:info.publishedAt,publicationDateKind:info.publicationDateKind,
   sourceName:c.sourceName,source:c.sourceName,sourceType:c.sourceName==='USDA ERS'?'official':'news',originalUrl:c.originalUrl,retrievedAt:r.verifiedAt,verifiedAt:r.verifiedAt,
   category:'수급 전망',affectedRegion:'글로벌',unavailable:false,linkStatus:'verified',linkCheckedAt:r.verifiedAt,
   receiptSha256:digest,summarySha256:sha(c.summary),verificationMethod:r.kind==='publisher-browser-record'?'retained-original-browser-evidence':'retained-original-html'};
 }catch{return null;}
}
export function readVerifiedSoybeanNews(root=process.cwd(),now=new Date()):any[]{
 let saved:any;try{saved=JSON.parse(fs.readFileSync(manifest(root),'utf8'));}catch{return [];}
 const seen=new Set<string>();return (saved.articles||[]).flatMap((a:any)=>{
  const c=SOYBEAN_NEWS_CARDS.find(c=>c.originalUrl===a.originalUrl);if(!c||seen.has(c.originalUrl)||a.summarySha256!==sha(c.summary))return [];
  const verified=receiptCard(root,a.receiptSha256,c,now);if(!verified)return [];seen.add(c.originalUrl);return [verified];
 });
}
function retainedReceipt(root:string,c:Card,now:Date){
 const files=fs.existsSync(directory(root))?fs.readdirSync(directory(root)).filter(n=>/^article-[a-f0-9]{64}\.json$/.test(n)):[];
 return files.flatMap(f=>{const card=receiptCard(root,f.slice(8,-5),c,now);return card?[card]:[];}).sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt))[0]||null;
}
const pending=new Map<string,Promise<any>>();
export function refreshSoybeanNews(root=process.cwd(),fetcher:typeof fetch=fetch,options:{now?:Date;discover?:typeof discoverSoybeanFreeSources}={}){
 const key=path.resolve(root),existing=pending.get(key);if(existing)return existing;
 const job=refreshNow(root,fetcher,options).finally(()=>pending.delete(key));pending.set(key,job);return job;
}
async function refreshNow(root:string,fetcher:typeof fetch,options:{now?:Date;discover?:typeof discoverSoybeanFreeSources}){
 const now=options.now||new Date(),startedAt=now.toISOString(),id=randomUUID(),prior=readVerifiedSoybeanNews(root,now);
 const results=await Promise.all(SOYBEAN_NEWS_CARDS.map(async c=>{
  if(!recent(c,now))return {url:c.originalUrl,status:'expired',article:null,error:'Outside current 31-day news window'};
  try{
   const r=await fetcher(c.originalUrl,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
   if(!r.ok||!r.headers.get('content-type')?.includes('html'))throw Error('Publisher HTTP '+r.status);
   const html=await r.text();if(!verifySoybeanNewsHtml(html,c))throw Error('Original headline/date/claim context not verified');
   const digest=sha(html);saveReceipt(root,digest,{sourceUrl:c.originalUrl,verifiedAt:startedAt,sha256:digest,html});
   return {url:c.originalUrl,status:'verified',article:receiptCard(root,digest,c,now)};
  }catch(e){
   const last=prior.find(a=>a.originalUrl===c.originalUrl)||retainedReceipt(root,c,now);
   return {url:c.originalUrl,status:last?'retained':'unavailable',article:last,error:String((e as Error).message)};
  }
 }));
 const articles=results.flatMap(r=>r.article?[r.article]:[]),failures:Array<{url:string;status:string;error?:string}>=results.filter(r=>r.error).map(({url,status,error})=>({url,status,error}));
 const result={version:1,refreshId:id,checkedAt:startedAt,finishedAt:new Date().toISOString(),articles,results:results.map(({article,...r})=>r),failures};
 // Discover new publisher items when coverage ages; never silently manufacture Korean summaries or replace verified cards.
 if(articles.length<4||articles.some(a=>now.getTime()-Date.parse(a.publishedAt)>7*86400000)){
  try{const discovery=await (options.discover||discoverSoybeanFreeSources)(startedAt);atomic(path.join(root,'.rms-stage3/soybean-news-candidates.json'),{checkedAt:startedAt,status:'requires-original-verification-and-editorial-review',...discovery});}
  catch(e){failures.push({url:'public-publisher-discovery',status:'unavailable',error:String((e as Error).message)});}
 }
 atomic(manifest(root),result);fs.appendFileSync(path.join(root,'.rms-stage3/soybean-news-refresh.jsonl'),JSON.stringify({...result,articles:articles.map(a=>({url:a.originalUrl,publishedAt:a.publishedAt,verifiedAt:a.verifiedAt,receiptSha256:a.receiptSha256}))})+'\n',{mode:0o600});
 return {...result,lastError:failures.length?failures.map(f=>f.error).join('; '):undefined};
}
