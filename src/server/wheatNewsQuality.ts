/**
 * Wheat Market Intelligence metadata and conservative text integrity checks.
 * Free and deterministic: never requests Gemini or modifies article URLs/dates.
 * Classification uses source-owned English headline/snippet when available.
 */
export type WheatLabels = { category: string; affectedRegion: string };
import {newsPercentagesGrounded} from './newsEvidenceQuality.ts';
type NewsLike = {
  rawTitle?: string; rawSnippet?: string; sourceHeadline?: string;
  originalUrl?: string; original_url?: string; title?: string; title_kr?: string;
  summary?: string; summary_kr?: string; publishedAt?: string; publication_date?: string;
  category?: string; affectedRegion?: string; affected_region?: string;
};
const contains = (s:string,re:RegExp):boolean => re.test(s);
function lower(s:unknown):string{return String(s||'').toLowerCase();}
function plainUrl(raw:string):URL|null{try{const u=new URL(raw);return u.protocol==='https:'?u:null;}catch{return null;}}

/** Geography: prioritize the article's PRIMARY sourcing focus, not every country mentioned. */
export function wheatLabelsForSource(article:NewsLike):WheatLabels {
  const url=plainUrl(String(article.originalUrl||article.original_url||''));
  const host=url?.hostname.toLowerCase().replace(/^www\./,'')||'';
  const slug=(url?.pathname||'').replace(/[-_/]+/g,' ');
  const title=lower(article.rawTitle||article.sourceHeadline||article.title||article.title_kr);
  // Verified source title/URL are preferred. On existing snapshots only, a short
  // translated summary can supplement regional context for generic titles.
  const sourceText=lower(article.rawSnippet||'');
  const hints=`${title} ${slug}`;
  const full=`${hints} ${sourceText}`;
  const isIgc=host==='igc.int' && /gmr|grain market report|summary/.test(full);
  const isAhdb=host==='ahdb.org.uk' && /arable market report/.test(full);

  let category='시장 동향';
  if(isIgc) category='글로벌 수급';
  else if(isAhdb) category='가격·시장 동향';
  else if(contains(hints,/\b(?:ukrainian|ukraine|odesa|odessa)\b/) &&
    contains(full,/logistic|port|shipping|freight|export|물류/)) category='가격·물류';
  else if(contains(hints,/\b(?:area|acreage|production|supply|output|crop|stocks|forecast|balance|planting)\b|재배면적|수급|생산량/)) category='수급 전망';
  else if(contains(hints,/\b(?:freight|shipments|logistics|port|black sea|rail)\b/)) category='물류·무역';
  else if(contains(hints,/\b(?:price|prices|futures|bid|eases|weakens|steadies)\b|가격/)) category='가격 동향';
  else if(contains(hints,/\b(?:trade|exports|imports|shipment)\b/)) category='무역 동향';
  else if(contains(hints,/\b(?:drought|rainfall|weather|flood|heatwave)\b/)) category='기상 리스크';
  else if(contains(hints,/\b(?:quality|protein|milling)\b/)) category='품질 동향';
  else if(contains(hints,/\b(?:world|global|grains|cereal)\b/)) category='글로벌 수급';

  let region='글로벌';
  if(isIgc) region='글로벌';
  else if(contains(hints,/\b(?:ukrainian|ukraine|odesa|odessa|black sea)\b|우크라이나|흑해/)) region='우크라이나·흑해';
  else if(contains(hints,/\b(?:european union|eu soft|eu wheat|european|europe)\b|유럽연합|유럽/)) region='유럽연합';
  else if(isAhdb) {
    const contextual=lower(article.rawSnippet||article.summary||article.summary_kr);
    region=contains(contextual,/black sea|흑해/)?'유럽·흑해':'영국·유럽';
  }
  else if(contains(hints,/\b(?:indian|india)\b|인도/)) region='인도';
  else if(contains(hints,/\b(?:australian|australia)\b|호주/)) region='호주';
  else if(contains(hints,/\b(?:canadian|canada)\b|캐나다/)) region='캐나다';
  else if(contains(hints,/\b(?:russian|russia)\b|러시아/)) region='러시아';
  else if(contains(hints,/\b(?:american|united states|us wheat|u\.s\.)\b|미국/)) region='미국';
  return {category, affectedRegion:region};
}

/** Fail closed on recognizable dangerous numerical attribution, not general AI fact-checking. */
export function wheatSummaryRisk(summary:string, rawSnippet:string):string|null {
  const text=String(summary||'').replace(/\s+/g,' ');
  const english=lower(rawSnippet).replace(/\s+/g,' ');
  // 300m+ tonnes attributed to *wheat exports/trade* is a red flag: the IGC
  // 450m-tonne figure refers to ALL GRAINS. Prevent combined-grain totals
  // from silently becoming wheat-only volumes in later reports.
  const wheatTrade=/(?:밀\s*(?:수출|교역|무역)(?:량|규모|전망)?|(?:수출|교역)(?:량|규모)?\s*(?:은|이|가)?\s*밀).{0,55}/g;
  const relevant=(text.match(wheatTrade)||[]).join(' ');
  if(/(?:[3-9]\s*억\s*(?:\d[\d,]*(?:\s*천)?\s*만)?\s*톤|(?:[3-9]\d\d|\d,\d\d\d)\s*백만\s*톤)/.test(relevant))
    return 'implausible-wheat-trade-total-review-required';
  // Do not transpose the USDA maize production revision into US wheat supply.
  if(/(?:us maize production|u\.s\. maize production|us corn production|u\.s\. corn production)/.test(english) &&
    /미국(?:의)?\s*밀\s*생산\s*(?:전망|량|증가|상향)/.test(text) &&
    !/미국(?:의)?\s*옥수수\s*생산/.test(text))
    return 'possible-maize-as-wheat-attribution';
  // A percentage in the Korean summary should occur in the verified English excerpt;
  // avoids invented percentage magnitudes while allowing articles without percentages.
  if(!newsPercentagesGrounded(text,rawSnippet))return 'unsupported-summary-percentage';
  return null;
}

// Only repair two reviewed OCTOBER 2026 saved articles. This function is NOT
// applied to future IGC editions or other AHDB reports merely due to publisher.
const OCT_IGC_URL='https://www.igc.int/en/gmr_summary.aspx';
const OCT_AHDB_URL='https://ahdb.org.uk/news/arable-market-report-12-october-2026';
const IGC_SUMMARY='IGC는 2026/27년 세계 곡물 생산량 전망을 전월보다 700만 톤 상향한 24억 2,700만 톤으로 제시했습니다. 전체 곡물 교역량 전망은 전월 대비 100만 톤 줄어든 4억 5,000만 톤이며, 밀 교역량은 전년 대비 약 1,500만 톤 감소할 것으로 예상됩니다. 북미 수출가격 약세로 IGC 밀 가격 하위지수는 5% 하락했습니다.';
const AHDB_SUMMARY='영국의 2026년 11월물 사료용 밀 선물가격은 소폭 약세를 보였습니다. 미국 옥수수 생산 및 재고 전망 상향이 글로벌 곡물시장에 하락 압력을 가한 반면, 흑해 수출 차질과 지정학적 불확실성은 유럽 곡물가격을 지지했습니다. 우크라이나의 대체 수출 경로는 높은 물류비로 인해 가격 경쟁력에 한계가 있습니다.';
export function improveSavedWheatArticle<T extends NewsLike>(article:T):T {
  const url=String(article.originalUrl||article.original_url||'').replace(/\/$/,'');
  const date=String(article.publishedAt||article.publication_date||'').slice(0,10);
  const labels=wheatLabelsForSource(article);
  const next:{[key:string]:any}={...article,category:labels.category,affectedRegion:labels.affectedRegion,affected_region:labels.affectedRegion};
  if(url===OCT_IGC_URL && date==='2026-10-15' &&
    /(?:밀\s*수출량|밀\s*교역량).{0,35}(?:100만|4억)/.test(String(article.summary||article.summary_kr||''))) {
    next.summary=IGC_SUMMARY;next.summary_kr=IGC_SUMMARY;
  }
  if(url===OCT_AHDB_URL && date==='2026-10-12' &&
    /미국(?:의)?\s*밀\s*생산\s*전망/.test(String(article.summary||article.summary_kr||''))) {
    next.summary=AHDB_SUMMARY;next.summary_kr=AHDB_SUMMARY;
  }
  return next as T;
}
