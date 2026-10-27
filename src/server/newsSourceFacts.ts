/** Deterministic annotations on already verified publisher text. These are not
 * new observations, cross-crop attribution or independent factual approval. */
import {createHash} from 'node:crypto';
import {extractNewsQuantities,newsNumbersIssue,publisherQuotationIssue} from './newsEvidenceQuality.ts';
const koreanUnits:Record<string,string>={tonne:'톤',bushel:'부셸',dollar:'달러',euro:'유로',yuan:'위안',kilogram:'kg',percent:'%'};
function koreanEquivalent(n:number,unit:string):string|undefined {
 if(!koreanUnits[unit]||!Number.isSafeInteger(n)||n<10000)return undefined;
 // Base-10 notation only. Never convert currencies, bushels, weights or prices.
 if(n%10000)return undefined;
 const eok=Math.floor(n/1e8),man=(n%1e8)/10000;
 return `${eok?eok.toLocaleString('en-US')+'억':''}${eok&&man?' ':''}${man?man.toLocaleString('en-US')+'만':''} ${koreanUnits[unit]}`;
}
export function newsSourceEvidence(input:{rawId:string;rawSnippet:string;originalUrl:string}){
 return [...input.rawSnippet.matchAll(/[^\n]+/g)].filter(m=>m[0].trim()).map(m=>{
  const start=m.index!,end=start+m[0].length,passage=m[0];
  const evidenceId='news-'+createHash('sha256').update(JSON.stringify([input.rawId,input.originalUrl,input.rawSnippet,start,end])).digest('hex').slice(0,20);
  return {evidenceId,start,end,
   dates:[...passage.matchAll(/\b20\d{2}[-/]\d{1,2}(?:[-/]\d{1,2})?\b/g)].map(d=>d[0]),
   quantities:extractNewsQuantities(passage).map(q=>({sourceToken:q.original,value:q.n,unit:q.unit,...(q.denominator?{denominator:q.denominator}:{}),
    ...(koreanEquivalent(q.n,q.unit)?{koreanEquivalent:koreanEquivalent(q.n,q.unit)+(q.denominator?'/'+(koreanUnits[q.denominator]||q.denominator):'')}:{})}))};
 });
}
/** New live summaries bind to selected original passages. Legacy saved replies
 * can still be replayed by callers without the new-contract requirement. */
export function newsSourceBindingIssue(input:Parameters<typeof newsSourceEvidence>[0],ids:unknown,summary:string,quote?:string):string|null {
 const packet=new Map(newsSourceEvidence(input).map(p=>[p.evidenceId,p]));
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!packet.has(id))||new Set(ids).size!==ids.length)return 'invalid-or-missing-news-evidence-ids';
 const evidence=ids.map(id=>packet.get(id)!).map(p=>input.rawSnippet.slice(p.start,p.end)).join('\n');
 return (quote===undefined?null:publisherQuotationIssue(quote,evidence))||newsNumbersIssue(summary,evidence,{strictUnits:true,exactValues:true});
}
