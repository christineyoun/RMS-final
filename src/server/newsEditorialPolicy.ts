/** RMS MI editorial quality. Runs only AFTER source/evidence verification.
 * No URL fetching, AI calls, automatic approval, or persistent side effects.
 */
type ArticleLike={title?:string;sourceHeadline?:string;summary?:string;originalUrl?:string;sourceName?:string;verifiedSourceEvidence?:{excerpt?:string}};
const tidy=(x:unknown)=>String(x||'').replace(/\s+/g,' ').trim();
export function materialEditorialHeadline(title:unknown):boolean{
 const s=tidy(title);
 return !!s&&!/\b(?:appoints?|appointments?|names?\s+(?:a\s+)?new\s+(?:ceo|chairman|chairperson|director)|elected?\s+as\s+(?:chairman|president)|leadership\s+(?:appointment|change)|board\s+election|wins?\s+(?:an?\s+)?award|award\s+ceremony|conference\s+agenda|webinar\s+registration)\b|(?:임원\s*인사|대표이사\s*선임|회장\s*선출|수상\s*소식)/i.test(s);
}
export function editorialPublisherKey(a:ArticleLike):string{
 try{
  const host=new URL(a.originalUrl||'').hostname.replace(/^www\./i,'').toLowerCase();
  if(host)return host;
 }catch{}
 return tidy(a.sourceName).toLowerCase()||'unknown-publisher';
}
export function recurringNewsSeriesKey(a:ArticleLike):string{
 const title=tidy(a.sourceHeadline||a.title);
 if(/\b(?:week\s+of\s+\d{1,2}|weekly\s+(?:market|price)|daily\s+(?:market|sugar|wire)|market\s+perspectives\s*[–-]|월간\s+(?:시장|시황)|주간\s+(?:시장|시황))\b/i.test(title))return 'recurring-market-report';
 return '';
}
/** For potato starch, a generic table-potato headline needs a traceable
 * reference to starch-feedstock economics in the verified original excerpt.
 * The generated Korean summary alone cannot establish that link.
 */
export function hasPotatoStarchLink(a:ArticleLike):boolean{
 const headline=tidy(a.sourceHeadline||a.title);
 if(/(?:potato(?:es)?[ -]?starch|starch[ -]?potato(?:es)?|avebe|lyckeby|zetmeelaardappelen|zetmeel|감자\s*전분)/i.test(headline))return true;
 const evidence=tidy(a.verifiedSourceEvidence?.excerpt);
 if(!evidence)return false;
 const subject=/(?:potato(?:es)?[ -]?starch|starch[ -]?potato(?:es)?|starch[ -]?processing|starch[ -]?production|industrial\s+potatoes|감자\s*전분)/i;
 const change=/(?:prices?|pricing|contract|feedstock|procurement|purchase|suppl(?:y|ies)|output|yield|production|costs?|stocks?|harvest|drought|shortage|가격|수급|생산|수매|수확|단수)/i;
 for(const m of evidence.matchAll(new RegExp(subject.source,'gi'))){
  const at=m.index||0;
  const context=evidence.slice(Math.max(0,at-150),Math.min(evidence.length,at+220));
  if(change.test(context))return true;
 }
 return false;
}
