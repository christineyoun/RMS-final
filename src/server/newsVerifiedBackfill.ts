/** Verify a bounded first wave, then refill only when too few original pages
 * survived strict publisher-body/date/commodity checks. Backfill is NOT an
 * acceptance shortcut and never authorizes Gemini or changes saved articles.
 */
export async function verifyWithBoundedBackfill<T>(
  candidates:readonly T[],
  verifier:(candidate:T)=>Promise<T|null>,
  options:{firstWave?:number;maximum?:number;target?:number;limit?:number}={}
):Promise<T[]>{
  const firstWave=options.firstWave??16;
  const maximum=options.maximum??32;
  const target=options.target??6;
  const limit=options.limit??8;
  if(![firstWave,maximum,target,limit].every(Number.isSafeInteger)||
     firstWave<1||maximum<firstWave||target<1||limit<target||maximum>32)
    return [];
  const accepted:T[]=[];
  for(let start=0;start<Math.min(maximum,candidates.length);start+=firstWave){
    const batch=candidates.slice(start,Math.min(start+firstWave,maximum));
    const results=await Promise.all(batch.map(verifier));
    for (const item of results) {
      if (item !== null) accepted.push(item as T);
    }
    // Extra original-page requests are unnecessary when enough verified
    // evidence survived the first wave. The downstream summary/fact gates
    // still determine which (if any) articles can publish.
    if(accepted.length>=target)break;
  }
  return accepted.slice(0,limit);
}
