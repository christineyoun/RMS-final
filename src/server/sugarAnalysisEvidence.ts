/** Read-only Sugar inputs for the existing publisher path. No price/history/UI writes. */
import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';import{load}from'cheerio';import{validateSugarHistory}from'./sugarPriceSnapshotService.ts';import{observedPriceChanges}from'../utils/observedPriceChanges.ts';import{validAnalysisFact,compareAnalysisObservations,type AnalysisEvidence,type AnalysisFact}from'./analysisEvidence.ts';
export const SUGAR_RESEARCH_URL='https://www.gsxcom.com/p/gsx-monthly-sugar-report-6b31';
export const SUGAR_PRICE_URL='https://finance.yahoo.com/quote/SB=F/history/';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function collectSugarPriceEvidence(root=process.cwd(),now=new Date()):AnalysisEvidence{
 const e:AnalysisEvidence={commodity:'sugar',facts:[],failures:[]};try{
  let raw:any,recordSha256:string;
  const current=path.join(root,'.rms-price-history/sugar.json');
  if(fs.existsSync(current)){
   const envelope=JSON.parse(fs.readFileSync(current,'utf8'));raw=envelope.payload;
   if(envelope.version!==1||raw?.provider!=='Yahoo Finance'||raw?.exchange!=='ICE Futures U.S.')throw Error('Sugar saved collector identity invalid');
   // Read the actual collector output directly; do not manufacture an HTTP receipt.
   validateSugarHistory(raw);recordSha256=hash(JSON.stringify(raw));
  }else {
   const r=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/sugar-price.json'),'utf8'));
   if(r.status!==200||r.url!=='http://127.0.0.1:3000/api/sugar/price-snapshot'||hash(r.body)!==r.sha256)throw Error('Sugar original snapshot receipt mismatch');
   raw=JSON.parse(r.body);recordSha256=r.sha256;
  }
  const h=validateSugarHistory(raw);if(raw.stale||+now-Date.parse(h.fetchedAt!)<0||+now-Date.parse(h.fetchedAt!)>3*86400000||+now-Date.parse(h.data.at(-1)!.date)>8*86400000)throw Error('Sugar snapshot stale');
  const moves=observedPriceChanges(h.data),latest=h.data.at(-1)!,dates=new Set([latest.date,...h.data.slice(-5).map(p=>p.date),moves.wow.referenceDate,moves.mom.referenceDate].filter(Boolean));
  const points=h.data.filter(p=>dates.has(p.date)).map((p):AnalysisFact=>({id:'sugar-sb-'+p.date,commodity:'sugar',topic:'설탕(원당)',text:`${p.date} ICE Sugar No.11 SB=F Yahoo ${p.isProvisional?'잠정 ':''}일봉 ${p.quoteValue} US¢/lb, ${p.usdPerMT} USD/MT (US¢/lb × 22.0462262185 환산). 일반 선물 연속 기호로 계약 월·롤오버·공식 정산은 미검증이며 정제 백설탕 현물·한국 도착 원가가 아닙니다.`,sourceUrl:SUGAR_PRICE_URL,sourceTitle:'Yahoo Finance · ICE Sugar No.11 SB=F',observedAt:p.date,verifiedAt:h.fetchedAt!,verification:'original-record',recordSha256,measure:{metric:'price',scope:'ICE:Yahoo-generic-daily-bar-not-verified-settlement',benchmark:'ICE:SB=F',unit:'USD/MT',value:p.usdPerMT,valueKind:'actual'}}));
  e.facts.push(...points);for(const [name,m]of[['WoW',moves.wow],['MoM',moves.mom]]as const){const a=points.find(f=>f.observedAt===m.referenceDate),b=points.find(f=>f.observedAt===latest.date);if(a&&b){const c=compareAnalysisObservations([a,b]);if(c){c.id='sugar-sb-'+name.toLowerCase();c.text+=` ${name} 두 관측일 순변화이며 지속 추세나 실행 가능한 구매 단가 변화가 아닙니다.`;e.facts.push(c);}}}
  if(e.facts.some(f=>!validAnalysisFact(f,'sugar',now)))throw Error('Invalid Sugar fact');
 }catch(err){e.facts=[];e.failures.push('Sugar-price:'+String((err as Error).message));}return e;
}
export function collectSugarArticleEvidence(root=process.cwd(),now=new Date()):AnalysisEvidence{
 const e:AnalysisEvidence={commodity:'sugar',facts:[],failures:[]};try{
  const r=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/sugar-research.json'),'utf8'));if(r.url!==SUGAR_RESEARCH_URL||r.status!==200||hash(r.body)!==r.sha256)throw Error('Sugar publisher receipt mismatch');
  const $=load(r.body),title=$('meta[property="og:title"]').attr('content')||'',date=$('meta[property="article:published_time"]').attr('content');if(title!=='GSX Monthly Sugar Report'||!date||date.slice(0,10)!=='2026-10-01'||+now-Date.parse(date)>31*86400000||+now-Date.parse(r.retrievedAt)>7*86400000)throw Error('Sugar original date/title/freshness invalid');
  $('script,style,nav,footer,header').remove();const text=$('body').text().replace(/\s+/g,' ');
  const excerpts=[{id:'brazil',anchor:'We would lean bearish if Brazil sustains its crush',quote:'We would lean bearish if Brazil sustains its crush and a higher sugar mix delivers more sugar out of the mills, while India and Thailand print stronger harvest numbers than expected.'},{id:'harvest',anchor:'Indian crushing, expected to start around mid-October',quote:'Indian crushing, expected to start around mid-October, remains a watchpoint and will reveal recovery rates and yields, potentially leading to some volatility in flat price.'},{id:'season',anchor:'the fuller El Nino effect on India and Thailand production',quote:'The Monsoon outcome will show up in India’s 2026/27 crush, but the fuller El Nino effect on India and Thailand production is more likely to be realised in the 2027/28 harvest.'}];
  for(const x of excerpts){if(!text.includes(x.anchor)||!text.includes(x.quote))throw Error('Sugar original supporting passage missing');const f:AnalysisFact={id:'article-sugar-gsx-'+x.id,commodity:'sugar',topic:'설탕(원당)',text:`GSX ${date.slice(0,10)} 발행 September 2026 Sugar Market Commentary 원문: “${x.quote}” 저자의 조건부 전망이며 현재 확정 생산·피해나 정부 정책이 아닙니다.`,sourceUrl:r.url,sourceTitle:title,observedAt:date.slice(0,10),verifiedAt:r.retrievedAt,verification:'original-record',recordSha256:r.sha256};if(!validAnalysisFact(f,'sugar',now))throw Error('Invalid Sugar original fact');e.facts.push(f);}
 }catch(err){e.facts=[];e.failures.push('Sugar-article:'+String((err as Error).message));}return e;
}
export function retainedSugarPublisherCitations(report:{executiveSummary?:string;bullishFactors?:string[];bearishFactors?:string[];watchItems?:string[]},evidence:AnalysisEvidence,root=process.cwd(),now=new Date()){
 if(evidence.commodity!=='sugar')return[];const body=[report.executiveSummary,...(report.bullishFactors||[]),...(report.bearishFactors||[]),...(report.watchItems||[])].join(' ');if(!/GSX/i.test(body))return[];
 const facts=collectSugarArticleEvidence(root,now).facts.filter(f=>evidence.facts.some(x=>JSON.stringify(x)===JSON.stringify(f)));if(facts.length!==3)return[];
 return[{url:SUGAR_RESEARCH_URL,title:'GSX Monthly Sugar Report · September 2026 commentary',publisher:'GSX',publisherVerified:true,provenance:{kind:'verified-retained-original' as const,receiptSha256:facts[0].recordSha256,verifiedAt:facts[0].verifiedAt,evidenceIds:facts.map(f=>f.id),supportedClaims:facts.map(f=>f.text)}}];
}
