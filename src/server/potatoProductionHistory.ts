import fs from 'node:fs';
import path from 'node:path';
import { IMPORTED_POTATO_PRODUCTION } from '../data/potatoProductionHistory.ts';
import { fetchOfficialPotatoEurostat, type OfficialPotatoEurostatRecord } from './officialPotatoEurostatService.ts';
export type PotatoYear={year:string;productionMMT:number;status:string;sourceUrl:string;unit:string;coverage:string[];provenance:string};
export type PotatoHistory={version:1;years:PotatoYear[];importedOriginal:PotatoYear[];lastCheckedAt?:string;lastError?:string};
const file=()=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history','potato-production.json');
export function loadPotatoProductionHistory():PotatoHistory {
  if(!fs.existsSync(file()))return {version:1,years:IMPORTED_POTATO_PRODUCTION.map(p=>({...p})),importedOriginal:IMPORTED_POTATO_PRODUCTION};
  const saved=JSON.parse(fs.readFileSync(file(),'utf8'));
  if(saved.version!==1||!Array.isArray(saved.years)||!saved.years.every(validYear))throw Error('Unreadable saved potato history; original file retained');
  return saved;
}
const validYear=(p:PotatoYear)=>/^20\d{2}$/.test(p.year)&&Number(p.year)<=new Date().getUTCFullYear()&&Number.isFinite(p.productionMMT)&&p.productionMMT>0&&p.productionMMT<200&&p.unit==='MMT'&&p.coverage?.join(',')==='DE,FR,NL,DK';
export function mergePotatoProduction(history:PotatoHistory,records:OfficialPotatoEurostatRecord[]):PotatoHistory {
  const years=new Map(history.years.map(p=>[p.year,p]));
  for(const r of records){
    const p:PotatoYear={year:r.harvestYear,productionMMT:r.productionMMT,status:r.isEstimateOrProvisional?'Estimate':'Actual',sourceUrl:'https://ec.europa.eu/eurostat/databrowser/view/'+r.dataset+'/default/table?lang=en',unit:'MMT',coverage:r.coverage,provenance:'source-verified'};
    if(!validYear(p))throw Error('Invalid or mixed-coverage official potato observation');
    years.set(p.year,p);
  }
  return {...history,years:[...years.values()].sort((a,b)=>a.year.localeCompare(b.year))};
}
export function savePotatoProductionHistory(history:PotatoHistory){fs.mkdirSync(path.dirname(file()),{recursive:true});const temp=file()+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(history,null,2));fs.renameSync(temp,file());}
export async function refreshPotatoProductionHistory():Promise<PotatoHistory>{
  let history=loadPotatoProductionHistory();
  try{
    const result=await fetchOfficialPotatoEurostat(true);
    if(result.success&&result.data){history=mergePotatoProduction(history,result.history||[result.data]);history.lastError=undefined;}
    else history.lastError=result.message||'Official source unavailable';
  }catch(e){history.lastError=String((e as Error).message);}
  history.lastCheckedAt=new Date().toISOString();savePotatoProductionHistory(history);return history;
}
export function potatoProductionPayload(history=loadPotatoProductionHistory()){
  return {success:true,dataStatus:history.lastError?'last-verified':'saved-history',data:{years:history.years,unit:'MMT',coverage:['DE','FR','NL','DK'],summary:'독일·프랑스·네덜란드·덴마크 원료감자 생산량. 전분 가격 아님.'},diagnostics:{lastCheckedAt:history.lastCheckedAt,lastError:history.lastError}};
}
