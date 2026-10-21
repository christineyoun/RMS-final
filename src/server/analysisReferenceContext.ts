/** Qualifiers are extracted from checksum-bound ORIGINAL quotations, not model prose.
 * Only reference periods are admitted here; prices, percentages, allocations,
 * newly predicted dates and other quantities still require typed factual claims.
 */
import type {AnalysisFact} from './analysisEvidence.ts';
const normalize=(s:string)=>s.normalize('NFKC').replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
export function verifiedReferenceContext(f:AnalysisFact){
 const empty={geographies:[] as string[],qualifiers:[] as Array<{phrase:string;aspect:string}>};
 const c=f.referenceContext;if(f.verification!=='original-record'||!f.id.startsWith('article-')||!c||c.receiptSha256!==f.recordSha256||typeof c.quote!=='string'||c.quote.length<40||c.quote.length>1500)return empty;
 const quote=normalize(c.quote),text=normalize(f.text);
 const places:Record<string,[RegExp,RegExp]>={US:[/\bUS\b|United States/i,/미국/],Brazil:[/\bBrazil(?:ian)?\b/i,/브라질/],Argentina:[/\bArgentina\b/i,/아르헨티나/],Paraguay:[/\bParaguay\b/i,/파라과이/],Malaysia:[/\bMalaysia\b/i,/말레이시아/]};
 const geographies=Object.entries(places).filter(([,patterns])=>patterns[0].test(quote)&&patterns[1].test(text)).map(([name])=>name);
 const qualifiers:Array<{phrase:string;aspect:string}>=[];
 if(f.measure?.metric==='price'){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  months.forEach((month,i)=>{const phrase=(i+1)+'월 선적';if(new RegExp('\\b'+month+' shipment\\b','i').test(quote)&&text.includes(phrase))qualifiers.push({phrase,aspect:'price-level'});});
 }
 if(f.measure?.metric==='planting-progress'){
  const years=['one','two','three','four','five','six','seven','eight','nine','ten'];
  years.forEach((year,i)=>{const phrase=(i+1)+'년 평균';if(new RegExp('\\b'+year+'-year average\\b','i').test(quote)&&text.includes(phrase))qualifiers.push({phrase,aspect:'planting-progress'});});
 }
 return {geographies,qualifiers};
}
