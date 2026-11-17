/** Thailand fresh-root crop survey. The TTSA FOB price and exports are separate series. */
export const THAI_CASSAVA_SURVEYS='https://ttta-tapioca.org/การสำรวจผลผลิต/?lang=en';
export type ThaiCassavaMetrics={
  reportingYear:string;
  productionTonnes:number;
  harvestedAreaRai?:number;
  yieldTonnesPerRai?:number;
};
export type ThaiCassavaSupply={
  scope:'thailand-cassava';
  current:ThaiCassavaMetrics;
  previous?:ThaiCassavaMetrics;
  estimateStatus:'forecast'|'estimated'|'actual';
  source:{name:string;url:string;reportDate:string;retrievedAt:string;sha256:string};
};

export function cassavaCropStart(value:unknown):number|null{
  if(typeof value!=='string')return null;
  const match=/^(20\d{2})\/(?:20)?(\d{2})$/.exec(value);
  return match&&((Number(match[1])+1)%100===Number(match[2]))?Number(match[1]):null;
}
const positive=(v:unknown,max=100_000_000):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<max;

/** Keep independently reported fields only. Never derive a missing area or yield. */
export function cassavaSurveyMetrics(reportingYear:string,productionTonnes:number,area:unknown,yieldPerRai:unknown):ThaiCassavaMetrics{
  const v:ThaiCassavaMetrics={reportingYear,productionTonnes};
  if(positive(area))v.harvestedAreaRai=area;
  if(positive(yieldPerRai,25))v.yieldTonnesPerRai=yieldPerRai;
  // If both supplementary values conflict with the same row's production,
  // keep the separately validated production, not an inferred correction.
  if(v.harvestedAreaRai&&v.yieldTonnesPerRai&&Math.abs(productionTonnes/v.harvestedAreaRai-v.yieldTonnesPerRai)>0.005){
    delete v.harvestedAreaRai;delete v.yieldTonnesPerRai;
  }
  return v;
}

function officialThaiSurveyUrl(value:unknown):value is string{
  if(typeof value!=='string')return false;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
    return u.href===new URL(THAI_CASSAVA_SURVEYS).href||
      (['www.thaitapiocastarch.org','thaitapiocastarch.org'].includes(u.hostname)&&
        !u.search&&/^\/assets\/upload\/doc\/pdf\/[^/]+\.pdf$/i.test(u.pathname));
  }catch{return false;}
}

/** Accept a saved crop packet only, not the newest exchange quote or an ASEAN estimate. */
export function readThaiCassavaSupply(packet:any,now=new Date()):ThaiCassavaSupply|null{
  if(packet?.scope!=='thailand-cassava'||!['forecast','estimated','actual'].includes(packet.estimateStatus))return null;
  const s=packet.source;
  if(!officialThaiSurveyUrl(s?.url)||typeof s?.name!=='string'||!s.name.trim()||
    !/^[a-f0-9]{64}$/.test(s.sha256)||typeof s.reportDate!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(s.reportDate)||
    (s.reportDate.length===10&&new Date(s.reportDate).toISOString().slice(0,10)!==s.reportDate)||
    typeof s.retrievedAt!=='string'||!Number.isFinite(Date.parse(s.retrievedAt))||Date.parse(s.retrievedAt)>+now||
    s.reportDate>s.retrievedAt.slice(0,s.reportDate.length))return null;
  const current=packet.current,start=cassavaCropStart(current?.reportingYear);
  if(start===null||start>Number(s.reportDate.slice(0,4))+1||!positive(current?.productionTonnes))return null;
  const previous=packet.previous;
  return {scope:'thailand-cassava',estimateStatus:packet.estimateStatus,
    current:cassavaSurveyMetrics(current.reportingYear,current.productionTonnes,current.harvestedAreaRai,current.yieldTonnesPerRai),
    ...(cassavaCropStart(previous?.reportingYear)===start-1&&positive(previous?.productionTonnes)?{
      previous:cassavaSurveyMetrics(previous.reportingYear,previous.productionTonnes,previous.harvestedAreaRai,previous.yieldTonnesPerRai)
    }:{}),
    source:{name:s.name,url:s.url,reportDate:s.reportDate,retrievedAt:s.retrievedAt,sha256:s.sha256}};
}
