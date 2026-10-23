import fs from 'node:fs';import path from 'node:path';
import {OVERVIEW_COMMODITIES}from'../utils/overviewIntelligence.ts';
import {publicationRecord}from'./overviewMarketHistory.ts';
/** Invoke the exact saved GET gateway in-process; no network, paid route or write. */
export function captureOverviewPublication(gateway:any,now=new Date()){
 const get=(url:string)=>{let body:any=null;gateway({method:'GET',url,headers:{},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},end(value:string){body=JSON.parse(value);}},()=>{});return body;};
 return publicationRecord(OVERVIEW_COMMODITIES.map(([id])=>{
  const a=get('/api/ai-analysis/'+id),n=get('/api/market-intelligence?commodity='+id);let original;
  try{original=JSON.parse(fs.readFileSync(path.join(process.cwd(),'.rms-stage3/snapshots/analysis-'+id+'.json'),'utf8')).payload.data;}catch{}
  return{id,analysis:a?.success?a.data:null,articles:n?.success?n.articles||[]:[],original};
 }),now);
}
