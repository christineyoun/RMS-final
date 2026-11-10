import {recentMarketArticles} from './newsFreshnessPolicy.ts';

/** Display ONLY previously verified/editorially selected articles.
 * Fresh articles first; retain older approved articles to reach the four-card
 * TARGET. Never invent filler or lower independent verification requirements. */
export function chooseVerifiedNewsDisplay<T extends {publishedAt?:string}>(
  selected:readonly T[],now=new Date()
):{articles:T[];sourceStatus:'verified-current-selection'|'verified-retained-originals'|'verified-retained-stale'}{
  const week=recentMarketArticles(selected,7,now);
  const month=recentMarketArticles(selected,30,now);
  const articles=[...week,...selected.filter(item=>!week.includes(item))].slice(0,4);
  return {articles,sourceStatus:
    week.length?'verified-current-selection':
    month.length?'verified-retained-originals':'verified-retained-stale'};
}
