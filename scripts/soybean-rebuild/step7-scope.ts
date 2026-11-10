/**
 * Shared, evidence-preserving guard for procurement recommendations.
 * A related commodity can be mentioned as a MARKET DRIVER, but a recommendation
 * to buy/contract/hedge that commodity instead of the selected one is review-needed.
 * This is a conservative heuristic, NOT a semantic proof. Never deletes prose.
 */

const dictionary: Array<{id: string; aliases: string[]}> = [
  {id:'wheat', aliases:['wheat','소맥','원맥','밀']},
  {id:'corn', aliases:['corn','maize','옥수수']},
  {id:'soybean', aliases:['soybeans','soybean','대두','콩']},
  {id:'soybean-oil', aliases:['soybean oil','soyoil','대두유','콩기름']},
  {id:'palm-oil', aliases:['palm oil','팜유','팜오일']},
  {id:'sugar', aliases:['raw sugar','sugar','설탕','원당']},
  {id:'potato-starch', aliases:['potato starch','감자전분']},
  {id:'tapioca-starch', aliases:['tapioca starch','cassava starch','타피오카전분','타피오카 전분']},
  // Related products are not RMS target commodities, but buying them may be an out-of-scope action.
  {id:'soybean-meal', aliases:['soybean meal','soymeal','대두박']},
  {id:'wheat-starch', aliases:['wheat starch','소맥전분','밀전분']},
  {id:'wheat-gluten', aliases:['wheat gluten','글루텐']},
  {id:'corn-starch', aliases:['corn starch','옥수수전분']},
  {id:'modified-starch', aliases:['acetylated starch','modified starch','초산전분','변성전분']},
];

const aliasEntries = dictionary.flatMap(({id,aliases})=>aliases.map(name=>({id,name})))
  .sort((a,b)=>b.name.length-a.name.length);
const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliasMatcher=new RegExp(aliasEntries.map(x=>/[a-z]/i.test(x.name)?
  `\\b${escaped(x.name)}\\b`:escaped(x.name)).join('|'),'gi');
const lookup=new Map(aliasEntries.map(x=>[x.name.toLowerCase(),x.id]));
const actionMatcher=/(?:선도\s*)?(?:구매|매수|매입|발주|계약|헤지|비축|조달|확보)/g;
const falseActionSuffix=/^\s*(?:수요|가격|여건|의향|전망|증가율|규모|실적|시장|현황|물량\s*(?:전망|통계))/;

export type ProcurementScopeFlag={
  relatedCommodity:string; matchedTerm:string; action:string; fragment:string;
};

function matches(text:string){
  aliasMatcher.lastIndex=0;
  const results:Array<{start:number;end:number;id:string;term:string}>=[];
  for(const m of text.matchAll(aliasMatcher)){
    const id=lookup.get(m[0].toLowerCase());
    if(id)results.push({start:m.index,end:m.index+m[0].length,id,term:m[0]});
  }
  return results;
}

/** Returns suspicious actions only. A clean result does NOT certify full semantic correctness. */
export function checkProcurementScope(strategy:string,targetCommodity:string):ProcurementScopeFlag[]{
  if(!dictionary.some(x=>x.id===targetCommodity))return [];
  const suspicious:ProcurementScopeFlag[]=[];
  // Avoid connecting an action across separate Korean contrast clauses.
  const clauses=strategy.split(/(?:[.!?。；;\n]|[,，]|하되|반면|다만|하지만)/);
  for(const rawClause of clauses){
    const clause=rawClause.trim();
    if(!clause)continue;
    const named=matches(clause);
    if(!named.length)continue;
    actionMatcher.lastIndex=0;
    for(const action of clause.matchAll(actionMatcher)){
      const suffix=clause.slice(action.index+action[0].length);
      if(falseActionSuffix.test(suffix))continue; // e.g. "대두유 구매수요" is market context.
      const antecedents=named.filter(x=>x.end<=action.index && action.index-x.end<=100);
      // A trailing purchase-object ("구매 대상 대두유") is also out of scope.
      const trailing=named.filter(x=>x.start>=action.index+action[0].length &&
        x.start-(action.index+action[0].length)<=12 &&
        /^(?:\s|대상|품목|은|는|을|를|:|：|\(|\))+$/u.test(suffix.slice(0,x.start-(action.index+action[0].length))));
      let implicated=antecedents.length?antecedents.slice(-1):trailing.slice(0,1);
      if(!implicated.length)continue;
      // When a coordinated list is bought together, check all its members, not only the last one.
      const nearest=implicated[0];
      const inSameList=antecedents.filter(x=>x!==nearest && nearest.start-x.end<=12 &&
        /^(?:\s|·|\/|,|및|와|과|하고|또는|와\s*함께|과\s*함께)+$/u.test(clause.slice(x.end,nearest.start)));
      implicated=[...inSameList,...implicated];
      for(const item of implicated){
        if(item.id!==targetCommodity)suspicious.push({relatedCommodity:item.id,
          matchedTerm:item.term,action:action[0],fragment:clause.slice(0,140)});
      }
    }
  }
  return suspicious.filter((x,i,a)=>a.findIndex(y=>y.relatedCommodity===x.relatedCommodity &&
    y.action===x.action && y.fragment===x.fragment)===i);
}
