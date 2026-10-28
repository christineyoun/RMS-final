/** Closed price-observation grammar, not numeric bag-of-words entailment.
 * Each complete sentence must match a frame; every dated quantity binds to the
 * same verified benchmark and scope. No causal/advisory suffix is accepted. */
import type {AnalysisFact} from './analysisEvidence.ts';
type Quote={value:number;unit:string};
const amount='[0-9]+(?:\\.[0-9]+)?';
const quantity=new RegExp(`톤당\\s*(${amount})\\s*(달러|미달러|USD)|(${amount})\\s*(USD\\s+per\\s+(?:metric\\s+ton(?:ne)?|tonne)|USD/metric ton(?:ne)?|USD/tonne|미달러/톤|달러/톤|USD/MT|USD/t|MYR/MT|US¢/bu|US¢/lb)`,'g');
function prices(text:string){const values:Quote[]=[];const skeleton=text.replace(quantity,(_all,per,currency,value,unit)=>{const q={value:Number(per??value),unit:per?'USD/MT':String(unit).replace(/^USD\s+per\s+(?:metric\s+ton(?:ne)?|tonne)$|^USD\/metric ton(?:ne)?$|^USD\/tonne$|^USD\/t$|^(?:미달러|달러)\/톤$/,'USD/MT')};values.push(q);return 'Q'+(values.length-1);});return {values,skeleton};}
function normalized(text:string){
 let s=text.normalize('NFKC').replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,x=>x.replaceAll(',',''))
  .replace(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/g,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
 const year=/\b(20\d{2})-\d{2}-\d{2}\b/.exec(s)?.[1];
 if(year)s=s.replace(/(\d{1,2})월\s*(\d{1,2})일/g,(_,m,d)=>`${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
 return s.replace(/\s+/g,' ').trim();
}
function identity(label:string,f:AnalysisFact){
 const key=f.measure?.benchmark,l=label.trim();
 const patterns:Record<string,[string,RegExp]>={
  'USW:SRW':['wheat',/^(?:(?:U\.S\. Wheat Associates|미국소맥협회) 보고서에서 )?(?:미국 )?SRW (?:12월물 |December )?선물 (?:관측치|관측가|관측|가격)$/],
  'CBOT:ZC=F':['corn',/^CBOT 옥수수 선물(?:\(ZC=F\))? 일봉 가격$/],
  'CBOT:ZS=F':['soybean',/^CBOT 대두(?:\(ZS=F\))? 선물 일봉 가격$/],
  'CBOT:ZL=F':['soybean-oil',/^CBOT 대두유(?:\(ZL=F\))? 선물 일봉 가격$/],
  'palm-cpo':['palm-oil',/^(?:쿠알라룸푸르 FCPOc1 |말레이시아 )?CPO (?:선물 )?종가$/],
  'palm-olein':['palm-oil',/^(?:부르사 말레이시아 FPOLc1 )?RBD (?:Olein|팜올레인) (?:선물 )?종가$/],
  'TTSA:TS':['tapioca-starch',/^(?:(?:태국타피오카전분협회\(TTSA\)|TTSA)의? )?(?:FOB (?:Bangkok|방콕) 기준 )?타피오카전분 공식 주간 (?:고시 가격|관측)$/]
 };
 const spec=key&&patterns[key];return !!spec&&f.commodity===spec[0]&&spec[1].test(l)&&f.measure?.metric==='price'&&f.measure.valueKind==='actual'&&
  (key!=='USW:SRW'||!/(?:12월물|December)/.test(l)||f.measure.scope==='USW-weekly-SRW-contract:December');
}
function same(q:Quote,p:Quote){return q.unit===p.unit&&q.value===p.value;}
function sameSeries(a:AnalysisFact,b:AnalysisFact){
 if(a.sourceUrl===b.sourceUrl)return true;
 // USW publishes each week's same-contract observation in a separate dated
 // PDF. Validate that series identity, rather than requiring identical URLs.
 const usw=(f:AnalysisFact)=>f.measure?.benchmark==='USW:SRW'&&f.sourceUrl===`https://uswheat.org/wp-content/uploads/${f.observedAt.slice(0,4)}/${f.observedAt.slice(5,7)}/PR-${f.observedAt.slice(2).replaceAll('-','')}.pdf`;
 return usw(a)&&usw(b)&&a.sourceTitle===b.sourceTitle;
}
function matchesObservation(f:AnalysisFact,date:string,quotes:Quote[]){
 if(f.observedAt!==date||f.comparison||!f.measure||f.measure.metric!=='price'||f.measure.valueKind!=='actual')return false;
 const supported=[{value:f.measure.value,unit:f.measure.unit},...prices(normalized(f.text)).values];
 // Alternate native units must be explicit in the SAME dated source record;
 // no newly calculated conversion or value borrowed from another observation.
 return quotes.length>0&&quotes.every(q=>supported.some(p=>same(q,p)));
}
function interval(f:AnalysisFact){
 const c=f.comparison,m=f.measure;if(!c||!m||m.metric!=='price'||m.valueKind!=='actual'||c.metric!=='price')return null;
 const r=/^(20\d{2}-\d{2}-\d{2}) 대비 (20\d{2}-\d{2}-\d{2}).*?관측값: ([0-9.]+) → ([0-9.]+) (USD\/MT|MYR\/MT), 변화 (-?[0-9.]+)%/.exec(f.text);
 if(!r||!c.baselineId.endsWith(r[1])||!c.currentId.endsWith(r[2])||f.observedAt!==r[2]||m.unit!==r[5]||m.value!==Number(r[4])||c.pct!==Number(r[6]))return null;
 const a=Number(r[3]),b=Number(r[4]);if(a<=0||Number(((b-a)/a*100).toFixed(2))!==c.pct||c.direction!==(b>a?'increase':b<a?'decrease':'unchanged'))return null;
 return {a:r[1],b:r[2],x:{value:a,unit:r[5]},y:{value:b,unit:r[5]},pct:c.pct};
}
export function supportedPriceStatement(text:string,refs:AnalysisFact[]):string[]|null {
 if(/\b[DPQ]\d+\b/.test(text))return null;
 const dates:string[]=[],percentages:number[]=[];
 let s=normalized(text).replace(/20\d{2}-\d{2}-\d{2}/g,d=>{dates.push(d);return 'D'+(dates.length-1);});
 const q=prices(s);s=q.skeleton.replace(/(-?[0-9]+(?:\.[0-9]+)?)%/g,(_,v)=>{percentages.push(Number(v));return 'P'+(percentages.length-1);});
 if(!q.values.length||q.values.some(v=>!Number.isFinite(v.value)))return null;
 const single=/^D0 기준 (.+?)(?:은|는|이|가)? Q0(?:\s*\(Q1\))?(?:로|를|으로)? (?:기록되었습니다|기록했습니다|관측되었습니다|확인되었습니다)\.$/.exec(s)
  ||/^(.+?)(?:은|는) D0 Q0를 기록했습니다\.$/.exec(s);
 if(single&&dates.length===1&&!percentages.length&&q.values.length<=2){const f=refs.find(f=>identity(single[1],f)&&matchesObservation(f,dates[0],q.values));if(f)return [f.id];}
 // Two endpoints; an explicit comparison requires same source, benchmark,
 // metric, scope, unit and kind. Unknown wording fails instead of stripping it.
 const forward=/^(.+?)(?:은|는) D0 Q0(?:\(Q1\))?에서 D1 Q(?:1|2)(?:\(Q3\))?로 관측되었습니다\.$/.exec(s);
 const reverse=/^D0 기준 (.+?)(?:은|는|이|가)? Q0를 기록하여 D1의 Q1 대비 낮은 수준을 나타냈습니다\.$/.exec(s);
 if((forward||reverse)&&dates.length===2&&!percentages.length){
  const label=(forward||reverse)![1],size=forward&&q.values.length===4?2:1;
  if(q.values.length!==size*2)return null;
  for(const f of refs)for(const g of refs){if(!identity(label,f)||!identity(label,g)||!matchesObservation(f,dates[0],q.values.slice(0,size))||!matchesObservation(g,dates[1],q.values.slice(size))||!f.measure||!g.measure||!sameSeries(f,g)||['scope','benchmark','unit'].some(k=>(f.measure as any)[k]!== (g.measure as any)[k]))continue;
   if(reverse&&f.measure.value>=g.measure.value)continue;return [f.id,g.id];}
 }
 const change=/^D0 기준 (.+?)(?:은|는|이|가)? Q0(?:\(Q1\))?로 관측되었으며, D1 관측값\(Q(?:1|2)\) 대비 P0 (상승|하락)하였습니다\.$/.exec(s);
 const pct=/^D0 기준 (.+?)(?:은|는|이|가)? Q0를 기록하였으며, D1 대비 P0 (상승|하락)했습니다\.$/.exec(s);
 if((change||pct)&&dates.length===2&&percentages.length===1){
  const match=(change||pct)!,label=match[1],dir=match[2];
  for(const f of refs){const v=interval(f);if(!v||!identity(label,f)||v.a!==dates[1]||v.b!==dates[0]||!same(q.values[0],v.y)||percentages[0]!==Math.abs(v.pct)||((dir==='상승')!==(v.pct>0)))continue;
   if(v.pct===0)continue;
   let alternate:AnalysisFact|undefined;
   if(change){if(q.values.length<2||!same(q.values.at(-1)!,v.x))continue;if(q.values.length===3){alternate=refs.find(g=>identity(label,g)&&matchesObservation(g,dates[0],q.values.slice(0,2)));if(!alternate)continue;}}
   else if(q.values.length!==1)continue;
   return alternate?[f.id,alternate.id]:[f.id];
  }
 }
 return null;
}
