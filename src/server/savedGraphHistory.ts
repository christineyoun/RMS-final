/** Read published price observations without collecting, dating forward or writing.
 * Existing history readers/conversions and source-specific response contracts remain authoritative. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadWheatHistory,toChartPoints,buildWheatMetrics,WHEAT_PRICE_SOURCE} from './wheatPriceHistoryStore.ts';
import {readSoybeanHistory,SOYBEAN_HISTORY_FILE} from './soybeanPriceHistoryStore.ts';
import {readSoybeanOilHistory,SOYBEAN_OIL_HISTORY_FILE} from './soybeanOilPriceHistoryStore.ts';
import {CORN_BUSHELS_PER_MT} from '../utils/commodityConversions.ts';

const cornFile=()=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history/corn.json');
const manualSnapshots=new Map<string,any>();
export function validateSavedCornHistory(payload:any){
 if(!payload?.success||payload.commodity!=='corn'||!/^ZC=F(?:\s|$)/.test(payload.symbol)||payload.quoteUnit!=='US¢/bu'||payload.priceUnit!=='USD/MT'||!Number.isFinite(Date.parse(payload.fetchedAt))||Date.parse(payload.fetchedAt)>Date.now()||!Array.isArray(payload.data)||!payload.data.length)throw Error('Saved Corn source identity/units unavailable');
 for(const [i,p]of payload.data.entries()){
  const quote=p.quoteValue??p.centsPerBushel;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||Date.parse(p.date)>Date.now()||new Date(p.date).toISOString().slice(0,10)!==p.date||(i>0&&p.date<=payload.data[i-1].date)||p.isSynthetic||!Number.isFinite(quote)||quote<=0||!Number.isFinite(p.usdPerMT)||Math.abs(p.usdPerMT-Number((quote/100*CORN_BUSHELS_PER_MT).toFixed(2)))>.011)throw Error('Invalid saved Corn observations');
 }
 return payload;
}
export function retainCornGraphHistory(payload:any){
 validateSavedCornHistory(payload);
 const file=cornFile();fs.mkdirSync(path.dirname(file),{recursive:true});
 let retained=payload;
 if(fs.existsSync(file)){
  const old=validateSavedCornHistory(JSON.parse(fs.readFileSync(file,'utf8')).payload);
  if(Date.parse(payload.fetchedAt)<Date.parse(old.fetchedAt))return;
  const points=new Map(old.data.map((p:any)=>[p.date,p]));
  for(const point of payload.data)points.set(point.date,point);
  retained={...payload,data:[...points.values()].sort((a:any,b:any)=>a.date.localeCompare(b.date))};
 }
 const temporary=file+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify({version:1,payload:retained},null,2));fs.renameSync(temporary,file);
}
/** Preserve explicit refresh behavior; ordinary reads never call this writer. */
export async function rememberGraphRefresh(id:string,payload:any){
 if(!payload?.success||payload.stale)return;
 if(id==='corn')retainCornGraphHistory(payload);
 if(id==='sugar'){
  const {validateSugarHistory}=await import('./sugarPriceSnapshotService.ts');validateSugarHistory(payload);
  const file=path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history/sugar.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});let prior:any;try{prior=JSON.parse(fs.readFileSync(file,'utf8')).payload;}catch{}
  if(!prior||Date.parse(payload.fetchedAt)>=Date.parse(prior.fetchedAt)){const points=new Map((prior?.data||[]).map((p:any)=>[p.date,p]));for(const p of payload.data)points.set(p.date,p);const saved={...payload,data:[...points.values()].sort((a:any,b:any)=>a.date.localeCompare(b.date))};const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({version:1,payload:saved},null,2));fs.renameSync(tmp,file);manualSnapshots.set(id,structuredClone(saved));}
 }
}
function savedWheat(){
 if(!fs.existsSync(path.join(process.cwd(),'.rms-price-history/wheat.json')))throw Error('저장된 U.S. Wheat 가격 이력이 없습니다.');
 const stored=loadWheatHistory(),data=toChartPoints(stored.points),metrics=buildWheatMetrics(stored.points),latest=stored.points.at(-1);
 if(!metrics||!data.length||!latest)throw Error('저장된 U.S. Wheat 가격 이력을 확인할 수 없습니다.');
 return {success:true,statusCode:200,source:'U.S. Wheat Associates',sourceUrl:WHEAT_PRICE_SOURCE,
  reportDate:data.at(-1)!.reportDate,lastRetrievalTime:stored.lastCheckedAt,primaryUnit:'USD/MT',secondaryUnit:'USD/bu',
  count:data.length,data,metrics,isCached:true,latestSourceType:latest.provenance,
  sourceStatus:stored.lastError?'unavailable':latest.provenance==='source-verified'?'verified':'baseline',
  sourceLastCheckedAt:stored.lastCheckedAt||null,sourceLastVerifiedAt:stored.lastVerifiedAt||null,sourceError:stored.lastError||null};
}
async function savedHistory(id:string,timeframe:string):Promise<any>{
 if(id==='soybean'||id==='soybean-oil'){
  const state=id==='soybean'?readSoybeanHistory(SOYBEAN_HISTORY_FILE()):readSoybeanOilHistory(SOYBEAN_OIL_HISTORY_FILE());
  if(!state.snapshot)throw Error('저장된 '+id+' 가격 이력이 없습니다.');
  const payload:any={...state.snapshot,refreshMetadata:{lastAttempt:state.lastAttempt,lastSuccessAt:state.lastSuccessAt,lastObservationUpdateAt:state.lastObservationUpdateAt},lastError:state.lastAttempt?.error};
  if(id==='soybean-oil'){
   const cache=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/data/usda_soybean_oil_last_verified.json'),'utf8'));
   payload.supplyEvidence={success:true,status:'last-verified',data:cache.data,verifiedAt:cache.verifiedAt,checkedAt:cache.verifiedAt};
  }
  return payload;
 }
 if(id==='sugar'){
  if(manualSnapshots.has(id))return structuredClone(manualSnapshots.get(id));
  const store=path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history/sugar.json');if(fs.existsSync(store)){const saved=JSON.parse(fs.readFileSync(store,'utf8'));const {validateSugarHistory}=await import('./sugarPriceSnapshotService.ts');if(saved.version===1)return validateSugarHistory(saved.payload);}
  const receipt=JSON.parse(fs.readFileSync(path.join(process.cwd(),'.rms-stage3/evidence/sugar-price.json'),'utf8'));
  if(receipt.status!==200||createHash('sha256').update(receipt.body).digest('hex')!==receipt.sha256||!Number.isFinite(Date.parse(receipt.retrievedAt))||Date.parse(receipt.retrievedAt)>Date.now())throw Error('Saved Sugar price receipt integrity failed');
  const payload=JSON.parse(receipt.body);
  const {validateSugarHistory}=await import('./sugarPriceSnapshotService.ts');validateSugarHistory(payload);
  return {...payload,dataStatus:'last-verified'};
 }
 if(id==='corn'){
  if(!fs.existsSync(cornFile()))throw Error('저장된 CBOT 옥수수 가격 이력이 없습니다. 공식 시세를 명시적으로 갱신해 주세요.');
  const store=JSON.parse(fs.readFileSync(cornFile(),'utf8'));if(store.version!==1)throw Error('Unsupported saved Corn history');
  const payload=validateSavedCornHistory(store.payload),days:Record<string,number>={'1M':30,'3M':90,'6M':180,'1Y':365,'5Y':1826};
  const cutoff=Date.now()-(days[timeframe]??1826)*86400000;
  return {...payload,timeframe,data:payload.data.filter((p:any)=>Date.parse(p.date)>=cutoff),dataStatus:'last-verified'};
 }
 if(id==='palm-oil'||id==='tapioca-starch'||id==='potato-starch'){
  const {fetchHistoricalData}=await import('./historicalPriceService.ts');return fetchHistoricalData(id,timeframe,false);
 }
 throw Error('Unsupported saved commodity history');
}
/** null means this is not a normal graph read; explicit refreshes retain their existing path. */
export async function savedGraphHistoryResponse(url:string):Promise<{status:number;payload:any}|null>{
 const u=new URL(url,'http://localhost');
 const wheat=u.pathname==='/api/uswheat/price-history';
 const snapshot=/^\/api\/(soybean|soybean-oil|sugar)\/price-snapshot$/.exec(u.pathname);
 const universal=u.pathname==='/api/history'||u.pathname.startsWith('/api/history/')||u.pathname==='/api/corn/price-history';
 if(!wheat&&!snapshot&&!universal)return null;
 if(u.searchParams.get('force')==='true'||u.searchParams.get('forceRefresh')==='true')return null;
 try{
  const id=snapshot?.[1]||u.searchParams.get('commodity')||(u.pathname==='/api/corn/price-history'?'corn':u.pathname.split('/')[3])||'corn';
  const normalized=id.trim().toLowerCase().replace(/_/g,'-');
  const payload=wheat?savedWheat():await savedHistory(normalized==='palmoil'?'palm-oil':normalized,u.searchParams.get('timeframe')||'6M');
  return {status:payload.success===false?503:200,payload};
 }catch(e){return {status:503,payload:{success:false,data:[],dataStatus:'unavailable',error:(e as Error).message}};}
}
