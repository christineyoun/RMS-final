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
const MARKET = /\b(?:forecast|production|harvest|yield|price|supply|demand|ending\s+stock|beginning\s+stock|inventory|export|import|shipment|freight|basis|futures|trade|purchase|buying|weather|rain|drought|crop|outlook|planting|consumption|crush|tariff|exchange|bushels?|tonnes?|tons?|\$|usd|cbot|euro|cent)\b/i;
const OTHER_CROPS = /\b(?:wheat|soybeans?|soyabeans?|rapeseed|canola|barley|palm\s+oil|sunflower|sugar)\b/i;
const GENERIC = /(?:목차|보고서\s*(?:목차|소개|발표|개요)|분석과\s*가격\s*보고서|수치(?:는|가)?\s*(?:제공되지|없었)|구체적(?:인)?\s*수치.*(?:제공되지|없)|자세한\s*내용.*(?:확인|참조)|시장\s*동향\s*보고서.*(?:발표|소개)|the\s+report\s+covers)/i;
const MOVEMENT = /(?:상승|하락|증가|감소|상향|하향|확대|축소|강세|약세|반등|압박|둔화|개선|악화|급등|급락|증산|감산|변동|유지|회복|부진|지지|위축|확보|차질|제한|부족|초과|전망|예상|추정|예측|공급|수요|가격|재고|수확|수출|수입|생산|거래|선물|기상|물류|달러|cent|가격)/i;
const clean=(s:string)=>String(s||'').replace(/\s+/g,' ').trim();

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
  const lines=paragraphs.flatMap(sentenceChunks).map(clean).filter(x=>x.length>=30 && x.length<=1150).slice(0,900);
  const score=lines.map((line,i)=>{
    const hasCrop=crop.test(line),hasMarket=MARKET.test(line),hasNumber=/\d/.test(line);
    const offCrop=OTHER_CROPS.test(line)&&!hasCrop;
    const anchor=hasCrop&&hasMarket&&!GENERIC.test(line)&&line.length>=35;
    return {i,anchor,offCrop,points:(anchor?12:hasCrop?5:0)+(hasMarket?3:0)+(hasNumber?2:0)-(offCrop?10:0)-(GENERIC.test(line)?15:0)};
  });
  const anchors=score.filter(x=>x.anchor&&!x.offCrop).sort((a,b)=>b.points-a.points||a.i-b.i);
  const indices=new Set<number>();
  for(const a of anchors.slice(0,22)) {
    indices.add(a.i);
    for(const k of [-2,-1,1,2,3,4]) {
      const n=score[a.i+k];
      if(n&&!n.offCrop&&n.points>=3&&lines[n.i].length>=30)indices.add(n.i);
    }
  }
  // Choose the strongest passages first, then restore their reading order.
  const prioritized=[...indices].sort((a,b)=>score[b].points-score[a].points||a-b);
  const included:number[]=[];let used=0;
  for(const i of prioritized){if(used+lines[i].length+2>cap)continue;included.push(i);used+=lines[i].length+2;}
  const excerpt=included.sort((a,b)=>a-b).map(i=>lines[i]).join('\n');
  const marketPassageCount=included.filter(i=>score[i].points>=12).length;
  const reason=anchors.length===0?'no-commodity-market-evidence':marketPassageCount===0?'no-specific-market-passage':
    excerpt.length<200?'insufficient-relevant-market-evidence':'ok';
  return {excerpt,anchorCount:anchors.length,marketPassageCount,selectedPassages:included.length,reason};
}

const numberPattern=/(\d[\d,]*(?:\.\d+)?)(?:\s*(억|만|천|billion|million|thousand|bn|MMT|Mt|Kt|mm|m)(?![a-z]))?/gi;
function normalizeScale(n:number,scale:string|undefined):number {
  if(!scale)return n;
  return n*(({억:1e8,만:1e4,천:1e3,billion:1e9,million:1e6,thousand:1e3,bn:1e9,mm:1e6,m:1e6,mt:1e6,kt:1e3,mmt:1e6} as Record<string,number>)[scale.toLowerCase()]||1);
}
function unitOf(text:string):string {
  if(/%|percent|per cent/i.test(text))return 'percent';
  if(/(?:부셸|bushel)/i.test(text))return 'bushel';
  if(/(?:센트|cents?\b|¢)/i.test(text))return 'cent';
  if(/(?:달러|\busd\b|\$)/i.test(text))return 'dollar';
  if(/(?:톤|tonnes?|metric\s+tons?|\bmt\b|\bkt\b|\bmmt\b|\bMt\b)/i.test(text))return 'tonne';
  return 'unspecified';
}
type Quantity={n:number;unit:string;original:string};
function quantities(text:string):Quantity[] {
  const out:Quantity[]=[];
  const value=clean(text);
  let skipUntil=0;
  for(const match of value.matchAll(numberPattern)) {
    const start=match.index||0,end=start+match[0].length;
    if(start<skipUntil)continue;
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
    const nearby=value.slice(Math.max(0,start-9),Math.min(value.length,consumed+20));
    let unit=unitOf(nearby);
    if(/\b(?:Mt|Kt|MMT)\b/.test(match[0]))unit='tonne';
    if(unit==='unspecified'&&/\b(?:Mt|Kt|MMT|kg)\b/.test(nearby))unit='tonne';
    // `478 cents`, `407.3 Mt`, etc. Keep local unit evidence.
    if(unit==='unspecified'&&/\b(?:USD|FOB)\b/i.test(before+' '+after))unit='dollar';
    out.push({n,unit,original:match[0]});
  }
  return out;
}
const approx=(a:number,b:number)=>Math.abs(a-b)<=Math.max(0.02,Math.min(a,b)*0.0025);
function numbersGrounded(summary:string,evidence:string):string|null {
  const source=quantities(evidence);
  for(const claim of quantities(summary)) {
    // Month and day ordinals, e.g. 10월 / 15일, are temporal metadata.
    if(source.some(s=>approx(claim.n,s.n) &&
        (claim.unit==='unspecified'||s.unit==='unspecified'||claim.unit===s.unit)))continue;
    // English original might spell the number out ("nine weeks"); fail safe:
    // no fabricated numeric quantities are allowed in stored summaries.
    return `unsupported-number:${claim.original}`;
  }
  return null;
}
/** Structural, numerical, and generic-boilerplate gate. Cannot prove causal correctness. */
export function reviewMarketSummary(title:string,summary:string,evidence:string,commodity:string):string|null {
  const crop=ALIASES[commodity];if(!crop)return 'unknown-commodity';
  const t=clean(title),s=clean(summary);
  if(t.length<8||!/[가-힣]/.test(t)||s.length<38||!/[가-힣]/.test(s))return 'missing-korean-content';
  if(GENERIC.test(s)||GENERIC.test(t))return 'generic-report-description';
  // A quoted FOB "Flat Price" is a specific cash quotation, not an average.
  // Never invent an averaging method merely because the underlying prices exist.
  if(/(?:FOB.{0,15}(?:평단가|평균\s*가격)|(?:평단가|평균\s*가격).{0,15}FOB)/i.test(s) &&
     /\bFlat\s+Price\b/i.test(evidence) &&
     !/\b(?:average|mean)\s+(?:FOB\s+)?price\b/i.test(evidence))
    return 'misstated-fob-flat-price-as-average';
  if(!crop.test(t+' '+s))return 'summary-not-commodity-specific';
  if(!MOVEMENT.test(s))return 'no-market-development';
  const meaningful=selectMarketEvidence(evidence.split(/\n+/),commodity);
  if(meaningful.reason!=='ok')return `weak-original-evidence:${meaningful.reason}`;
  const mismatch=numbersGrounded(s,evidence);if(mismatch)return mismatch;
  return null;
}
