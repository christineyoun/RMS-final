/**
 * Verified Market Intelligence affected-region metadata.
 *
 * Existing approved MI region labels always win. For older approved records
 * without a region, use ONLY source text captured from the original publisher
 * with a matching verified article receipt. Never inspect AI-written Korean
 * summaries, guess from publisher domains, or fetch on a page view.
 *
 * The vocabulary is reusable geographic spelling, NOT article-specific
 * results, commodity exceptions, source URLs, dates, or market assertions.
 * Ambiguous/unsupported evidence yields no label.
 */
export type VerifiedRegionArticle = {
  affectedRegion?: unknown;
  affected_region?: unknown;
  originalUrl?: unknown;
  publishedAt?: unknown;
  linkStatus?: unknown;
  unavailable?: unknown;
  verifiedSourceEvidence?: unknown;
};

const names: ReadonlyArray<{label: string; forms: readonly RegExp[]}> = [
  {label:'미국',forms:[/\bUnited States\b/gi,/\bU\.S\.(?=\W|$)/gi,/\bUSA\b/g,/미국/g]},
  {label:'캐나다',forms:[/\bCanada\b/gi,/캐나다/g]},
  {label:'멕시코',forms:[/\bMexico\b/gi,/멕시코/g]},
  {label:'브라질',forms:[/\bBrazil\b/gi,/브라질/g]},
  {label:'아르헨티나',forms:[/\bArgentina\b/gi,/아르헨티나/g]},
  {label:'영국',forms:[/\bUnited Kingdom\b/gi,/\bBritain\b/gi,/\bBritish\b/gi,/영국/g]},
  {label:'독일',forms:[/\bGermany\b/gi,/독일/g]},
  {label:'프랑스',forms:[/\bFrance\b/gi,/프랑스/g]},
  {label:'이탈리아',forms:[/\bItaly\b/gi,/이탈리아/g]},
  {label:'스페인',forms:[/\bSpain\b/gi,/스페인/g]},
  {label:'우크라이나',forms:[/\bUkraine\b/gi,/우크라이나/g]},
  {label:'러시아',forms:[/\bRussia\b/gi,/러시아/g]},
  {label:'중국',forms:[/\bChina\b/gi,/중국/g]},
  {label:'인도',forms:[/\bIndia\b/gi,/인도(?!네시아)/g]},
  {label:'인도네시아',forms:[/\bIndonesia\b/gi,/인도네시아/g]},
  {label:'말레이시아',forms:[/\bMalaysia\b/gi,/말레이시아/g]},
  {label:'태국',forms:[/\bThailand\b/gi,/태국/g]},
  {label:'베트남',forms:[/\bVietnam\b/gi,/베트남/g]},
  {label:'호주',forms:[/\bAustralia\b/gi,/호주/g]},
  {label:'일본',forms:[/\bJapan\b/gi,/일본/g]},
  {label:'한국',forms:[/\bSouth Korea\b/gi,/\bRepublic of Korea\b/gi,/대한민국|한국/g]}
];

function text(value:unknown):string { return typeof value==='string'?value.trim():''; }
function exactOriginalUrl(value:unknown):string {
  const raw=text(value);
  if(!raw)return '';
  try { const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.toString().replace(/\/$/,''):''; }
  catch {return '';}
}
function sourceDate(value:unknown):string { const s=text(value);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''; }
function approvedRegion(article:VerifiedRegionArticle):string {
  return text(article.affectedRegion)||text(article.affected_region);
}
/**
 * Requires independently verified publisher evidence with matching URL AND
 * publication date, and at least two unambiguous explicit geographic mentions
 * within that evidence. A headline alone can never produce a region.
 */
export function verifiedAffectedRegion(article:VerifiedRegionArticle):string {
  const existing=approvedRegion(article);
  if(existing)return existing;
  if(article.linkStatus!=='verified'||article.unavailable===true)return '';
  const receipt=article.verifiedSourceEvidence;
  if(!receipt||typeof receipt!=='object')return '';
  const r=receipt as Record<string,unknown>;
  const url=exactOriginalUrl(article.originalUrl);
  if(!url||url!==exactOriginalUrl(r.originalUrl))return '';
  const date=sourceDate(article.publishedAt);
  if(!date||date!==sourceDate(r.publishedAt))return '';
  const excerpt=text(r.excerpt);
  if(excerpt.length<60)return '';
  // Bounded source text; no page fetch, no AI-generated summary inspection.
  const passage=excerpt.slice(0,5000);
  const matches=names.map(({label,forms})=>({label,count:forms.reduce((sum,re)=>sum+[...passage.matchAll(re)].length,0)}))
    .filter(entry=>entry.count>0);
  if(matches.length!==1||matches[0].count<2)return '';
  return matches[0].label;
}

/** In-memory view only; retained approved publications are never rewritten. */
export function withVerifiedAffectedRegion<T extends VerifiedRegionArticle>(article:T):T {
  const region=verifiedAffectedRegion(article);
  if(!region || (text(article.affectedRegion)===region && text(article.affected_region)===region))return article;
  return {...article,affectedRegion:region,affected_region:region};
}
