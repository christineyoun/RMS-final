/** Potato-starch procurement relevance in the *candidate queue* only.
 * Never a substitute for verifying the original article, Korean summary,
 * source-body evidence, publication date or scheduled publication gate.
 */
type Candidate={rawTitle?:string;title?:string;publishedAt?:string;originalUrl?:string;sourceName?:string};
const direct=/(?:potato(?:es)?[ -]?starch|starch[ -]?potato(?:es)?|\bavebe\b|\blyckeby\b|\bemsland\b)/i;
const movement=/(?:prices?|pricing|contracts?|suppl(?:y|ies)|demand|stocks?|inventor(?:y|ies)|production|capacity|costs?|harvest|yields?|procurement|processing|shortage|exports?|imports?|supply chain|feedstock|acreage|crop)/i;
const nonMarket=/(?:award|appointed|promotion|webinar|conference|innovation prize|vegan sweets|recipe|product launch)/i;
export function potatoStarchCandidatePriority(a:Candidate):number{
 const title=String(a.rawTitle||a.title||'');
 if(nonMarket.test(title))return -10;
 if(direct.test(title)&&movement.test(title))return 3;
 if(direct.test(title))return 2;
 // Generic table-potato reports may have material starch feedstock evidence
 // in their original body, but should not crowd out direct starch coverage.
 if(/\bpotato(?:es)?\b/i.test(title)&&movement.test(title))return 1;
 return 0;
}
/** Bounded, source-diverse ordering. No fixed article URLs, dates, or text. */
export function prioritizePotatoStarchCandidates<T extends Candidate>(items:readonly T[]):T[]{
 const ranked=items.map((article,index)=>({article,index,priority:potatoStarchCandidatePriority(article),
  date:Date.parse(String(article.publishedAt||''))||0,
  publisher:(()=>{try{return new URL(String(article.originalUrl||'')).hostname.replace(/^www\./,'').toLowerCase();}
   catch{return String(article.sourceName||'unknown').toLowerCase();}})()}));
 ranked.sort((a,b)=>b.priority-a.priority||b.date-a.date||a.index-b.index);
 const first:typeof ranked=[],more:typeof ranked=[];
 const perPublisher=new Map<string,number>();
 for(const row of ranked){
  const count=perPublisher.get(row.publisher)||0;
  if(count>=2){more.push(row);continue;}
  first.push(row);perPublisher.set(row.publisher,count+1);
 }
 return [...first,...more].map(x=>x.article);
}
