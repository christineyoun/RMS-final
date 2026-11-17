export const TTSA_ANNUAL_EXPORTS='https://www.thaitapiocastarch.org/th/information/statistics/export_tapioca_products';

export type ThaiStarchExportYear={calendarYear:number;nativeTonnes:number;modifiedTonnes:number};
export type ThaiStarchExports={
  scope:'thailand-tapioca-starch-exports';unit:'tonnes';period:'calendar-year';
  current:ThaiStarchExportYear;previous?:ThaiStarchExportYear;
  source:{name:'TTSA';authority:'Thai Customs Department';url:string;retrievedAt:string;sha256:string};
};

export function validExportYear(value:unknown,asOf:Date):value is ThaiStarchExportYear {
  if(!value||typeof value!=='object')return false;
  const r=value as ThaiStarchExportYear;
  const volume=(v:number)=>Number.isSafeInteger(v)&&v>0;
  return Number.isInteger(r.calendarYear)&&r.calendarYear>=1900&&r.calendarYear<asOf.getUTCFullYear()&&
    volume(r.nativeTonnes)&&volume(r.modifiedTonnes);
}

export function readThaiStarchExports(value:unknown,now=new Date()):ThaiStarchExports|null {
  if(!value||typeof value!=='object')return null;
  const r=value as ThaiStarchExports,s=r.source;
  if(r.scope!=='thailand-tapioca-starch-exports'||r.unit!=='tonnes'||r.period!=='calendar-year'||
    s?.url!==TTSA_ANNUAL_EXPORTS||s.name!=='TTSA'||s.authority!=='Thai Customs Department'||
    typeof s.sha256!=='string'||!/^[0-9a-f]{64}$/.test(s.sha256)||
    typeof s.retrievedAt!=='string'||!Number.isFinite(Date.parse(s.retrievedAt))||Date.parse(s.retrievedAt)>+now||
    !validExportYear(r.current,new Date(s.retrievedAt)))return null;
  if(r.previous!==undefined&&(!validExportYear(r.previous,new Date(s.retrievedAt))||r.previous.calendarYear!==r.current.calendarYear-1))return null;
  return r;
}
