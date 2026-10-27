/** Read-only Potato adapter to the existing publisher-research evidence path. */
import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';import{load}from'cheerio';import{validAnalysisFact,type AnalysisFact,type AnalysisEvidence}from'./analysisEvidence.ts';
export const POTATO_RESEARCH_URL='https://www.chemanalyst.com/NewsAndDeals/NewsDetails/tightening-feedstock-availability-supports-european-potato-starch-44823';
export const POTATO_KMC_URL='https://www.kmcagro.dk/kmc-avlsnyt/oversigt-over-resultaterne-fra-2-proeveopgravning-2026/';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function collectPotatoPublisherEvidence(root=process.cwd(),now=new Date()):AnalysisEvidence{
 const e:AnalysisEvidence={commodity:'potato-starch',facts:[],failures:[]};
 const add=(id:string,text:string,url:string,title:string,date:string,r:any,measure?:AnalysisFact["measure"])=>{const f:AnalysisFact={id,commodity:'potato-starch',topic:'감자전분',text,sourceUrl:url,sourceTitle:title,observedAt:date,verifiedAt:r.retrievedAt,verification:'original-record',recordSha256:r.sha256,...(measure?{measure}:{})};if(!validAnalysisFact(f,'potato-starch',now))throw Error('Invalid Potato fact');e.facts.push(f);};
 for(const[name,url]of[['stats','http://127.0.0.1:3000/api/starch/potato-stats'],['trade','http://127.0.0.1:3000/api/starch/potato-trade'],['research',POTATO_RESEARCH_URL],['kmc',POTATO_KMC_URL]])try{
  const r=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/potato-'+name+'.json'),'utf8'));if(r.url!==url||r.status!==200||hash(r.body)!==r.sha256||+now-Date.parse(r.retrievedAt)>7*86400000||Date.parse(r.retrievedAt)>+now)throw Error('Potato original receipt integrity/freshness');
  if(name==='stats'){
   const s=JSON.parse(r.body),d=s.data;if(!s.success||!['live-verified','last-verified'].includes(s.dataStatus)||d.dataset!=='apro_cpnh1'||d.coverage.join(',')!=='DE,FR,NL,DK'||d.countries.length!==4||d.countries.some((c:any,i:number)=>c.country!==d.coverage[i]||c.production1000MT<=0||c.area1000HA<=0))throw Error('Potato official scope invalid');
   const total=d.countries.reduce((n:number,c:any)=>n+c.production1000MT,0),area=d.countries.reduce((n:number,c:any)=>n+c.area1000HA,0);if(Math.abs(total-d.production1000MT)>.02||Math.abs(area-d.area1000HA)>.02||Math.abs(total/area-d.weightedYieldMTHA)>.02)throw Error('Potato totals/units mismatch');
   add('potato-official-harvest',`Eurostat ${d.dataset} ${d.harvestYear}년 DE·FR·NL·DK 전체 감자(종자용 포함) 생산 ${d.production1000MT} 천 MT (${d.productionMMT} MMT), 수확면적 ${d.area1000HA} 천 ha, 생산/면적 가중단수 ${d.weightedYieldMTHA} MT/ha. 전분용 감자·완제품 감자전분 생산량·2026년 감산률·전분 함량·가공사 재고가 아닙니다.`,s.sourceUrl,'Eurostat · all harvested potatoes, DE FR NL DK',d.harvestYear+'-12-31',r,{metric:'raw-potato-production',scope:`DE,FR,NL,DK:all-potatoes:${d.harvestYear}`,benchmark:'Eurostat:apro_cpnh1',unit:'천 MT',value:d.production1000MT,valueKind:'proxy'});
  }else if(name==='trade'){
   const s=JSON.parse(r.body),d=s.data;if(!s.success||!['live-verified','last-verified'].includes(s.dataStatus)||d.productCode!=='11081300'||d.reporter!=='EU27_2020'||d.partner!=='EXT_EU27_2020'||d.monthsCount!==12||!Number.isFinite(d.exports1000MT)||!Number.isFinite(d.imports1000MT))throw Error('Potato starch trade scope invalid');
   add('potato-official-trade',`Eurostat Comext CN11081300 완제품 감자전분: EU27 대 비EU ${d.periodStart}~${d.periodEnd} 연속 12개월 수출 ${d.exports1000MT} 천 MT, 수입 ${d.imports1000MT} 천 MT. 역내 교역 제외, 100kg 원단위를 MT로 변환한 물량이며 가격·단가·소비·생산·재고·공급사 확정 오퍼가 아닙니다.`,s.sourceUrl,'Eurostat Comext · extra-EU potato starch',d.periodEnd,r,{metric:'수출',scope:`EU27:extra-EU:CN11081300:${d.periodStart}~${d.periodEnd}`,benchmark:'Eurostat:Comext:11081300',unit:'천 MT',value:d.exports1000MT,valueKind:'actual'});
  }else{
   const $=load(r.body);$('script,style,nav,footer,header').remove();const text=$('body').text().replace(/\s+/g,' ');
   if(name==='research'){
    if(!text.includes('05-Oct-2026')||!text.includes('Tightening Feedstock Availability')||!text.includes('finished Potato starch prices remained largely stable'))throw Error('Potato research date/passages missing');
    add('article-potato-market','ChemAnalyst 2026-10-05 독자 시장평가: 유럽 원료감자 가용량 제약 우려에도 9월 말 완제품 감자전분 가격은 대체로 안정적이었다고 보도. 가공사 커버리지와 하류 구매 조절을 배경으로 제시하며 향후 원료 품질·저장 손실을 조건부 위험으로 평가. 공개 원문에는 정확한 가격이 가려져 있어 수치·현물 오퍼·전국 생산량이나 실제 공급 부족으로 사용하지 않습니다.',url,'ChemAnalyst · European Potato Starch market', '2026-10-05',r);
   }else{
    if(!text.includes('25.08.2026')||!text.includes('Gennemsnit 527 20,4 107,9')||!text.includes('AKD')||!text.includes('AKK'))throw Error('KMC original sample scope missing');
    add('article-potato-kmc','KMC Agro 2026-08-25 발표: 8월 24~25일 AKD·AKK 2차 시험굴취의 전분용 품종 평균 전분 함량 20.4% (원문20,4). 지역·포장·품종 간 편차와 무관개 건조지 제약을 명시한 당시 표본 결과이며, 10월 최종 수확·EU 평균·공장 추출효율·전국 완제품 생산량이 아닙니다.',url,'KMC Agro · second trial digging August2026','2026-08-25',r);
   }
  }
 }catch(err){e.failures.push('Potato-'+name+':'+(err as Error).message);}
 return e;
}
export function retainedPotatoPublisherCitations(report:{executiveSummary?:string;bullishFactors?:string[];bearishFactors?:string[];watchItems?:string[]},evidence:AnalysisEvidence,root=process.cwd(),now=new Date()){
 if(evidence.commodity!=='potato-starch')return[];const body=[report.executiveSummary,...(report.bullishFactors||[]),...(report.bearishFactors||[]),...(report.watchItems||[])].join(' ');return collectPotatoPublisherEvidence(root,now).facts.filter(f=>f.id.startsWith('article-')&&evidence.facts.some(x=>JSON.stringify(x)===JSON.stringify(f))&&(f.id==='article-potato-market'?/ChemAnalyst/i:/KMC/i).test(body)).map(f=>({title:f.sourceTitle,url:f.sourceUrl,publisher:f.id==='article-potato-market'?'ChemAnalyst':'KMC Agro',publisherVerified:true,provenance:{kind:'verified-retained-original' as const,receiptSha256:f.recordSha256,verifiedAt:f.verifiedAt,evidenceIds:[f.id],supportedClaims:[f.text]}}));
}
