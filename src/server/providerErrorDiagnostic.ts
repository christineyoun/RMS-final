/** Bounded, allowlisted provider diagnostics. Never persist raw bodies/headers. */
export type ProviderErrorDiagnostic={httpStatus:number;bodyFormat:'google-json'|'non-json'|'truncated'|'empty';
 code?:number;status?:string;message?:string;fieldViolations?:Array<{field:string;description:string}>;requestId?:string;bodyTruncated:boolean};
export const PROVIDER_ERROR_BODY_LIMIT=16384;
function requestStrings(value:any,result:string[]=[],depth=0):string[]{
 if(depth>12||result.length>256)return result;
 if(typeof value==='string')result.push(value);
 else if(Array.isArray(value))for(const item of value)requestStrings(item,result,depth+1);
 else if(value&&typeof value==='object')for(const item of Object.values(value))requestStrings(item,result,depth+1);
 return result;
}
export function sanitizeProviderError(body:string,httpStatus:number,headers:Headers,params:any,requestHeaders?:HeadersInit,input?:any,truncated=false):ProviderErrorDiagnostic{
 const secrets:string[]=[];
 // Credentials stay in memory only for redaction, never in returned metadata.
 const sensitive=/authorization|api[-_]?key|cookie|token|secret|credential/i;
 for(const source of [requestHeaders,params.config?.httpOptions?.headers])if(source)for(const [k,v]of new Headers(source))if(sensitive.test(k)){secrets.push(v);if(/^Bearer\s+/i.test(v))secrets.push(v.replace(/^Bearer\s+/i,''));}
 if(input)try{for(const[k,v]of new URL(typeof input==='string'?input:input.url).searchParams)if(sensitive.test(k))secrets.push(v);}catch{/* no URL metadata retained */}
 for(const[k,v]of Object.entries(process.env))if(/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(k)&&typeof v==='string'&&v.length>=6)secrets.push(v);
 const content=requestStrings([params.contents,params.config?.systemInstruction]);
 const fragments=content.flatMap(s=>[s,...s.split(/[\r\n]+/),...s.match(/\S{12,}/g)||[]]).filter(s=>s.length>=8).slice(0,4096);
 const forbidden=[...new Set([...secrets,...fragments])].filter(Boolean).sort((a,b)=>b.length-a.length);
 const clean=(value:unknown,limit=1024)=>{
  if(typeof value!=='string')return '';
  let text=value.slice(0,8192).replace(/[\u0000-\u001f\u007f]/g,' ');
  for(const word of forbidden)text=text.split(word).join('[redacted]');
  return text.replace(/https?:\/\/[^\s<>]+/gi,'[redacted URL]')
   .replace(/AIza[\w-]{20,}/g,'[redacted key]').replace(/Bearer\s+[^\s,;]+/gi,'Bearer [redacted]')
   .replace(/\b(api[-_ ]?key|authorization|password|secret|token|cookie)\s*[:=]\s*[^,;\s]+/gi,'$1=[redacted]')
   .replace(/"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`/g,'[redacted value]').slice(0,limit);
 };
 const result:ProviderErrorDiagnostic={httpStatus,bodyFormat:truncated?'truncated':body?'non-json':'empty',bodyTruncated:truncated};
 const correlation=headers.get('x-goog-request-id')||headers.get('x-request-id')||headers.get('request-id');
 if(correlation)result.requestId=clean(correlation,128);
 if(truncated)return result; // Partial JSON/plain text never becomes an untrusted error message.
 let parsed:any;try{parsed=JSON.parse(body);}catch{return result;}
 const error=parsed?.error;if(!error||typeof error!=='object')return result;
 result.bodyFormat='google-json';
 if(Number.isInteger(error.code)&&error.code>=100&&error.code<=599)result.code=error.code;
 if(typeof error.status==='string'&&/^[A-Z_]{1,64}$/.test(error.status))result.status=error.status;
 const message=clean(error.message);if(message)result.message=message;
 const violations:Array<{field:string;description:string}>=[];
 for(const detail of Array.isArray(error.details)?error.details.slice(0,8):[]){
  if(detail?.['@type']==='type.googleapis.com/google.rpc.BadRequest')for(const v of Array.isArray(detail.fieldViolations)?detail.fieldViolations.slice(0,8):[]){
   const field=clean(v.field,256),description=clean(v.description,512);if(field||description)violations.push({field,description});if(violations.length>=8)break;
  }
  if(!result.requestId&&detail?.['@type']==='type.googleapis.com/google.rpc.RequestInfo'&&typeof detail.requestId==='string')result.requestId=clean(detail.requestId,128);
 }
 if(violations.length)result.fieldViolations=violations.slice(0,8);
 return result;
}
/** Consume at most 16 KiB, then return a bounded replay for SDK error handling.
 * No clone/tee cancellation deadlock; the existing request deadline covers reads.
 */
export async function captureProviderError(response:Response,params:any,requestHeaders?:HeadersInit,input?:any){
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0,truncated=false;
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;const take=value.subarray(0,PROVIDER_ERROR_BODY_LIMIT-size);chunks.push(take);size+=take.length;if(value.length>take.length||size>=PROVIDER_ERROR_BODY_LIMIT){truncated=true;void reader.cancel().catch(()=>{});break;}}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const text=new TextDecoder().decode(bytes),diagnostic=sanitizeProviderError(text,response.status,response.headers,params,requestHeaders,input,truncated);
 const replayHeaders=new Headers();const contentType=response.headers.get('content-type');if(contentType)replayHeaders.set('content-type',contentType);
 return {diagnostic,response:new Response(bytes,{status:response.status,statusText:response.statusText,headers:replayHeaders})};
}
