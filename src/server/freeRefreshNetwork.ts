import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
/** Applies only inside the existing free runner. Owner-approved paid contexts are untouched. */
type Cycle={attempts:Map<string,number>;audit?:(row:any)=>void;readOnly?:boolean;responses:Map<string,Promise<{bytes:ArrayBuffer;status:number;statusText:string;headers:Headers;url:string;redirected:boolean;type:ResponseType}>>;requests:any[];active:number;queue:Array<()=>void>};
const scope=new AsyncLocalStorage<Cycle>();
let installed=false;
export function installFreeNetworkScope(){
 if(installed)return;installed=true;const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const cycle=scope.getStore();if(!cycle)return original(input,init);
  if(cycle.readOnly)throw Error('External collection disabled for saved page/PDF reads');
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.protocol!=='https:'||/googleapis\.com$|generativelanguage|aiplatform|api\.openai\.com|anthropic/i.test(url.hostname))throw Error('Paid or non-HTTPS transport blocked in free refresh');
  const method=init?.method||'GET';if(!['GET','HEAD','POST'].includes(method))throw Error('Unsupported source method');
  const key=method+' '+url.href+' '+createHash('sha256').update(String(init?.body||'')).digest('hex');
  let response=cycle.responses.get(key);
  if(!response){cycle.attempts.set(key,(cycle.attempts.get(key)||0)+1);response=(async()=>{
   if(cycle.active>=4)await new Promise<void>(r=>cycle.queue.push(r));cycle.active++;
   const log:any={source:url.origin+url.pathname,startedAt:new Date().toISOString()};cycle.requests.push(log);cycle.audit?.({...log,event:'start'});
   try{const signal=init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
    const r=await original(input,{...init,signal});log.status=r.status;
    // Buffer within the timeout so another consumer never inherits a partially read stream.
    const bytes=await r.arrayBuffer();return {bytes,status:r.status,statusText:r.statusText,headers:r.headers,url:r.url,redirected:r.redirected,type:r.type};
   }catch(e){log.error=(e as Error).message;if((cycle.attempts.get(key)||0)<2)cycle.responses.delete(key);throw e;}finally{log.finishedAt=new Date().toISOString();cycle.audit?.({...log,event:'finish'});cycle.active--;cycle.queue.shift()?.();}
  })();cycle.responses.set(key,response);}
  const saved=await response;if(saved.status>=500&&(cycle.attempts.get(key)||0)<2)cycle.responses.delete(key);
  const copy=new Response([204,205,304].includes(saved.status)?null:saved.bytes.slice(0),{status:saved.status,statusText:saved.statusText,headers:saved.headers});
  // A constructed Response loses its original URL. Publisher identity checks
  // must see the real final URL, never the requested URL substituted as evidence.
  Object.defineProperties(copy,{url:{value:saved.url},redirected:{value:saved.redirected},type:{value:saved.type}});return copy;
 };
}
export async function withFreeNetwork<T>(run:()=>Promise<T>,audit?:(row:any)=>void){installFreeNetworkScope();const cycle:Cycle={attempts:new Map(),audit,responses:new Map(),requests:[],active:0,queue:[]};return scope.run(cycle,async()=>({value:await run(),requests:cycle.requests}));}

export function withSavedDataRead<T>(read:()=>T){installFreeNetworkScope();return scope.run({attempts:new Map(),readOnly:true,responses:new Map(),requests:[],active:0,queue:[]},read);}
