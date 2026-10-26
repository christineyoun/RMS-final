import {formatWasdeResponse} from './usdaFasService.ts';
/** Normal reads never collect. Explicit owner refreshes keep the existing collector routes. */
import fs from 'node:fs';
import {readFreeJson,readFreePublication} from './freeDailyPublication.ts';
import {retainedFx,overviewWeatherFromSaved,overviewMacroFromSaved} from './freeDailyJobs.ts';
export async function savedFreeDataResponse(url:string,method='GET'):Promise<{status:number;payload:any}|null>{
 const u=new URL(url,'http://localhost');if(u.searchParams.get('force')==='true'||u.searchParams.get('forceRefresh')==='true')return null;
 const publication=readFreePublication(),data=publication?.data;
 const ok=(payload:any,status=200)=>({status,payload});
 if((u.pathname==='/api/corn/procurement-analysis'||u.pathname==='/api/corn/analysis')&&data?.cornProcurement)return ok({success:true,data:data.cornProcurement});
 if(u.pathname==='/api/rms/free-publication')return data?ok({...publication,data:{...data,weatherOverview:overviewWeatherFromSaved()}}):ok({success:false,status:'not-published'},503);
 if(u.pathname==='/api/rms/free-fx'){const fx=data?.fx||retainedFx();return fx?ok(fx):ok({success:false},503);}
 const usda=/^\/api\/usda\/(wheat|corn|soybean|soybean-oil|palm-oil|sugar)$/.exec(u.pathname);
 if(usda){const id=usda[1];
  const requested=u.searchParams.get('marketYear');
  if(requested){
   if(!/^20\d{2}$/.test(requested))return ok({success:false,dataStatus:'unavailable'},400);
   const saved=readFreeJson('usda_world_verified_'+id+'_'+requested+'.json', 'src/data');
   if(!saved||String(saved.data?.marketYear)!==requested)return ok({success:false,dataStatus:'unavailable',marketYear:requested},503);
   return ok({success:true,data:saved.data,dataStatus:'last-verified',verifiedAt:saved.verifiedAt,sourceUrl:saved.sourceUrl,observationStatus:saved.observationStatus});
  }
  try{const saved=JSON.parse(fs.readFileSync('src/data/'+(id==='soybean-oil'?'usda_soybean_oil_last_verified.json':'usda_world_last_verified_'+id+'.json'),'utf8'));const formatted=id==='soybean-oil'?formatWasdeResponse(id,saved.data,saved.verifiedAt):{success:true,data:saved.data};return ok({...formatted,commodity:id,dataStatus:'last-verified',verifiedAt:saved.verifiedAt,marketYear:saved.data.marketYear});}catch{return ok({success:false,dataStatus:'unavailable'},503);}}
 if(u.pathname==='/api/starch/potato-stats'){
  const run=readFreeJson('free-potato-stats.json');if(run)return ok(run);
  try{const receipt=JSON.parse(fs.readFileSync('.rms-stage3/evidence/potato-stats.json','utf8'));return ok(JSON.parse(receipt.body));}catch{return ok({success:false},503);}
 }
 if(u.pathname==='/api/rms/saved-market-data'||u.pathname==='/api/market-data/normalized'||u.pathname==='/api/pipeline/telemetry'){
  const macro=overviewMacroFromSaved(data),fx=data?.fx||retainedFx(),raw=fx?.raw,normalizedData:any={};if(raw){for(const [commodity,value]of [['USD/KRW',raw.rates.KRW],['EUR/KRW',raw.rates.KRW/raw.rates.EUR],['EUR/USD',1/raw.rates.EUR],['USD/MYR',raw.rates.MYR]])if(Number.isFinite(value))normalizedData[String(commodity)]={commodity,indicator:String(commodity),value,unit:'FX',date:raw.date,lastUpdated:fx.verifiedAt,source:'ECB/Frankfurter',sourceUrl:'https://api.frankfurter.dev'};}
  return ok({sources:[],normalizedData,failedSourcesCount:publication?.status==='partial'?1:0,alerts:[],updatedAt:publication?.publishedAt||null,usdKrw:raw?.rates.KRW,eurKrw:raw?raw.rates.KRW/raw.rates.EUR:undefined,overviewMacro:macro,energy:{...macro.energy,scfi:macro.freight?.scfi??null,freightObservationDate:macro.freight?.observationDate??null},fxObservationDate:raw?.date});
 }
 return null;
}
