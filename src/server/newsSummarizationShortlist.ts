/**
 * Bounded selection of ALREADY independently verified original publisher pages
 * for one authorized Korean editorial request. This is not an evidence gate or
 * publication approval. A publisher's older bulletins cannot consume the
 * whole model input while fresher verified developments wait outside it.
 *
 * Two newest originals are considered first (even when from one publisher),
 * followed by distinct publishers, then additional dated backup articles.
 * The limit bounds prompt size; it is never a requirement to publish a quota.
 */
export function shortlistVerifiedNewsForSummary<T extends {
  originalUrl:string; publishedAt:string; sourceName?:string;
}>(verified:readonly T[],maxInputs=8):T[]{
  if(!Number.isSafeInteger(maxInputs)||maxInputs<1)return [];
  const byDate=verified.map((article,index)=>({article,index,date:Date.parse(String(article.publishedAt||'')),
    publisher:(()=>{try{return new URL(article.originalUrl).hostname.replace(/^www\./,'').toLowerCase();}
      catch{return String(article.sourceName||'').trim().toLowerCase();}})()
  })).sort((a,b)=>(Number.isFinite(b.date)?b.date:-Infinity)-(Number.isFinite(a.date)?a.date:-Infinity)||a.index-b.index);
  const selected:typeof byDate=[];
  const seenUrls=new Set<string>();
  const publishers=new Set<string>();
  const add=(item:typeof byDate[number])=>{
    // Source identity is established upstream. This only prevents redundant
    // inputs when multiple discovery feeds found the same verified page.
    const url=item.article.originalUrl;
    if(!url||seenUrls.has(url)||selected.length>=maxInputs)return;
    seenUrls.add(url);selected.push(item);publishers.add(item.publisher);
  };
  for(const item of byDate.slice(0,Math.min(2,maxInputs)))add(item);
  for(const item of byDate){if(selected.length>=maxInputs)break;if(!publishers.has(item.publisher))add(item);}
  for(const item of byDate){if(selected.length>=maxInputs)break;add(item);}
  return selected.map(x=>x.article);
}
