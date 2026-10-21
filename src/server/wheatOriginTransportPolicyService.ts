/**
 * Wheat Origin Radar — strictly sourced U.S. logistics and policy screening.
 * USDA/AMS Open Ag Transport API (non-Gemini, U.S.-only freight benchmark).
 * Federal Register official publications (U.S.-only notice to REVIEW, not legal advice).
 * No unsupported inference about other exporting origins, Korean freight rates,
 * port operating status, or the absence of export restrictions.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OriginRadarResponse } from './originRadarService.ts';

type Freight = { kind:'freight'; observedOn:string; pnwToJapan:number; gulfToJapan:number | null; relativeChangePct:number | null; watch:boolean; url:string };
type Policy = { kind:'policy'; publishedOn:string; title:string; url:string };
type Evidence = {version:1; checkedDay:string; checkedAt:string; freight:Freight|null; policy:Policy|null};

const FREIGHT_URL='https://agtransport.usda.gov/resource/8uye-ieij.json';
const FREIGHT_SOURCE='https://agtransport.usda.gov/d/8uye-ieij';
const POLICY_SOURCE='https://www.federalregister.gov/';
const CACHE_DIR=process.env.RMS_ORIGIN_CACHE_DIR || path.join(process.cwd(),'.rms-origin-verified');
const CACHE_FILE=path.join(CACHE_DIR,'wheat-transport-policy-v1.json');
const MS_DAY=86400000;

function kstDay(now:Date):string {
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const f=(k:string)=>p.find(x=>x.type===k)?.value||'';
  return `${f('year')}-${f('month')}-${f('day')}`;
}
function isoDay(v:unknown):string|null {
  if(typeof v!=='string')return null;
  const day=v.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1];
  if(!day)return null;
  const parsed=Date.parse(`${day}T12:00:00Z`);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==day)return null;
  return day;
}
function number(v:unknown):number|null {
  const n=typeof v==='number'?v:(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v.trim())?Number(v):NaN);
  return Number.isFinite(n)&&n>0&&n<400?n:null;
}
function ageDays(day:string, now:Date):number {
  const stamp=Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(stamp)?(now.getTime()-stamp)/MS_DAY:Infinity;
}
function median(values:number[]):number|null {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const k=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[k]:(sorted[k-1]+sorted[k])/2;
}

/** Reject stale observations, unit-mismatches, and samples without recent context. */
export function parseUsdaGrainFreight(raw:unknown, now:Date=new Date()):Freight|null {
  if(!Array.isArray(raw))return null;
  const observations=raw.map(x=>{
    if(!x||typeof x!=='object')return null;
    const r=x as Record<string,unknown>;
    const day=isoDay(r.date);
    const pnw=number(r.pacific_vessel);
    const gulf=number(r.gulf_vessel);
    if(!day||pnw===null)return null;
    const age=ageDays(day,now);
    if(age < -1 || age>120)return null;
    return {day,pnw,gulf};
  }).filter((r):r is {day:string;pnw:number;gulf:number|null}=>r!==null)
    .sort((a,b)=>b.day.localeCompare(a.day));
  // USDA publishes weekly; stale rows are NOT a current shipping indicator.
  const latest=observations[0];
  if(!latest||ageDays(latest.day,now)>21)return null;
  const earlier=observations.filter(r=>r.day<latest.day&&ageDays(r.day,now)<=100);
  const reference=median(earlier.slice(0,10).map(x=>x.pnw));
  const diff=reference===null?null:(latest.pnw/reference-1)*100;
  // A screening trigger only: no claim that terminals are closed or shipping is disrupted.
  const watch=diff!==null&&earlier.length>=4&&diff>=25&&latest.pnw-reference>=5;
  return {kind:'freight',observedOn:latest.day,pnwToJapan:latest.pnw,
    gulfToJapan:latest.gulf,relativeChangePct:diff===null?null:Math.round(diff),watch,url:FREIGHT_SOURCE};
}

/** A relevant U.S. Federal Register NOTICE is a review signal, not proof of restrictions. */
export function parseOfficialWheatPolicy(raw:unknown,now:Date=new Date()):Policy|null {
  if(!raw||typeof raw!=='object'||!Array.isArray((raw as any).results))return null;
  for(const item of (raw as any).results as unknown[]){
    if(!item||typeof item!=='object')continue;
    const r=item as Record<string,unknown>;
    const title=typeof r.title==='string'?r.title.trim():'';
    const abstract=typeof r.abstract==='string'?r.abstract.trim():'';
    const day=isoDay(r.publication_date);
    const url=typeof r.html_url==='string'?r.html_url:'';
    if(!day||ageDays(day,now)>30||ageDays(day,now)<-1)continue;
    if(!/^https:\/\/www\.federalregister\.gov\/documents\/\d{4}\/\d{2}\/\d{2}\//.test(url))continue;
    if(!title || title.length>250)continue;
    const body=`${title} ${abstract}`.toLowerCase();
    if(!/\bwheat\b/.test(body) || !/\bexport(?:s|ing)?\b/.test(body))continue;
    if(!/\b(?:restrict(?:ion|ions|ed|ing)?|prohibit(?:ion|ed)?|ban|embargo|license|licensing|sanction|quota)\b/.test(body))continue;
    // Notice requires human review; no automatic legal-risk conclusion.
    return {kind:'policy',title,publishedOn:day,url};
  }
  return null;
}

function load():Evidence|null {
  try{
    const x=JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
    return x?.version===1&&typeof x.checkedDay==='string'&&typeof x.checkedAt==='string'?x as Evidence:null;
  }catch{return null;}
}
function save(record:Evidence):void {
  try{
    fs.mkdirSync(CACHE_DIR,{recursive:true,mode:0o700});
    const temp=`${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(record,null,2),{mode:0o600});
    fs.renameSync(temp,CACHE_FILE);
  }catch(e){console.warn('[Wheat Transport] Cache write failed:',String(e).slice(0,150));}
}
async function getJson(url:string,headers?:Record<string,string>):Promise<unknown> {
  const res=await fetch(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function validCached(e:Evidence,now:Date):Evidence {
  // A successful snapshot does not make stale source data current.
  return {...e,
    freight:e.freight&&ageDays(e.freight.observedOn,now)<=21?e.freight:null,
    policy:e.policy&&ageDays(e.policy.publishedOn,now)<=30?e.policy:null};
}

export class WheatOriginTransportPolicyService {
  private dayCache:Evidence|null=null;
  private running:Promise<Evidence>|null=null;
  private async collect():Promise<Evidence>{
    const now=new Date();const today=kstDay(now);
    if(this.dayCache?.checkedDay===today)return validCached(this.dayCache,now);
    const saved=load();
    if(saved?.checkedDay===today){this.dayCache=saved;return validCached(saved,now);}
    const weekday=new Date(`${today}T03:00:00Z`).getUTCDay();
    if(weekday===0||weekday===6)return saved?validCached(saved,now):{version:1,checkedDay:today,checkedAt:now.toISOString(),freight:null,policy:null};
    if(this.running)return this.running;
    this.running=(async()=>{
      const usda=new URL(FREIGHT_URL);
      usda.searchParams.set('$order','date DESC');
      usda.searchParams.set('$limit','16');
      const policy=new URL('https://www.federalregister.gov/api/v1/documents.json');
      policy.searchParams.set('conditions[term]','wheat export restriction');
      policy.searchParams.set('conditions[publication_date][gte]',new Date(now.getTime()-30*MS_DAY).toISOString().slice(0,10));
      policy.searchParams.set('order','newest');
      policy.searchParams.set('per_page','20');
      const [freightResult,policyResult]=await Promise.allSettled([
        getJson(usda.toString()),getJson(policy.toString()),
      ]);
      const freshFreight=freightResult.status==='fulfilled'?parseUsdaGrainFreight(freightResult.value,now):null;
      const freshPolicy=policyResult.status==='fulfilled'?parseOfficialWheatPolicy(policyResult.value,now):null;
      // Fail closed: never carry a stale unverified signal into a new day.
      const prev=saved?validCached(saved,now):null;
      const record:Evidence={version:1,checkedDay:today,checkedAt:now.toISOString(),
        freight:freshFreight??prev?.freight??null,
        policy:freshPolicy??(policyResult.status==='rejected'?prev?.policy??null:null)};
      save(record);this.dayCache=record;return record;
    })();
    try{return await this.running;}finally{this.running=null;}
  }
  async enrich(input:OriginRadarResponse):Promise<OriginRadarResponse>{
    const record=await this.collect();
    return {...input,origins:input.origins.map(origin=>{
      if(origin.originKey!=='usa')return origin;
      const newInfo:string[]=[];
      if(record.freight){
        const amount=record.freight.pnwToJapan.toFixed(1);
        newInfo.push(`물류(미 PNW→일본 참고운임): $${amount}/MT`);
      }
      if(record.policy){newInfo.push('통상: 미국 밀 수출 관련 공식 공고 확인 필요');}
      const flagged=record.freight?.watch===true||Boolean(record.policy);
      return {...origin,
        logisticsInsight:newInfo.join(' · '),
        logisticsSourceDate:record.freight?.observedOn,
        logisticsSourceUrl:record.freight?.url,
        policySourceUrl:record.policy?.url,
        policySourceDate:record.policy?.publishedOn,
        status:flagged?'모니터링' as const:origin.status,
        statusColor:flagged?'yellow':origin.statusColor,
      };
    })};
  }
}
export const wheatOriginTransportPolicyService=new WheatOriginTransportPolicyService();
