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
function reportedSoybeanParaphrase(text:string,refs:AnalysisFact[]):string[]|null{
 const planting=/^(?:(20\d{2})년 )?(\d{1,2})월 (\d{1,2})일 보도에 따르면 브라질 마토그로소의 (20\d{2}\/\d{2})년 대두 파종률은 약 ([\d.]+)%로 집계되어 5년 평균치인 약 ([\d.]+)%를 웃돌았습니다\.$/.exec(text);
 const combinedPlanting=/^브라질 마토그로소의 (20\d{2}\/\d{2})년 대두 파종률은 약 ([\d.]+)%로 5년 평균 ([\d.]+)%를 웃도는 진척을 나타냈으며 북부 일부의 건조 우려가 함께 보고되었습니다\.$/.exec(text);
 const offer=/^(?:한편 )?(\d{1,2})월 (\d{1,2})일 기준 (\d{1,2})월 선적 FOB 오퍼는 미국 뉴올리언스(?:가)? ([\d.]+) USD\/MT, 브라질 산투스(?:가)? ([\d.]+) USD\/MT로 (?:보도되었습니다|확인되었습니다)\.$/.exec(text);
 for(const f of refs){
  const c=f.referenceContext;if(f.commodity!=='soybean'||c?.receiptSha256!==f.recordSha256||!f.sourceUrl.startsWith('https://commodity-board.com/'))continue;
  const q=c.quote.replace(/[‐‑–—]/g,'-');
  if(combinedPlanting){
   const [,period,value,baseline]=combinedPlanting;
   const source=/Mato Grosso planting is reported at around ([\d.]+)% complete, ahead of its five-year average near ([\d.]+)%, though some northern areas complain about dryness\./.exec(q);
   if(source&&f.measure?.metric==='planting-progress'&&f.measure.valueKind==='actual'&&f.measure.unit==='%'&&f.measure.scope==='Brazil:Mato Grosso:'+period+':reported-planting'&&f.measure.value===Number(value)&&Number(value)>Number(baseline)&&Number(source[1])===Number(value)&&Number(source[2])===Number(baseline)&&f.text.includes(period+'년')&&f.text.includes('일부 북부 지역 건조 우려'))return [f.id];
  }
  if(planting){
   const [,explicitYear,month,day,period,value,baseline]=planting,year=explicitYear||f.observedAt.slice(0,4);
   if(f.observedAt!==year+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0')||f.measure?.metric!=='planting-progress'||f.measure.valueKind!=='actual'||f.measure.unit!=='%'||f.measure.scope!=='Brazil:Mato Grosso:'+period+':reported-planting'||f.measure.value!==Number(value)||Number(value)<=Number(baseline))continue;
   const source=/Mato Grosso planting is reported at around ([\d.]+)% complete, ahead of its five-year average near ([\d.]+)%/.exec(q);
   if(source&&Number(source[1])===Number(value)&&Number(source[2])===Number(baseline)&&f.text.includes(period+'년'))return [f.id];
  }
  if(offer){
   const [,month,day,shipment,us,br]=offer,year=f.observedAt.slice(0,4);
   if(f.observedAt!==year+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0')||f.measure?.metric!=='price'||f.measure.unit!=='USD/MT'||f.measure.valueKind!=='actual'||f.measure.value!==Number(us))continue;
   const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
   if(!f.measure.scope.startsWith('reported-'+months[Number(shipment)-1]?.slice(0,3)+year+'-US-NewOrleans-FOB-offer'))continue;
   const source=/As of ([A-Za-z]+) (\d+), US soybeans for ([A-Za-z]+) shipment were quoted at ([\d.]+) US-dollars per tonne FOB New Orleans, compared with ([\d.]+) US-dollars per tonne FOB Santos for Brazilian beans\./.exec(q);
   if(source&&months[Number(month)-1]===source[1]&&Number(day)===Number(source[2])&&months[Number(shipment)-1]===source[3]&&Number(us)===Number(source[4])&&Number(br)===Number(source[5]))return [f.id];
  }
 }
 return null;
}
function attributedSoybeanForecast(text:string,refs:AnalysisFact[]):string[]|null{
 const claim=/^미국 농무부 ERS 전망에서 (20\d{2}\/\d{2})년 미국 대두 생산 전망은 ([\d.]+) billion bushels로 제시되었습니다\.$/.exec(text);
 if(!claim)return null;
 const [,period,value]=claim;
 const f=refs.find(f=>f.commodity==='soybean'&&f.verification==='original-record'&&f.sourceUrl==='https://www.ers.usda.gov/topics/crops/soybeans-and-oil-crops/market-outlook'&&f.measure?.metric==='생산'&&f.measure.valueKind==='forecast'&&f.measure.scope==='US:'+period+':October2026-forecast'&&f.observedAt==='2026-10-15'&&f.measure.unit==='billion bushels'&&f.measure.value===Number(value)&&f.text.includes(period+'년 미국 대두 생산 전망 '+value+' billion bushels'));
 return f?[f.id]:null;
}
function officialPotatoStatistics(text:string,refs:AnalysisFact[]):string[]|null{
 const trade=/^Eurostat Comext 공식 무역 통계상 (20\d{2})년 (\d{1,2})월부터 (20\d{2})년 (\d{1,2})월까지 12개월간 EU27의 비EU 대상 완제품 감자전분\(CN 11081300\) 수출량은 ([\d,.]+)천 MT, 수입량은 ([\d,.]+)천 MT로 집계되었습니다\.$/.exec(text);
 const harvest=/^(?:한편 )?Eurostat의 (20\d{2})년 연간 통계에 따르면 독일, 프랑스, 네덜란드, 덴마크 4개국의 전체 감자 생산량은 ([\d,.]+)천 MT, 수확 면적은 ([\d,.]+)천 ha로 나타났습니다\.$/.exec(text);
 const num=(s:string)=>Number(s.replaceAll(',',''));
 for(const f of refs){
  if(f.commodity!=='potato-starch'||!f.measure)continue;
  if(trade){
   const [,y,m,y2,m2,exp,imp]=trade,start=y+'-'+m.padStart(2,'0'),end=y2+'-'+m2.padStart(2,'0');
   if(f.sourceUrl!=='https://ec.europa.eu/eurostat/databrowser/view/DS-045409/default/table?lang=en'||f.measure.benchmark!=='Eurostat:Comext:11081300'||f.measure.scope!=='EU27:extra-EU:CN11081300:'+start+'~'+end||f.observedAt!==end||f.measure.unit!=='천 MT'||f.measure.valueKind!=='actual'||f.measure.value!==num(exp)||(Number(y2)-Number(y))*12+Number(m2)-Number(m)+1!==12)continue;
   const original=/수출 ([\d.]+) 천 MT, 수입 ([\d.]+) 천 MT\./.exec(f.text);
   if(original&&Number(original[1])===num(exp)&&Number(original[2])===num(imp))return [f.id];
  }
  if(harvest){
   const [,year,production,area]=harvest;
   if(f.sourceUrl!=='https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en'||f.measure.benchmark!=='Eurostat:apro_cpnh1'||f.measure.scope!=='DE,FR,NL,DK:all-potatoes:'+year||f.measure.valueKind!=='proxy'||f.measure.unit!=='천 MT'||f.measure.value!==num(production)||f.observedAt!==year+'-12-31')continue;
   const original=/전체 감자\(종자용 포함\) 생산 ([\d.]+) 천 MT[\s\S]*?수확면적 ([\d.]+) 천 ha,/.exec(f.text);
   if(original&&Number(original[1])===num(production)&&Number(original[2])===num(area))return [f.id];
  }
 }
 return null;
}
export function supportedFactualProjection(text:string,refs:AnalysisFact[]):string[]|null {
 // Omitting a number is not a license to generalize the scope. This closed
 // Korean paraphrase describes ONLY the classification of a world annual
 // forecast, never adequacy, a revision, actual supply or a price consequence.
 const classified=/^세계 (소맥|옥수수|대두유|대두|팜유|설탕(?:\(원심분리당\))?|감자전분|타피오카전분) (생산|소비|수출|기말재고) 전망은 연간 전망치입니다\.$/.exec(factualLanguage(text));
 if(classified){
  const crop:Record<string,string>={소맥:'wheat',옥수수:'corn',대두:'soybean',대두유:'soybean-oil',팜유:'palm-oil',설탕:'sugar','설탕(원심분리당)':'sugar',감자전분:'potato-starch',타피오카전분:'tapioca-starch'};
  const f=refs.find(f=>f.commodity===crop[classified[1]]&&f.measure?.metric===classified[2]&&f.measure.valueKind==='forecast'&&/^world:20\d{2}\/20\d{2}$/.test(f.measure.scope)&&f.topic===classified[1]);
  if(f)return [f.id];
 }
 return supportedPriceStatement(text,refs)||sameIntervalReport(text,refs)||observedComparison(text,refs)||translatedExportReport(text,refs)||reportedSoybeanParaphrase(text,refs)||attributedSoybeanForecast(text,refs)||officialPotatoStatistics(text,refs);
}
