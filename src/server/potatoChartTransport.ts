/** Only the Potato production chart uses this transport. No global TLS/trust changes. */
import https from 'node:https';import * as tls from 'node:tls';
import {gunzipSync,brotliDecompressSync,inflateSync} from 'node:zlib';
const certs=()=>[...new Set([...tls.rootCertificates,...(typeof tls.getCACertificates==='function'?tls.getCACertificates('default'):[]),...(typeof tls.getCACertificates==='function'?tls.getCACertificates('system'):[])])];
const agent=new https.Agent({ca:certs(),rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity,keepAlive:true});
export const potatoChartOfficialFetch:typeof fetch=async(input,init:RequestInit={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 const allowed=url.hostname==='ec.europa.eu'&&url.pathname.startsWith('/eurostat/api/dissemination/statistics/1.0/data/')||url.hostname==='joint-research-centre.ec.europa.eu'&&(url.pathname.startsWith('/monitoring-agricultural-resources-mars/')||url.pathname.startsWith('/jrc-news-and-updates/'))||url.hostname==='publications.jrc.ec.europa.eu'&&url.pathname.startsWith('/repository/');
 if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed||init.method&&init.method!=='GET')throw Error('Potato chart accepts only official HTTPS GET sources');
 const headers=Object.fromEntries(new Headers(init.headers||{}).entries());
 return new Promise<Response>((resolve,reject)=>{
  const request=https.get(url,{agent,headers,signal:init.signal||undefined,rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity},response=>{
   const chunks:Buffer[]=[];let size=0;
   response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>64_000_000){response.destroy(Error('Official source size limit exceeded'));return;}chunks.push(chunk);});response.on('error',reject);
   response.on('end',()=>{try{
    let body=Buffer.concat(chunks);const encoding=response.headers['content-encoding'];
    if(encoding==='gzip')body=gunzipSync(body,{maxOutputLength:64_000_000});else if(encoding==='br')body=brotliDecompressSync(body,{maxOutputLength:64_000_000});else if(encoding==='deflate')body=inflateSync(body,{maxOutputLength:64_000_000});
    const resultHeaders=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined&&!['content-encoding','content-length'].includes(key))resultHeaders.set(key,Array.isArray(value)?value.join(', '):value);
    resolve(new Response(body,{status:response.statusCode||502,headers:resultHeaders}));
   }catch(error){reject(error);}});
  });request.on('error',reject);request.setTimeout(25000,()=>request.destroy(Object.assign(Error('Official source timed out'),{code:'ETIMEDOUT'})));
 });
};
