export const ORIGIN_RADAR_POLL_MS=5*60_000;
const single=new Set(['wheat','corn','soybean']);
export function savedOriginRadarUrl(id:string){
 return single.has(id)?'/api/'+id+'/origin-radar':'/api/rms/origin-radar-all?commodity='+encodeURIComponent(id);
}
export function watchSavedOriginRadar(id:string,onData:(origins:any[])=>void,options:{
 fetcher?:typeof fetch; document?:Document; window?:Window; initialForce?:boolean;
}={}){
 const doc=options.document||document,win=options.window||window;
 const controller=new AbortController();
 let pending=false,disposed=false,force=options.initialForce===true&&id!=='wheat';
 const read=async()=>{
  if(pending||disposed||doc.hidden)return;
  pending=true;
  const base=savedOriginRadarUrl(id),url=force?base+(base.includes('?')?'&':'?')+'force=true':base;
  force=false;
  try{
   const readOptions={cache:'no-store' as const,signal:controller.signal};
   let r=await(options.fetcher||fetch)(url,readOptions);
   if(url!==base&&!r.ok&&!disposed)r=await(options.fetcher||fetch)(base,readOptions);
   const json=r.ok?await r.json():null;
   if(!disposed&&json?.success&&Array.isArray(json.origins)&&json.origins.length)onData(json.origins);
  }catch{/* Preserve the last published radar during transport outages. */}
  finally{pending=false;}
 };
 const check=()=>{void read();};
 win.addEventListener('focus',check);doc.addEventListener('visibilitychange',check);
 const timer=win.setInterval(check,ORIGIN_RADAR_POLL_MS);
 check();
 return ()=>{disposed=true;controller.abort();win.clearInterval(timer);win.removeEventListener('focus',check);doc.removeEventListener('visibilitychange',check);};
}
