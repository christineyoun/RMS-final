/** Deterministic, opt-in composition from verified records; no provider, prompt,
 * journal or scheduling access. Every selected sentence uses existing validators. */
import type {AnalysisEvidence,AnalysisFact} from './analysisEvidence.ts';
import {validAnalysisFact} from './analysisEvidence.ts';
import {verifiedKoreanExpressions} from './analysisExpressionHints.ts';
import {sourcePropositions} from './analysisSourcePropositions.ts';
import {compileAnalysisSection} from './analysisSections.ts';
import {parseGroundedAnalysis,acceptedBriefEvidenceIssues} from './groundedAnalysisResponse.ts';
import {publishScheduledContent,readScheduledContent} from './scheduledContent.ts';
type GroundedAiAnalysis=ReturnType<typeof parseGroundedAnalysis>;
const MODEL='rms-evidence-composer-v1';
type Atom={text:string;evidenceIds:string[];concept:string;rank:number;role:'fact'|'bullish'|'bearish'|'action'|'desk'|'monitor'};
const chars=(s:string)=>Array.from(s.trim()).length;
const particle=(s:string)=>{const n=s.charCodeAt(s.length-1)-0xac00;return n>=0&&n<11172&&n%28?'은':'는';};
const priceLabels:Record<string,string>={'CBOT:ZS=F':'CBOT 대두 선물 일봉 가격','CBOT:ZC=F':'CBOT 옥수수 선물 일봉 가격','CBOT:ZL=F':'CBOT 대두유 선물 일봉 가격','USW:SRW':'미국 SRW 선물 관측가','palm-cpo':'말레이시아 CPO 선물 종가','palm-olein':'RBD 팜올레인 선물 종가','ICE:SB=F':'ICE 원당 선물 일봉 가격','TTSA:TS':'TTSA FOB 방콕 기준 타피오카전분 공식 주간 고시 가격'};
const response=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
/** Select whole, distinct propositions. Never truncate/pad/rephrase a claim to
 * hit a quota. A bounded search cannot manufacture missing substance. */
function paragraph(atoms:Atom[],min:number,max:number,minConcepts:number):Atom[]|null{
 const ranked=atoms.sort((a,b)=>b.rank-a.rank||a.text.localeCompare(b.text));
 const choices=ranked.filter((a,i)=>ranked.findIndex(b=>b.text===a.text)===i).slice(0,22);
 let best:Atom[]|null=null,score=-Infinity;
 function visit(start:number,selected:Atom[],length:number){
  if(length>max)return;
  if(length>=min&&selected.length>=minConcepts){
   const next=selected.reduce((n,a)=>n+a.rank,0)/selected.length-Math.abs(length-(min+max)/2)/50-Math.max(0,selected.length-4)*4;
   if(next>score){score=next;best=[...selected];}
  }
  if(selected.length>=6)return;
  for(let i=start;i<choices.length;i++)if(!selected.some(a=>a.concept===choices[i].concept)&&(!choices[i].concept.startsWith('scope-limitation:')||selected.filter(a=>a.concept.startsWith('scope-limitation:')).length<2))visit(i+1,[...selected,choices[i]],length+(selected.length?1:0)+chars(choices[i].text));
 }
 visit(0,[],0);return best;
}
export function composeEvidenceFirstReport(input:AnalysisEvidence,now:Date):{status:'composed';body:any;report:GroundedAiAnalysis;trace:Atom[]}|{status:'retain-previous';issues:string[]}{
 const evidence=structuredClone(input);
 evidence.facts.sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
 if(evidence.facts.some(f=>!validAnalysisFact(f,evidence.commodity,now))||new Set(evidence.facts.map(f=>f.id)).size!==evidence.facts.length)return {status:'retain-previous',issues:['invalid-or-duplicate-original-evidence']};
 // Refuse inconsistent typed price metadata rather than rendering a value
 // that is absent from its canonical source record. No conversion is performed.
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(evidence.facts.some(f=>f.measure?.metric==='price'&&!f.comparison&&!new RegExp('(?<![0-9.])'+escape(String(f.measure.value))+'\\s*'+escape(f.measure.unit)+'(?![A-Za-z/])').test(f.text.normalize('NFKC').replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,s=>s.replaceAll(',','')))))return {status:'retain-previous',issues:['price-measure-not-in-original-record']};
 // Legacy generated news summaries are not original publisher evidence.
 evidence.facts=evidence.facts.filter(f=>!/원문 검증 (?:요약|보도)/.test(f.text));
 const atoms:Atom[]=[];
 function add(f:AnalysisFact,text:string,role:Atom['role'],concept:string,rank:number){
  if(!text||(['desk','bullish','bearish','monitor'].includes(role)&&chars(text)>(role==='desk'?40:70)))return;
  try{
   const parts=compileAnalysisSection({text,evidenceIds:[f.id]},evidence,now,['desk','action','monitor'].includes(role)?'recommendation':'conditional');
   const actual=parts.filter(s=>s.kind!=='fact');
   // The deterministic pool contains only an atomic claim/action, never model prose.
   if(actual.length===1)atoms.push({text,evidenceIds:[...new Set(actual.flatMap(s=>s.evidenceIds))],role,concept,rank});
  }catch{/* Not independently expressible under the existing evidence contract. */}
 }
 for(const f of evidence.facts){
  const m=f.measure,expressions=verifiedKoreanExpressions(f);
  for(const [i,text]of expressions.facts.entries()){
   if(/연간 전망치입니다|^확인된 두 관측 사이/.test(text))continue;
   const limitation=/구분|구별|뜻하지|판단할 수|나타내지는|입증/.test(text);
   add(f,text,'fact',limitation?'scope-limitation:'+String(m?.benchmark||f.sourceUrl)+':'+String(m?.metric):f.id+':fact:'+i,f.id.startsWith('live-article-')?15:limitation?8:5);
  }
  for(const p of sourcePropositions(f)){
   if(p.role==='bullish'||p.role==='bearish')add(f,p.text,p.role,f.id+':reported-driver',20);
   if(p.role==='action'){
    add(f,p.text,chars(p.text)<=40?'desk':'action',f.id+':source-action:'+p.text,12);
    if(chars(p.text)<=70&&/후속|점검|확인/.test(p.text))add(f,p.text,'monitor',f.id+':source-monitor',10);
   }
  }
  for(const text of expressions.deskActions)add(f,text,'desk',f.id+':desk',5);
  if(!m)continue;
  const geo=m.scope.startsWith('world:')?'세계':m.scope.startsWith('US:')?'미국':null;
  if(m.valueKind==='forecast'&&geo&&['생산','수출','소비'].includes(m.metric)){
   // Only an actually recorded prior-forecast revision can form a causal driver.
   const change=/전월 전망 대비 [\d.]+ (?:million|billion|천|백만)?\s*(?:bushels|MT|톤)? (상향|하향)/.exec(f.text);
   const period=/20\d{2}\/\d{2}(?:\d{2})?/.exec(m.scope)?.[0];
   if(change&&period){
    const up=m.metric==='생산'?change[1]==='하향':change[1]==='상향';
    add(f,`${period}년 ${geo} ${f.topic} ${m.metric} 전망의 ${change[1]}은 선물가격 ${up?'상승':'하락'} 압력으로 작용할 수 있습니다.`,up?'bullish':'bearish',f.id+':actual-revision',20);
   }
   add(f,`${geo} ${f.topic} ${m.metric} 전망의 다음 발표를 확인한 후 공급사 견적과 선적 조건을 대조하여 조달 시점을 검토하십시오.`,'action','next-forecast-review',10);
   add(f,`${geo} ${f.topic} ${m.metric} 전망의 다음 발표와 실제 공급사 오퍼를 비교하십시오.`,'monitor',f.id+':next-release',8);
  }
  if(m.metric==='price'){
   if(/^(?:CBOT:|USW:|palm-|ICE:)/.test(m.benchmark))add(f,`${f.topic} 선물 관측값과 실제 공급사 오퍼를 비교하고 구매 규격별 계약 조건을 점검하십시오.`,'action','supplier-quotation-review',10);
   add(f,`${f.topic} 공표가격과 실제 공급사 견적의 차이를 확인하십시오.`,'monitor','supplier-quotation-review',5);
   if(priceLabels[m.benchmark]&&!f.comparison&&!evidence.facts.some(g=>g.measure?.benchmark===m.benchmark&&!g.comparison&&g.observedAt>f.observedAt)&&/^20\d{2}-\d{2}-\d{2}$/.test(f.observedAt)){
    const label=priceLabels[m.benchmark];add(f,`${f.observedAt} 기준 ${label}${particle(label)} ${m.value} ${m.unit}로 관측되었습니다.`,'fact',m.benchmark+':dated-level',12);
   }
  }
  if(f.commodity==='potato-starch'&&m.benchmark==='Eurostat:Comext:11081300'){
   const dates=/EU27:extra-EU:CN11081300:(20\d{2})-(\d{2})~(20\d{2})-(\d{2})/.exec(m.scope);
   const amounts=/수출 ([\d.]+) 천 MT, 수입 ([\d.]+) 천 MT/.exec(f.text);
   if(dates&&amounts)add(f,`Eurostat Comext 공식 무역 통계상 ${dates[1]}년 ${Number(dates[2])}월부터 ${dates[3]}년 ${Number(dates[4])}월까지 12개월간 EU27의 비EU 대상 완제품 감자전분(CN 11081300) 수출량은 ${amounts[1]}천 MT, 수입량은 ${amounts[2]}천 MT로 집계되었습니다.`,'fact',f.id+':trade-flow',8);
  }
  if(f.commodity==='soybean'){
   const period=/20\d{2}\/\d{2}/.exec(m.scope)?.[0];
   if(m.metric==='생산'&&period)add(f,`미국 농무부 ERS 전망에서 ${period}년 미국 대두 생산 전망은 ${m.value} ${m.unit}로 제시되었습니다.`,'fact',f.id+':forecast-level',15);
   if(m.metric==='planting-progress'&&f.referenceContext){
    const quote=f.referenceContext.quote.replace(/[‐‑–—]/g,'-');
    const q=/Mato Grosso planting is reported at around ([\d.]+)% complete, ahead of its five-year average near ([\d.]+)%/.exec(quote);
    if(q&&period)add(f,`브라질 마토그로소의 ${period}년 대두 파종률은 약 ${q[1]}%로 5년 평균 ${q[2]}%를 웃도는 진척을 나타냈으며 북부 일부의 건조 우려가 함께 보고되었습니다.`,'fact',f.id+':planting-weather',15);
   }
   if(m.metric==='price'&&f.referenceContext){
    const q=/As of October (\d+), US soybeans for November shipment were quoted at ([\d.]+) US.dollars per tonne FOB New Orleans, compared with ([\d.]+) US.dollars per tonne FOB Santos for Brazilian beans/.exec(f.referenceContext.quote);
    if(q)add(f,`10월 ${Number(q[1])}일 기준 11월 선적 FOB 오퍼는 미국 뉴올리언스가 ${q[2]} USD/MT, 브라질 산투스가 ${q[3]} USD/MT로 보도되었습니다.`,'fact',f.id+':indicative-offer',15);
   }
  }
 }
 const byRole=(role:Atom['role'])=>atoms.filter(a=>a.role===role).sort((a,b)=>b.rank-a.rank||a.text.localeCompare(b.text));
 const preferCurrent=(role:Atom['role'])=>byRole(role).sort((a,b)=>Number(b.evidenceIds.some(id=>id.startsWith('live-article-')))-Number(a.evidenceIds.some(id=>id.startsWith('live-article-'))));
 const bullish=preferCurrent('bullish').slice(0,1),bearish=preferCurrent('bearish').slice(0,1),desk=byRole('desk').find(a=>!/(?:확인|점검)하십시오[.]?$/.test(a.text))||byRole('desk')[0];
 const first=paragraph(byRole('fact'),300,540,3),second=paragraph(byRole('action'),80,180,2);
 const unused=(a:Atom)=>a.text!==desk?.text&&!second?.some(b=>b.text===a.text);
 const monitor=byRole('monitor').find(unused)||byRole('action').find(a=>chars(a.text)<=70&&unused(a));
 const outlook=byRole('fact').find(a=>a.concept.includes('dated-level'))||byRole('fact').find(a=>/관측|가격/.test(a.text));
 const issues=[!bullish.length&&'missing-real-bullish-driver',!bearish.length&&'missing-real-bearish-driver',!desk&&'missing-supported-desk-action',!first&&'insufficient-distinct-market-content',!second&&'insufficient-distinct-procurement-content',!monitor&&'missing-supported-monitoring-action',!outlook&&'missing-supported-price-context'].filter(Boolean) as string[];
 if(issues.length)return {status:'retain-previous',issues};
 const section=(selected:Atom[])=>({text:selected.map(a=>a.text).join(' '),evidenceIds:[...new Set(selected.flatMap(a=>a.evidenceIds))]});
 const body={outputFormat:'evidence-sections-v1',reportStyle:'procurement-brief-v1',confidenceScore:0,marketAnalysis:{text:first!.map(a=>a.text).join(' ')+'\n\n'+second!.map(a=>a.text).join(' '),evidenceIds:[...new Set([...first!,...second!].flatMap(a=>a.evidenceIds))]},procurementStrategy:section([desk]),priceOutlook:section([outlook!]),bullishFactors:bullish.map(a=>section([a])),bearishFactors:bearish.map(a=>section([a])),monitoringItems:[section([monitor!])]};
 try{
  const report=parseGroundedAnalysis(response(body),MODEL,now,evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true});
  return {status:'composed',body,report,trace:[...first!,...second!,desk,outlook!,...bullish,...bearish,monitor!]};
 }catch(error:any){return {status:'retain-previous',issues:error.issues||[error.message]};}
}
/** Revalidate text extracted from the ACTUAL rendered component, with exactly
 * the original claim IDs. A display rewrite cannot silently escape the audit. */
export function validateComposedRenderedText(composed:Extract<ReturnType<typeof composeEvidenceFirstReport>,{status:'composed'}>,rendered:{deskRecommendation:string;executiveSummary:string;bullishFactors:string[];bearishFactors:string[];watchItems:string[]}){
 const {report}=composed;
 for(const key of ['deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'] as const)if(JSON.stringify(rendered[key])!==JSON.stringify(report[key]))throw Error('rendered-claim-text-mismatch:'+key);
 const body=structuredClone(composed.body);body.marketAnalysis.text=rendered.executiveSummary;body.procurementStrategy.text=rendered.deskRecommendation;
 for(const [wire,display]of [['bullishFactors','bullishFactors'],['bearishFactors','bearishFactors'],['monitoringItems','watchItems']] as const)body[wire].forEach((item:any,i:number)=>item.text=rendered[display][i]);
 const facts=report.evidenceAudit.facts as AnalysisFact[];
 const checked=parseGroundedAnalysis(response(body),MODEL,new Date(report.generatedAt),{commodity:facts[0].commodity,facts,failures:[]},{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true});
 if(acceptedBriefEvidenceIssues(checked,facts[0].commodity).length)throw Error('composed-publication-evidence-recheck-failed');
 return checked;
}
/** Opt-in entry point; explicit root only. Existing atomic promotion/last-good
 * guards decide publication. No scheduler/provider behavior is changed. */
export function publishEvidenceFirstReport(input:AnalysisEvidence,now:Date,root:string,runId:string,verifyRendered:(composed:Extract<ReturnType<typeof composeEvidenceFirstReport>,{status:'composed'}>)=>Parameters<typeof validateComposedRenderedText>[1]){
 const result=composeEvidenceFirstReport(input,now),key='analysis-'+input.commodity;
 if(result.status!=='composed')return {...result,selected:readScheduledContent(key,root)};
 validateComposedRenderedText(result,verifyRendered(result));
 // Re-fetching the same facts may change transport/HTML hashes (page counters,
 // request metadata), but must not falsely redate an identical composed report.
 // Both candidate validation and actual component validation have already run.
 const previous=readScheduledContent(key,root);
 const substantive=(v:any)=>JSON.stringify({desk:v.deskRecommendation,summary:v.executiveSummary,bullish:v.bullishFactors,bearish:v.bearishFactors,monitor:v.watchItems,sources:v.sources,claims:v.evidenceClaims,facts:(v.evidenceAudit?.facts||[]).map((f:any)=>({id:f.id,text:f.text,sourceUrl:f.sourceUrl,sourceTitle:f.sourceTitle,observedAt:f.observedAt,commodity:f.commodity,topic:f.topic,measure:f.measure,comparison:f.comparison}))});
 if(previous?.payload.data.model===MODEL&&substantive(previous.payload.data)===substantive(result.report))return {...result,published:false,selected:previous};
 const published=publishScheduledContent({[key]:{success:true,data:result.report}},runId,root);
 const selected=readScheduledContent(key,root);if(!selected)throw Error('composed-report-readback-failed');
 return {...result,published:published.accepted.includes(key),selected};
}
