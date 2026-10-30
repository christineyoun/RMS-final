/** Atomic examples for the generator, never exemptions from validation.
 * All returned expressions have already passed the SAME production validators.
 * These are not a canned report or asserted new market conclusions. */
import type {AnalysisFact} from './analysisEvidence.ts';
import type {AnalysisEvidence} from './analysisEvidence.ts';
import {validateReportedFact} from './analysisReportedFact.ts';
import {validateConditionalReasoning} from './analysisReasoning.ts';
import {factClaimContext} from './analysisClaimSupport.ts';
import {sourcePropositions} from './analysisSourcePropositions.ts';
export function verifiedKoreanExpressions(f:AnalysisFact){
 const m=f.measure,world=m?.scope.startsWith('world:')?'세계 ':'',label=world+f.topic;
 const facts:string[]=[],actions:string[]=[],scenarios:string[]=[];
 if(m?.valueKind==='forecast')facts.push(`${label} ${m.metric} 전망은 연간 전망치입니다.`);
 const priceLabels:Record<string,string>={'palm-cpo':'말레이시아 CPO 선물 종가','palm-olein':'RBD 팜올레인 선물 종가','CBOT:ZC=F':'CBOT 옥수수 선물 일봉 가격','CBOT:ZS=F':'CBOT 대두 선물 일봉 가격','CBOT:ZL=F':'CBOT 대두유 선물 일봉 가격','USW:SRW':'미국 SRW 선물 관측가','TTSA:TS':'TTSA FOB 방콕 기준 타피오카전분 공식 주간 고시 가격'};
 if(f.comparison?.metric==='price'&&priceLabels[m?.benchmark||'']){
  const direction={increase:'상승했습니다',decrease:'하락했습니다',unchanged:'동일한 수준입니다'}[f.comparison.direction];
  facts.push(`확인된 두 관측 사이 ${priceLabels[m!.benchmark]}는 ${direction}.`);
 }
 if(m?.metric==='price')actions.push(`${f.topic} 공표가격과 공급사 견적 비교`);
 else if(m?.valueKind==='forecast')actions.push(`${label} ${m.metric} 전망과 공급사 오퍼 비교`);
 if(m?.valueKind==='forecast'&&['생산','소비','수출'].includes(m.metric)){
  for(const direction of ['상향','하향']){
   const up=m.metric==='생산'?direction==='하향':direction==='상향';
   scenarios.push(`향후 ${label} ${m.metric} 전망이 ${direction}되면 선물가격 ${up?'상승':'하락'} 압력이 생길 수 있습니다.`);
  }
 }
 const checked=(text:string,kind:'conditional'|'recommendation')=>factClaimContext(f).aspects.some(aspect=>!validateConditionalReasoning(text,[f],{kind,support:[{evidenceId:f.id,aspect}]}).issues.length);
 const source=sourcePropositions(f);
 const deskActions=[...actions.filter(text=>Array.from(text).length<=40&&checked(text,'recommendation')),...source.filter(p=>p.role==='action'&&Array.from(p.text).length<=40).map(p=>p.text)];
 return {facts:[...facts.filter(text=>!validateReportedFact(text,[f]).issues.length),...source.filter(p=>p.role==='fact').map(p=>p.text)],
  deskActions,
  actions:[...actions.filter(text=>Array.from(text).length<=40&&checked(text,'recommendation')),...source.filter(p=>p.role==='action').map(p=>p.text)],
  reportedDrivers:source.filter(p=>p.role==='bullish'||p.role==='bearish'),
  scenarios:scenarios.filter(text=>Array.from(text).length<=70&&checked(text,'conditional'))};
}
export function analysisGenerationReadiness(evidence:AnalysisEvidence){
 const records=evidence.facts.map(f=>({id:f.id,period:f.observedAt,examples:verifiedKoreanExpressions(f)}));
 const drivers=records.flatMap(r=>[
  ...r.examples.reportedDrivers.map(p=>({evidenceId:r.id,period:r.period,kind:'reported-in-original-period',direction:p.role,text:p.text})),
  ...r.examples.scenarios.map(text=>({evidenceId:r.id,period:r.period,kind:'hypothetical-not-an-observed-driver',direction:/상승/.test(text)?'bullish':'bearish',text})),
 ]);
 const missing:string[]=[];
 if(evidence.facts.length<2)missing.push('two-independent-verified-records');
 for(const direction of ['bullish','bearish'])if(!drivers.some(d=>d.direction===direction))missing.push(direction+'-driver');
 if(!records.some(r=>r.examples.deskActions.length))missing.push('source-scoped-procurement-action');
 return {feasible:!missing.length,missing,drivers,
  rule:'Price observations are not supply/demand drivers. No world forecast is required for a commodity with verified publisher-specific drivers.',
  nextEvidence:missing.length?`Acquire original ${evidence.commodity} evidence for ${missing.join(', ')}; retain previous content and do not spend on an infeasible brief.`:null};
}
