/** Compare selected editorial content, never selection order or retrieval age.
 * Publisher canonical paths and substantive query parameters remain identities. */
export function canonicalNewsUrl(article:any):string {
 const raw=article?.canonicalUrl||article?.originalUrl||article?.original_url||'';
 try{const u=new URL(raw);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);u.searchParams.sort();return u.href;}catch{return raw;}
}
const normalized=(s:unknown)=>typeof s==='string'?s.normalize('NFC').replace(/\s+/g,' ').trim():'';
function content(a:any){return JSON.stringify({title:normalized(a.title||a.title_kr),summary:normalized(a.summary||a.summary_kr),publishedAt:a.publishedAt||a.publication_date||'',source:normalized(a.sourceName||a.source),sourceHeadline:normalized(a.sourceHeadline)});}
export function compareNewsContent(previous:any[],selected:any[]){
 const prior=new Map(previous.map(a=>[canonicalNewsUrl(a),content(a)])),next=new Map(selected.map(a=>[canonicalNewsUrl(a),content(a)]));
 const added:string[]=[],updated:string[]=[],unchanged:string[]=[],removed:string[]=[];
 for(const [url,value]of next)if(!prior.has(url))added.push(url);else if(prior.get(url)!==value)updated.push(url);else unchanged.push(url);
 for(const url of prior.keys())if(!next.has(url))removed.push(url);
 return {added:added.sort(),updated:updated.sort(),unchanged:unchanged.sort(),removed:removed.sort(),hasNewContent:added.length+updated.length>0};
}
