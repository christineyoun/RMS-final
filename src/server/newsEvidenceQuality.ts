import {assessNewsSummary} from '../utils/newsSummaryQuality.ts';
/**
 * Shared, source-first market-news evidence gate.
 * No models, credentials, snapshots, or network activity.  Not a substitute
 * for human checking: rejects recognizable unsupported claims, but cannot
 * establish every implied causal relationship or guarantee completeness.
 */


/**
 * A source-layout adapter for mixed-crop PDF tables. Does not hardcode any
 * commodity price, date, volume, title or summary. It removes contaminating
 * OTHER crop rows where a printed PDF flattens several tables onto one line.
 * No source text is invented; if a section cannot be delimited, leave it for
 * the ordinary conservative evidence selector rather than truncate blindly.
 * Call only for U.S. Grains Council Market Perspectives corn PDFs.
 */
export function prepareCornCouncilPdfEvidence(raw:string):string {
  let text=String(raw||'').replace(/\r/g,'');
  // Remove front-matter contents when the actual price table is clearly found.
  const body=text.search(/\bDaily Price Evolution\s*:/i);
  if(body>=0 && body<=8500 && /\bCONTENTS\b/i.test(text.slice(0,body)))
    text=text.slice(body);
  // Publisher's postal page footers repeat on every extracted page.
  text=text.replace(/\bNW,\s*Suite\s+\d+\s+Washington,\s*DC\s+\d{5}\s*\[Page\s+\d+\]/gi,' ');

  function omitSpan(start:RegExp,end:RegExp,maxLength:number) {
    // Multiple instances can appear in a multi-page monthly report. Stop
    // conservatively if a valid delimiting section is not close enough.
    for(let n=0;n<12;n++) {
      const a=start.exec(text);
      if(!a)return;
      const tail=text.slice(a.index+a[0].length);
      const b=end.exec(tail);
      if(!b)return;
      const finish=a.index+a[0].length+b.index;
      if(finish-a.index>maxLength)return;
      text=text.slice(0,a.index)+' '+text.slice(finish);
    }
  }
  // The CBOT table prints Corn first, then Soybeans and Soymeal, followed by
  // the table's Price unit footnote. Keep ALL corn maturities and quotations.
  omitSpan(/\bSoybeans?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}\b/i,
    /\*?\s*Price\s+unit\s*:/i,5500);
  // FOB table prints yellow corn quotes, then sorghum and corn-processing
  // by-products. Retain original corn FOB flat-price table and its caveats.
  omitSpan(/\bSorghum,?\s*#?\d*\s*YGS\s*FOB\b/i,
    /\bTerms\s+of\s+delivery\b/i,5500);
  // Mixed-origin spread table includes an unrelated PNW Soybeans comparison.
  // Do not delete the PNW Ocean Freight line after the soybeans row.
  omitSpan(/\bPNW\s+Soybeans?\b/i, /\bPNW\s+Ocean\s+Freight\b/i,1600);
  // The Council PDF also carries corn-processing by-product (DDGS) tables.
  // These are not raw-corn quotations; remove only if a subsequent freight
  // section is positively identified, retaining freight and corn spread data.
  omitSpan(/\bDistiller[’']?s\s+Dried\s+Grains\s+with\s+Solubles\s*\(DDGS\)/i,
    /\b(?:Baltic\s+Dry|U\.S\.\s*[-–]?\s*Asia\s+Market\s+Spreads|Ocean\s+Freight\s+Markets)\b/i,8000);
  // Remove publisher phone/address page headers without discarding the next
  // data section (FOB). Do not invent or modify any reported market values.
  omitSpan(/\bPhone:\s*\(?\d{3}\)?\s*\d{3}[- ]\d{4}\b/i,
    /\bFOB\s+Prices\b/i,600);
  return text.replace(/[ \t]{2,}/g,' ').trim();
}

const ALIASES: Record<string, RegExp> = {
  wheat: /\b(?:wheat|durum)\b|밀|소맥/i,
  corn: /\b(?:corn|maize)\b|옥수수/i,
  soybean: /\b(?:soybean|soyabean|soya\s*bean)\b|대두|콩\b/i,
  'soybean-oil': /\b(?:soybean|soyabean|soya\s*bean)\s+oil\b|대두유/i,
  'palm-oil': /\b(?:palm\s+oil|palm\s+olein|cpo)\b|팜유/i,
  sugar: /\b(?:sugar|sugarcane)\b|설탕|원당/i,
  'potato-starch': /\b(?:potato\s+starch|starch\s+potato)\b|감자\s*전분/i,
  'tapioca-starch': /\b(?:tapioca|cassava)\b|타피오카|카사바/i
};
const MARKET = /\b(?:forecast|production|harvest|yield|prices?|(?:supply|supplies)|demand|ending\s+stock|beginning\s+stock|inventory|exports?|imports?|shipments?|freight|basis|futures|trade|purchase|buying|weather|rain|drought|crop|outlook|planting|consumption|crush|tariff|exchange|bushels?|tonnes?|tons?|\$|usd|cbot|euro|cent)\b/i;
const OTHER_CROPS = /\b(?:wheat|soybeans?|soyabeans?|rapeseed|canola|barley|palm\s+oil|sunflower|sugar)\b/i;
const GENERIC = /(?:목차|보고서\s*(?:목차|소개|발표|개요)|분석과\s*가격\s*보고서|수치(?:는|가)?\s*(?:제공되지|없었)|구체적(?:인)?\s*수치.*(?:제공되지|없)|자세한\s*내용.*(?:확인|참조)|시장\s*동향\s*보고서.*(?:발표|소개)|the\s+report\s+covers)/i;
const MOVEMENT = /(?:상승|하락|증가|감소|상향|하향|확대|축소|강세|약세|반등|압박|둔화|개선|악화|급등|급락|증산|감산|변동|유지|회복|부진|지지|위축|확보|차질|제한|부족|초과|전망|예상|추정|예측|공급|수요|가격|재고|수확|수출|수입|생산|거래|선물|기상|물류|달러|cent|가격)/i;
const clean=(s:string)=>String(s||'').replace(/\s+/g,' ').trim();
/** Typography only: never remove words, numbers, punctuation gaps or ellipses. */
export const normalizePublisherQuotation=(text:string)=>text.normalize('NFC')
  .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[\u00ad\u200b]/g,'').replace(/\s+/g,' ').trim();
export function publisherQuotationIssue(quote:string,evidence:string):string|null {
 const q=normalizePublisherQuotation(quote),body=normalizePublisherQuotation(evidence);
 return !q?'empty-evidence-quote':!body.includes(q)?'evidence-quote-not-found-in-publisher-text':null;
}

/** Actual source-body content, independent of a length quota or model quote. */
export function hasMarketArticleBody(text:string,headline=''):boolean {
 const body=clean(text),title=clean(headline);
 const remainder=title?body.replace(title,'').trim():body;
 return !!remainder&&(MARKET.test(remainder)||/가격|수급|생산|재고|수출|수입|공급|수요|수확|운임|기상/.test(remainder));
}

function sentenceChunks(paragraph:string):string[] {
  const s=clean(paragraph);
  if(s.length<=620)return s?[s]:[];
  return s.split(/(?<=[.!?])\s+(?=[A-Z0-9\uac00-\ud7a3])/).flatMap(x=>x.length>1050?x.match(/.{1,650}(?:\s|$)/g)||[x]:[x]).map(clean).filter(Boolean);
}

export type EvidenceSelection={excerpt:string; anchorCount:number; marketPassageCount:number; selectedPassages:number; reason:string};
/** Pass paragraph-level extracted publisher text. Preserve source order after relevance ranking. */
export function selectMarketEvidence(paragraphs:string[],commodity:string,cap=5800):EvidenceSelection {
  const crop=ALIASES[commodity];
  if(!crop)return {excerpt:'',anchorCount:0,marketPassageCount:0,selectedPassages:0,reason:'unknown-commodity'};
  const lines=paragraphs.flatMap(sentenceChunks).map(clean).filter(x=>!!x && x.length<=1150).slice(0,900);
  const score=lines.map((line,i)=>{
    const hasCrop=crop.test(line),hasMarket=MARKET.test(line),hasNumber=/\d/.test(line);
    const offCrop=OTHER_CROPS.test(line)&&!hasCrop;
    const anchor=hasCrop&&hasMarket&&!GENERIC.test(line);
    return {i,anchor,offCrop,points:(anchor?12:hasCrop?5:0)+(hasMarket?3:0)+(hasNumber?2:0)-(offCrop?10:0)-(GENERIC.test(line)?15:0)};
  });
  const anchors=score.filter(x=>x.anchor&&!x.offCrop).sort((a,b)=>b.points-a.points||a.i-b.i);
  const indices=new Set<number>();
  for(const a of anchors.slice(0,22)) {
    indices.add(a.i);
    for(const k of [-2,-1,1,2,3,4]) {
      const n=score[a.i+k];
      if(n&&!n.offCrop&&n.points>=3&&!!lines[n.i])indices.add(n.i);
    }
  }
  // Choose the strongest passages first, then restore their reading order.
  const prioritized=[...indices].sort((a,b)=>score[b].points-score[a].points||a-b);
  const included:number[]=[];let used=0;
  for(const i of prioritized){if(used+lines[i].length+2>cap)continue;included.push(i);used+=lines[i].length+2;}
  const excerpt=included.sort((a,b)=>a-b).map(i=>lines[i]).join('\n');
  const marketPassageCount=included.filter(i=>score[i].points>=12).length;
  const reason=anchors.length===0?'no-commodity-market-evidence':marketPassageCount===0?'no-specific-market-passage':
    !excerpt?'article-body-unavailable':'ok';
  return {excerpt,anchorCount:anchors.length,marketPassageCount,selectedPassages:included.length,reason};
}

// MT means metric tonnes; only case-sensitive Mt (megatonnes) scales by a
// million. A case-insensitive Mt/m pattern also consumed the m in metres.
const numberPattern=/(\d[\d,]*(?:\.\d+)?)(?:\s*(억|만|천|[Bb]illion|[Mm]illion|[Tt]housand|bn|crore|lakh|크로어|MMT|Mt|[Kk]t)(?![a-zA-Z]))?/g;
function normalizeScale(n:number,scale:string|undefined):number {
  if(!scale)return n;
  return n*(({억:1e8,만:1e4,천:1e3,billion:1e9,million:1e6,thousand:1e3,bn:1e9,crore:1e7,lakh:1e5,크로어:1e7,mm:1e6,m:1e6,mt:1e6,kt:1e3,mmt:1e6} as Record<string,number>)[scale.toLowerCase()]||1);
}
function unitOf(text:string):string {
  // Read the attached unit, never a different quantity later in the sentence.
  const s=text.trimStart();
  if(/^(?:리터|litres?\b|liters?\b)/i.test(s))return 'litre';
  if(/^(?:년|years?\b)/i.test(s))return 'year';
  if(/^(?:%|퍼센트|percent\b|per cent\b)/i.test(s))return 'percent';
  if(/^(?:부셸|bushels?\b|bu\b)/i.test(s))return 'bushel';
  if(/^(?:센트|(?:US\s*)?cents?\b|(?:US\s*)?¢)/i.test(s))return 'cent';
  if(/^(?:달러|usd\b|(?:US\s*)?\$)/i.test(s))return 'dollar';
  if(/^(?:유로|eur\b|€)/i.test(s))return 'euro';
  if(/^(?:위안|cny\b|rmb\b)/i.test(s))return 'yuan';
  if(/^(?:킬로그램|kg\b)/i.test(s))return 'kilogram';
  if(/^(?:톤|tonnes?\b|tons?\b|metric\s+ton(?:ne)?s?\b|mt\b|kt\b|mmt\b)/i.test(s))return 'tonne';
  return 'unspecified';
}
export type NewsQuantity={n:number;unit:string;original:string;denominator?:string;metric?:'yield'|'production';reference?:'average-period'};
export function extractNewsQuantities(text:string):NewsQuantity[] {
  const out:NewsQuantity[]=[];
  // Remove only a redundant, exactly equal parenthetical scale spelling.
  const value=clean(text).replace(/(metric\s+ton(?:ne)?s?)(?=[A-Z]{2}|[A-Z][a-z])/g,"$1 ").replace(/(\d[\d,]*(?:\.\d+)?)\s*(crore|크로어)\s*\((\d[\d,]*(?:\.\d+)?)\s*억\)/gi,(all,a,scale,b)=>normalizeScale(Number(a.replace(/,/g,'')),scale)===Number(b.replace(/,/g,''))*1e8?a+' '+scale:all);
  const dates=[...value.matchAll(/\b\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?\b/g)].map(m=>[m.index!,m.index!+m[0].length]);
  let skipUntil=0,lastQuantityEnd=0;
  for(const match of value.matchAll(numberPattern)) {
    const start=match.index||0,end=start+match[0].length;
    if(start<skipUntil)continue;
    if(dates.some(([a,b])=>start>=a&&start<b))continue;
    const raw=Number(match[1].replace(/,/g,''));
    if(!Number.isFinite(raw))continue;
    // Years and crop-year notation are not unsupported market-price claims.
    if(raw>=1900&&raw<=2100&&match[1].length===4&&!match[2])continue;
    if((value.slice(Math.max(0,start-5),start).includes('/')||value.slice(end,end+1)==='/')&&/\d{4}\s*\/\s*\d{2,4}/.test(value.slice(Math.max(0,start-5),end+5)))continue;
    if(/^\s*[월일]/.test(value.slice(end,end+3)))continue;
    const before=value.slice(Math.max(0,start-30),start),after=value.slice(end,Math.min(value.length,end+28));
    let n=normalizeScale(raw,match[2]);
    let consumed=end;
    // Korean combined scale (4억 730만 = 407.3 million).
    const extra=after.match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*(만|천)(?=\s|\b|[가-힣]|$)/);
    if(match[2]==='억'&&extra){n+=normalizeScale(Number(extra[1].replace(/,/g,'')),extra[2]);consumed+=extra[0].length;skipUntil=consumed;}
    // Price ranges share a currency and denominator, only across the actual
    // contiguous range connector. Never borrow a later unrelated unit.
    const tail=value.slice(consumed).replace(/^\s*(?:[–—~−-]|to\b)\s*\d[\d,]*(?:\.\d+)?/i,'');
    const rangePrevious=out.length>0&&/^\s*(?:[–—~−-]|to)\s*$/i.test(value.slice(lastQuantityEnd,start));
    let unit=unitOf(tail);
    if(/\b(?:Mt|Kt|MMT)\b/.test(match[0]))unit='tonne';
    const currencyPrefix=/(?:\b(?:USD|EUR|CNY|RMB)|[$€])\s*$/i.exec(before)?.[0];
    if(currencyPrefix&&unit!=='unspecified'&&unit!==unitOf(currencyPrefix))unit='ambiguous-currency';
    else if(unit==='unspecified'){
      if(currencyPrefix)unit=unitOf(currencyPrefix);
      else if(rangePrevious)unit=out.at(-1)!.unit;
    }
    let denominator:string|undefined;
    if(['dollar','euro','yuan','cent'].includes(unit)){
      const suffix=/^\s*(?:(?:USD|EUR|CNY|RMB|US\s*cents?|cents?|US\s*¢|센트|달러|유로|위안|US\s*\$|[$€¢])\s*)?(?:\/|per\s+)(MT\b|metric\s+ton(?:ne)?s?\b|tonnes?\b|tons?\b|kg\b|lb\b|lbs\b|pounds?\b|bu\b|bushels?\b|톤|부셸|파운드)/i.exec(tail);
      const prefix=/(톤|부셸|파운드|kg)당\s*(?:약|대략)?\s*$/.exec(before);
      const rate=suffix?.[1]||prefix?.[1];
      if(!rate&&rangePrevious)denominator=out.at(-1)?.denominator;
      if(rate)denominator=/^(?:lb|pound|파운드)/i.test(rate)?'pound':/^(?:bu|부셸)/i.test(rate)?'bushel':/^kg$/i.test(rate)?'kilogram':'tonne';
    }
    const context=value.slice(Math.max(value.lastIndexOf('.',start-1)+1,start-160),Math.min(value.length,end+55));
    const metric=/수확량|생산량/.test(context)?'production':(['percent','unspecified'].includes(unit)&&/\byields?\b|t\/ha|tonnes? per hectare|단수/.test(context))?'yield':undefined;
    lastQuantityEnd=consumed;
    out.push({n,unit,original:match[0],...(unit==='year'&&/^(?:년|years?)[ -]*(?:평균|평년|average|mean)/i.test(tail.trim())?{reference:'average-period' as const}:{}),...(denominator?{denominator}:{}),...(metric?{metric}:{})});
  }
  // A spelled-out reference duration is not an arbitrary numerical value.
  const words=['one','two','three','four','five','six','seven','eight','nine','ten'];
  for(const m of value.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[ ‐‑–—-]year\s+(?:average|mean)\b/gi))out.push({n:words.indexOf(m[1].toLowerCase())+1,unit:'year',original:m[1],reference:'average-period'});
  if(/\bzero\b/i.test(value))out.push({n:0,unit:"unspecified",original:"zero"});
  return out;
}
const approx=(a:number,b:number)=>Math.abs(a-b)<=Math.max(0.02,Math.min(a,b)*0.0025);
export function newsNumbersIssue(summary:string,evidence:string,options:{strictUnits?:boolean;exactValues?:boolean}={}):string|null {
  const source=extractNewsQuantities(evidence);
  for(const claim of extractNewsQuantities(summary)) {
    // Month and day ordinals, e.g. 10월 / 15일, are temporal metadata.
    if(source.some(s=>(options.exactValues?Math.abs(claim.n-s.n)<=Number.EPSILON*Math.max(1,Math.abs(claim.n),Math.abs(s.n))*4:approx(claim.n,s.n)) &&
        (claim.unit===s.unit||!options.strictUnits&&(claim.unit==='unspecified'||s.unit==='unspecified'))&&
        (!options.strictUnits||claim.denominator===s.denominator)&&
        !(claim.metric==='production'&&s.metric==='yield')&&
        (claim.unit!=='year'||claim.reference===s.reference)))continue;
    // English original might spell the number out ("nine weeks"); fail safe:
    // no fabricated numeric quantities are allowed in stored summaries.
    return `unsupported-number:${claim.original}`;
  }
  return null;
}
/** Equivalent decimal spellings only; no new tolerance, percentage calculation,
 * ratio-to-percent conversion or percentage-point substitution. */
export function newsPercentagesGrounded(summary:string,evidence:string):boolean {
 const source=extractNewsQuantities(evidence).filter(q=>q.unit==='percent');
 return extractNewsQuantities(summary).filter(q=>q.unit==='percent').every(q=>source.some(s=>s.n===q.n));
}
/** Structural, numerical, and generic-boilerplate gate. Cannot prove causal correctness. */
export function reviewMarketSummary(title:string,summary:string,evidence:string,commodity:string):string|null {
  const crop=ALIASES[commodity];if(!crop)return 'unknown-commodity';
  const t=clean(title),s=clean(summary);
  if(!t)return 'missing-title';const quality=assessNewsSummary(s,t,commodity);if(!quality.pass)return quality.reason;
  // A quoted FOB "Flat Price" is a specific cash quotation, not an average.
  // Never invent an averaging method merely because the underlying prices exist.
  if(/(?:FOB.{0,15}(?:평단가|평균\s*가격)|(?:평단가|평균\s*가격).{0,15}FOB)/i.test(s) &&
     /\bFlat\s+Price\b/i.test(evidence) &&
     !/\b(?:average|mean)\s+(?:FOB\s+)?price\b/i.test(evidence))
    return 'misstated-fob-flat-price-as-average';
  const meaningful=selectMarketEvidence(evidence.split(/\n+/),commodity);
  if(meaningful.reason!=='ok')return `weak-original-evidence:${meaningful.reason}`;
  const mismatch=newsNumbersIssue(s,evidence);if(mismatch)return mismatch;
  return null;
}
