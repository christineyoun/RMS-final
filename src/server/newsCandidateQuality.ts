/** RMS_MI_ACCESS_AND_RELEVANCE_V3: shared, conservative candidate-quality guard.
 * A candidate is not proof of publication or procurement relevance.
 * These checks supplement, never replace, original-page verification.
 */
export function materialMarketHeadline(title:string):boolean {
 const s=String(title||'').replace(/\s+/g,' ').trim();
 if(!s)return false;
 // Corporate personnel and ceremony coverage cannot fill the procurement-news quota.
 if(/\b(?:appoints?|appointments?|hires?|promotes?|names?\s+(?:new|next)|elects?\s+(?:new|next)|new\s+(?:chairman|chairwoman|chairperson|ceo|president)|leadership\s+(?:change|appointment)|board\s+(?:appointment|election)|wins?\s+(?:an?\s+)?award|receives?\s+(?:an?\s+)?award|award\s+ceremony|conference\s+agenda|webinar\s+registration)\b/i.test(s))return false;
 return true;
}

export function potatoStarchMarketSubject(title:string,body:string):boolean {
 const s=(String(title||'')+' '+String(body||'').slice(0,6000)).replace(/\s+/g,' ');
 const topic=/\b(?:potato(?:es)?[ -]?starch|starch[ -]?potato(?:es)?|potato(?:es)?\s+(?:feedstock|raw material)|avebe|lyckeby|zetmeelaardappelen|zetmeel)\b|감자\s*전분/i;
 const development=/\b(?:prices?|pricing|costs?|contracts?|suppl(?:y|ies)|stocks?|inventor(?:y|ies)|demand|production|output|processing\s+capacity|harvest|yields?|crops?|shortage|exports?|imports?|freight|procurement|purchasing|raw material|feedstock|prijs|prijzen|droogte|oogst|aanvoer|levering|verwerking|verwerkers|afrekening|betaling|volume|schaarste|ton)\b|가격|공급|생산|수확|재고|수요/i;
 return topic.test(s)&&development.test(s);
}
