/** Closed grammatical projections of verified observations/attributed reports.
 * Unknown prose fails closed; a citation alone never authorizes a proposition. */
import {compareAnalysisObservations,type AnalysisFact} from './analysisEvidence.ts';
import {factualLanguage} from './analysisStatementLanguage.ts';
import {supportedPriceStatement} from './analysisPriceStatements.ts';
const number='([0-9]+(?:\\.[0-9]+)?)';
const date='(20[0-9]{2}-[0-9]{2}-[0-9]{2})';
const identity=(label:string,f:AnalysisFact)=>{
 const b=f.measure?.benchmark;
 if(b==='TTSA:TS'&&f.commodity!=='tapioca-starch'||['palm-cpo','palm-olein'].includes(b||'')&&f.commodity!=='palm-oil')return false;
 if(b==='TTSA:TS')return /^(?:TTSA(?:의)?\s*(?:공식\s*)?(?:주간\s*)?(?:벤치마크|기준가격|타피오카전분 가격)|FOB 방콕 타피오카전분 가격)$/.test(label);
 if(b==='palm-cpo')return /^(?:말레이시아\s*)?CPO 선물 (?:종가|가격)$/.test(label);
 if(b==='palm-olein')return /^RBD (?:팜올레인|Olein) 선물 (?:종가|가격)$/.test(label);
 return false;
};
function observedComparison(text:string,refs:AnalysisFact[]):string[]|null {
 let value=factualLanguage(text);
 // An omitted year may inherit ONLY the explicit year in this same statement.
 const year=/\b(20\d{2})-\d{2}-\d{2}/.exec(value)?.[1];
 if(year)value=value.replace(/(?<!\d-)(\d{1,2})월\s*(\d{1,2})일/g,(_,m,d)=>`${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
 const first=new RegExp('^(.+?) '+date+'(?:의)? '+number+'(USD/MT|MYR/MT)에서 '+date+'(?:의)? '+number+'(USD/MT|MYR/MT)(?:로|으로) (상승|하락|동일)[.]?$').exec(value);
 const second=new RegExp('^'+date+' 톤당 '+number+'USD를 기록했던 (.+?)(?:은|는) '+date+' '+number+'USD로 소폭 하향 조정되었습니다[.]?$').exec(value);
 let label:string,a:string,b:string,av:number,bv:number,unit:string,direction:string;
 if(first){[,label,a,,unit,b]=first;av=Number(first[3]);bv=Number(first[6]);if(first[4]!==first[7])return null;direction=first[8];}
 else if(second){a=second[1];av=Number(second[2]);label=second[3];b=second[4];bv=Number(second[5]);unit='USD/MT';direction='하락';}
 else return null;
 for(const f of refs)for(const g of refs){
  if(f.measure?.valueKind!=='actual'||g.measure?.valueKind!=='actual'||f.measure?.metric!=='price'||f.comparison||g.comparison||!identity(label,f)||!f.measure||!g.measure||f.observedAt!==a||g.observedAt!==b||f.measure.value!==av||g.measure.value!==bv||f.measure.unit!==unit)continue;
  const comparison=compareAnalysisObservations([f,g]);
  if(comparison&&comparison.comparison?.direction===({상승:'increase',하락:'decrease',동일:'unchanged'} as any)[direction])return [f.id,g.id];
 }
 return null;
}
function sameIntervalReport(text:string,refs:AnalysisFact[]):string[]|null {
 const value=factualLanguage(text);
 const pair=new RegExp('^(.+?)(?:은|는) '+date+' '+number+'(USD/MT|MYR/MT)에서 '+date+' '+number+'(USD/MT|MYR/MT)로 '+number+'% (상승|하락) 흐름을 보인 반면, (.+?)(?:은|는) 동일 기간 '+number+'(USD/MT|MYR/MT) 수준을 유지하였습니다[.]?$').exec(value);
 if(!pair)return null;
 const [,label,a,av,unit,b,bv,unit2,pct,dir,other,unchanged,otherUnit]=pair;
 if(unit!==unit2)return null;
 const candidates=refs.filter(f=>f.measure?.metric==='price'&&f.measure.valueKind==='actual'&&f.comparison?.metric==='price'&&f.comparison.baselineId.endsWith(a)&&f.comparison.currentId.endsWith(b)&&f.observedAt===b);
 const interval=(f:AnalysisFact)=>{
  const quantities=/관측값: ([0-9.]+) → ([0-9.]+) ([A-Za-z/]+), 변화 (-?[0-9.]+)%/.exec(f.text);
  if(!quantities||Number(quantities[2])!==f.measure?.value||quantities[3]!==f.measure.unit||Number(quantities[4])!==f.comparison?.pct)return null;
  const x=Number(quantities[1]),y=Number(quantities[2]);
  if(x<=0||Number(((y-x)/x*100).toFixed(2))!==f.comparison.pct||f.comparison.direction!==(y>x?'increase':y<x?'decrease':'unchanged'))return null;
  return {a:x,b:y};
 };
 for(const f of candidates){const v=interval(f);if(!v||!identity(label,f)||f.measure!.unit!==unit||v.a!==Number(av)||v.b!==Number(bv)||f.comparison!.pct!==Number(pct)||!f.comparison!.monotonic||f.comparison!.observationCount<3||f.comparison!.direction!==(dir==='상승'?'increase':'decrease'))continue;
  for(const g of candidates){const w=interval(g);if(w&&identity(other,g)&&g.measure!.unit===otherUnit&&w.a===w.b&&w.b===Number(unchanged)&&g.comparison!.direction==='unchanged')return [f.id,g.id];}
 }
 return null;
}
function translatedExportReport(text:string,refs:AnalysisFact[]):string[]|null {
 // Full anchored grammar: no extra causal/price/purchasing conclusion can hide
 // behind an exports observation. Keep the survey attribution and period.
 const claim=/^(?:화물\s*)?조사기관(?:의)?\s*(?:집계|추정)에 따르면[,]?\s*(말레이시아|미국|브라질)의?\s*(?:(20\d{2})년\s*)?(\d{1,2})월\s*(?:상반기|전반기|상반월)\s*(팜유|대두유|옥수수)\s*수출(?:량)?(?:은|는|이|가)?\s*(?:직전|이전|비교)\s*기간\s*대비\s*([\d.]+)%\s*(?:에서|~|–)\s*([\d.]+)%\s*증가(?:한 것으로|했다고)?\s*(?:집계됐습니다|추정됐습니다|보도됐습니다|전했습니다)[.]?$/.exec(text.trim());
 if(!claim)return null;
 for(const f of refs){
  const source=/According to cargo surveyors, (Malaysia|United States|Brazil)[’']s (palm oil|soybean oil|corn) exports for the first half of ([A-Za-z]+) increased by ([\d.]+)% to ([\d.]+)% compared to the previous period[.]/i.exec(f.text);
  if(!source||f.commodity!==({'palm oil':'palm-oil','soybean oil':'soybean-oil',corn:'corn'} as any)[source[2].toLowerCase()])continue;
  const country:Record<string,string>={malaysia:'말레이시아','united states':'미국',brazil:'브라질'},crop:Record<string,string>={'palm oil':'팜유','soybean oil':'대두유',corn:'옥수수'};
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  if(country[source[1].toLowerCase()]===claim[1]&&crop[source[2].toLowerCase()]===claim[4]&&months.findIndex(m=>m.toLowerCase()===source[3].toLowerCase())+1===Number(claim[3])&&(!claim[2]||f.observedAt.startsWith(claim[2]+'-'))&&Number(source[4])===Number(claim[5])&&Number(source[5])===Number(claim[6]))return [f.id];
 }
 return null;
}
export function supportedFactualProjection(text:string,refs:AnalysisFact[]):string[]|null {
 return supportedPriceStatement(text,refs)||sameIntervalReport(text,refs)||observedComparison(text,refs)||translatedExportReport(text,refs);
}
