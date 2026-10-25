/** One verified oil-specific world feed for S&D and procurement, with dated outage fallback. */
import fs from 'node:fs/promises';import path from 'node:path';
import {parseSoybeanOilSupply,soybeanOilMarketingYear,type SoybeanOilSupplyResult} from '../lib/soybeanOilSupply.ts';
export type SoybeanOilPsdResult=SoybeanOilSupplyResult;
export class SoybeanOilWorldPsdService {
 private pending:Promise<SoybeanOilPsdResult>|null=null;private lastCheck=0;private cached:any=null;private failed=false;
 constructor(private options:{file?:string|null;fetcher?:typeof fetch;now?:()=>Date;key?:()=>string}={}){}
 private now(){return this.options.now?.()||new Date();}
 private file(){return this.options.file===undefined?path.join(process.cwd(),'src/data/usda_soybean_oil_last_verified.json'):this.options.file;}
 async get(force=false):Promise<SoybeanOilPsdResult>{if(this.pending)return this.pending;this.pending=this.refresh(force);try{return await this.pending;}finally{this.pending=null;}}
 private async refresh(force:boolean):Promise<SoybeanOilPsdResult>{
  const now=this.now(),checkedAt=now.toISOString(),year=soybeanOilMarketingYear(now),file=this.file();
  if(!this.cached&&file)try{const saved=JSON.parse(await fs.readFile(file,'utf8'));const data=parseSoybeanOilSupply(saved.data?.rawRecords,year,now);if(saved.commodityCode==='4232000'&&data&&Number.isFinite(Date.parse(saved.verifiedAt))&&Date.parse(saved.verifiedAt)<=now.getTime())this.cached={commodityCode:'4232000',verifiedAt:saved.verifiedAt,data};}catch{}
  const prior=this.cached&&parseSoybeanOilSupply(this.cached.data?.rawRecords,year,now)?this.cached:null;
  const fallback=(reason:string,failed=false):SoybeanOilPsdResult=>({success:!!prior,status:prior?'last-verified':'unavailable',checkedAt,verifiedAt:prior?.verifiedAt,marketYear:prior?.data.marketYear,data:prior?.data,message:reason,refreshFailed:failed});
  if(!force&&prior&&now.getTime()-this.lastCheck<(this.failed?60000:6*3600000))return fallback('Previously verified USDA records',this.failed);
  const key=this.options.key?.()??(process.env.USDA_FAS_API_KEY||process.env.USDA_API_KEY||'').trim();let error='USDA API key unavailable';
  try{if(!key)throw Error(error);const r=await(this.options.fetcher||fetch)(`https://api.fas.usda.gov/api/psd/commodity/4232000/world/year/${year}`,{headers:{Accept:'application/json',API_KEY:key,'x-api-key':key},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('USDA HTTP '+r.status);const data=parseSoybeanOilSupply(await r.json(),year,now);if(!data)throw Error('Invalid oil world identity, period, units or balance');const saved={commodityCode:'4232000',verifiedAt:checkedAt,data};this.cached=saved;this.lastCheck=now.getTime();this.failed=false;if(file){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(saved,null,2));await fs.rename(temp,file);await fs.writeFile(path.join(path.dirname(file),`usda_world_verified_soybean-oil_${year}.json`),JSON.stringify({...saved,commodity:'soybean-oil',sourceUrl:`https://api.fas.usda.gov/api/psd/commodity/4232000/world/year/${year}`,observationStatus:'as-reported'},null,2));}return {success:true,status:'live-verified',checkedAt,verifiedAt:checkedAt,marketYear:String(year),data};}
  catch(e){error=(e as Error).message;this.lastCheck=now.getTime();this.failed=true;return fallback(error,true);}
 }
}
const service=new SoybeanOilWorldPsdService();export const fetchSoybeanOilWorldPsd=(force=false)=>service.get(force);
export const _verifyUsdaSoybeanOilWorldRecords=parseSoybeanOilSupply;
