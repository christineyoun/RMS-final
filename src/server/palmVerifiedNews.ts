/** Free, persistent Palm editorial verification. Saved Gemini/news snapshots are immutable.
 * Each Korean card is a curated translation bound to exact original passages. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {load} from 'cheerio';
import {originalArticleFact} from './analysisArticleEvidence.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export const PALM_NEWS_CANDIDATES=[
  {originalUrl:'https://www.briefs.co/news/malaysia-s-palm-oil-output-poised-for-october-record-with-20/',publishedAt:'2026-10-19',title:'말레이시아 10월 팜유 생산량 사상 최고 전망',affectedRegion:'Malaysia',anchors:['20.28 million tons','2025','2027','labor','El Niño'],summary:'Briefs는 업계 관계자를 인용해 말레이시아의 10월 팜유 생산량이 사상 최고를 기록할 수 있다고 보도했습니다. 연간 생산량은 2025년 기록인 2,028만 톤에 도달하거나 넘어설 전망이며, 인력 부족과 엘니뇨의 지연 영향은 2027년 공급 위험으로 제시됐습니다.'},
  {originalUrl:'https://www.sunsirs.com/commodity-news/petail-36906.html',publishedAt:'2026-10-19',title:'말레이시아 10월 상반기 팜유 수출 증가 보도',affectedRegion:'Malaysia',anchors:['43.2%','58.3%','first half of October','previous period'],summary:'SunSirs는 화물 조사기관을 인용해 말레이시아의 10월 상반기 팜유 수출이 비교 기간 대비 43.2%~58.3% 증가했다고 보도했습니다. 해외 수요와 가격 지지에 관한 평가는 해당 매체의 해석이며, 공식 연간 수급 전망과 구분해 확인해야 합니다.'},
  {originalUrl:'https://theedgemalaysia.com/node/821487',publishedAt:'2026-10-12',title:'말레이시아 9월 팜유 재고 24.5% 증가',affectedRegion:'Malaysia',anchors:['24.54%','3.51 million','2.16 million','2.11 million','1.22 million'],summary:'The Edge가 인용한 MPOB 발표에 따르면 말레이시아 9월 팜유 재고는 351만 톤으로 전월 대비 24.54% 증가했고 CPO 재고는 216만 톤이었습니다. CPO 생산량은 211만 톤, 팜유 수출은 122만 톤으로 보도됐습니다.'},
  {originalUrl:'https://prestasisawit.mpob.gov.my/ms/palmnews/news/40027',publishedAt:'2026-10-01',title:'인도네시아 업계, 2027년 바이오디젤 수요와 수출 가용량 위험 전망',affectedRegion:'Indonesia',anchors:['Reuters','2027','Indonesia','56.6 million','17.4 million','26.5 million'],summary:'MPOB가 재게시한 Reuters 보도는 인도네시아 팜유협회 관계자의 2027년 생산 감소·바이오디젤 수요 증가 전망을 전했습니다. 수출 가용량 감소 가능성에 관한 업계 전망이며, 현재 확정된 생산 실적이나 USDA 국가 수급 수치와 동일한 통계가 아닙니다.'},
];
const dir=(root:string)=>path.join(root,'.rms-stage3/evidence/articles');
const manifest=(root:string)=>path.join(root,'.rms-stage3/palm-news-verified.json');
export function verifyPalmArticle(html:string,candidate:typeof PALM_NEWS_CANDIDATES[number],now=new Date()){
  const fact=originalArticleFact(html,candidate.originalUrl,candidate.publishedAt,'palm-oil',now.toISOString());if(!fact)return null;
  const $=load(html);$('script,style,nav,footer,header,aside').remove();const text=$('body').text().replace(/\s+/g,' ').toLowerCase();
  if(!candidate.anchors.every(a=>text.includes(a.toLowerCase())))return null;
  return {...candidate,sourceName:new URL(candidate.originalUrl).hostname.replace(/^www\./,''),sourceHeadline:fact.sourceTitle,sourceType:'news',category:'시장 동향',retrievedAt:now.toISOString(),unavailable:false,linkStatus:'verified',receiptSha256:sha(html),summarySha256:sha(candidate.summary)};
}
export function readVerifiedPalmNews(root=process.cwd(),now=new Date()):any[]{
  let saved:any;try{saved=JSON.parse(fs.readFileSync(manifest(root),'utf8'));}catch{return [];}
  return (saved.articles||[]).flatMap((a:any)=>{try{
    const candidate=PALM_NEWS_CANDIDATES.find(c=>c.originalUrl===a.originalUrl);if(!candidate||a.summarySha256!==sha(candidate.summary))return [];
    const receipt=JSON.parse(fs.readFileSync(path.join(dir(root),'article-'+a.receiptSha256+'.json'),'utf8'));
    if(sha(receipt.html)!==a.receiptSha256||receipt.sourceUrl!==a.originalUrl||!verifyPalmArticle(receipt.html,candidate,now))return [];
    return [{...a,summary:candidate.summary}];
  }catch{return [];}});
}
const pending=new Map<string,Promise<any>>();
export function refreshPalmNews(root=process.cwd(),fetcher:typeof fetch=fetch){
  const existing=pending.get(root);if(existing)return existing;
  const job=refreshPalmNewsNow(root,fetcher).finally(()=>pending.delete(root));pending.set(root,job);return job;
}
async function refreshPalmNewsNow(root:string,fetcher:typeof fetch){
  const prior=readVerifiedPalmNews(root),articles:any[]=[],failures:any[]=[];
  for(const candidate of PALM_NEWS_CANDIDATES){try{
    const r=await fetcher(candidate.originalUrl,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
    if(!r.ok||!r.headers.get('content-type')?.includes('html'))throw Error('HTTP '+r.status);
    const html=await r.text();if(html.length>2_000_000)throw Error('body-limit');
    const article=verifyPalmArticle(html,candidate);if(!article)throw Error('Original publication date, topic or material numerical passage not verified');
    fs.mkdirSync(dir(root),{recursive:true,mode:0o700});const file=path.join(dir(root),'article-'+article.receiptSha256+'.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({sourceUrl:candidate.originalUrl,verifiedAt:article.retrievedAt,sha256:article.receiptSha256,html}),{flag:'wx',mode:0o600});
    articles.push(article);
  }catch(e){failures.push({url:candidate.originalUrl,error:String((e as Error).message)});const previous=prior.find(a=>a.originalUrl===candidate.originalUrl);if(previous)articles.push(previous);}}
  const result={checkedAt:new Date().toISOString(),articles,failures};fs.mkdirSync(path.dirname(manifest(root)),{recursive:true});const temp=manifest(root)+'.tmp';fs.writeFileSync(temp,JSON.stringify(result,null,2),{mode:0o600});fs.renameSync(temp,manifest(root));return {...result,lastError:failures.length?failures.map(f=>f.error).join('; '):undefined};
}
