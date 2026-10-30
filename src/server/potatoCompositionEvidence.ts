/** Original Eurostat JSON-stat receipts for composition, separate from UI caches.
 * Reparse exact raw bodies on every read; never manufacture localhost receipts. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {parseEurostatPotatoes,POTATO_EUROSTAT_PAGE} from './officialPotatoEurostatService.ts';
import {parsePotatoComext,POTATO_COMEXT_PAGE} from './officialPotatoComextService.ts';
import {validAnalysisFact,type AnalysisEvidence,type AnalysisFact} from './analysisEvidence.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const directory=(root:string)=>path.join(root,'.rms-stage3/evidence/potato-official');
function urls(now:Date){const stats=new URL('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/apro_cpnh1');for(const [k,v]of Object.entries({lang:'EN',freq:'A',crops:'R1000',sinceTimePeriod:String(now.getUTCFullYear()-5)}))stats.searchParams.set(k,v);for(const geo of ['DE','FR','NL','DK'])stats.searchParams.append('geo',geo);
 const trade=(flow:string)=>{const u=new URL('https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409');for(const[k,v]of Object.entries({format:'JSON',freq:'M',reporter:'EU27_2020',partner:'EXT_EU27_2020',product:'11081300',indicators:'QUANTITY_IN_100KG',sinceTimePeriod:`${now.getUTCFullYear()-3}-01`,flow}))u.searchParams.set(k,v);return u.href;};return {stats:stats.href,imports:trade('1'),exports:trade('2')};}
export async function collectPotatoCompositionEvidence(root=process.cwd(),now=new Date(),fetcher:typeof fetch=fetch){
 const dir=directory(root);fs.mkdirSync(dir,{recursive:true});const rows:any[]=[],received=new Map<string,any>();
 for(const [key,url]of Object.entries(urls(now)))try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);
  const body=await r.text();if(body.length>12_000_000)throw Error('body-limit');JSON.parse(body);
  const sha256=hash(body),receipt={version:1,url,checkedAt:now.toISOString(),sha256,body};const immutable=path.join(dir,sha256+'.json');if(!fs.existsSync(immutable))fs.writeFileSync(immutable,JSON.stringify(receipt),{flag:'wx',mode:0o600});
  received.set(key,receipt);rows.push({key,status:'received'});
 }catch(e){rows.push({key,status:'failed',reason:/^HTTP \d+$/.test((e as Error).message)?(e as Error).message:'official-source-unavailable'});}
 const promote=(key:string)=>{const r=received.get(key),selected=path.join(dir,key+'.json'),temp=selected+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify({sha256:r.sha256,checkedAt:r.checkedAt,url:r.url}),{mode:0o600});fs.renameSync(temp,selected);};
 const stats=received.get('stats'),parsedStats=stats&&parseEurostatPotatoes(JSON.parse(stats.body),'apro_cpnh1',now);
 if(parsedStats&&parsedStats.harvestYear+'-12-31'<=now.toISOString().slice(0,10)&&!parsedStats.countries.some(c=>/[cuxz]/i.test((c.productionStatus||'')+(c.areaStatus||''))))promote('stats');
 const imports=received.get('imports'),exports=received.get('exports');if(imports&&exports&&parsePotatoComext(JSON.parse(imports.body),JSON.parse(exports.body),now)){promote('imports');promote('exports');}
 return {rows,evidence:readPotatoCompositionEvidence(root,now)};
}
export function readPotatoCompositionEvidence(root=process.cwd(),now=new Date()):AnalysisEvidence{
 const out:AnalysisEvidence={commodity:'potato-starch',facts:[],failures:[]};const read=(key:keyof ReturnType<typeof urls>)=>{const p=JSON.parse(fs.readFileSync(path.join(directory(root),key+'.json'),'utf8'));if(!/^[a-f0-9]{64}$/.test(p.sha256)||p.url!==urls(now)[key]||!Number.isFinite(Date.parse(p.checkedAt))||Date.parse(p.checkedAt)>+now||+now-Date.parse(p.checkedAt)>7*86400000)throw Error('receipt-identity-or-age');const r=JSON.parse(fs.readFileSync(path.join(directory(root),p.sha256+'.json'),'utf8'));if(r.url!==p.url||typeof r.body!=='string'||hash(r.body)!==p.sha256)throw Error('receipt-integrity');return {...p,raw:JSON.parse(r.body)};};
 const add=(f:AnalysisFact)=>{if(!validAnalysisFact(f,'potato-starch',now))throw Error('invalid-official-fact');out.facts.push(f);};
 try{const r=read('stats'),d=parseEurostatPotatoes(r.raw,'apro_cpnh1',now);if(!d||d.harvestYear+'-12-31'>now.toISOString().slice(0,10)||d.countries.some(c=>/[cuxz]/i.test((c.productionStatus||'')+(c.areaStatus||''))))throw Error('incomplete-or-confidential-statistics');add({id:'potato-official-harvest',commodity:'potato-starch',topic:'감자전분',text:`Eurostat ${d.dataset} ${d.harvestYear}년 DE·FR·NL·DK 전체 감자(종자용 포함) 생산 ${d.production1000MT} 천 MT (${d.productionMMT} MMT), 수확면적 ${d.area1000HA} 천 ha, 생산/면적 가중단수 ${d.weightedYieldMTHA} MT/ha. 전분용 감자·완제품 감자전분 생산량·2026년 감산률·전분 함량·가공사 재고가 아닙니다.`,sourceUrl:POTATO_EUROSTAT_PAGE,sourceTitle:'Eurostat · all harvested potatoes, DE FR NL DK',observedAt:d.harvestYear+'-12-31',verifiedAt:r.checkedAt,verification:'original-record',recordSha256:r.sha256,measure:{metric:'raw-potato-production',scope:`DE,FR,NL,DK:all-potatoes:${d.harvestYear}`,benchmark:'Eurostat:apro_cpnh1',unit:'천 MT',value:d.production1000MT,valueKind:'proxy'}});}catch{out.failures.push('potato-official-harvest-receipt-unavailable-or-invalid');}
 try{const a=read('imports'),b=read('exports'),d=parsePotatoComext(a.raw,b.raw,now);if(!d)throw Error('invalid-trade');add({id:'potato-official-trade',commodity:'potato-starch',topic:'감자전분',text:`Eurostat Comext CN11081300 완제품 감자전분: EU27 대 비EU ${d.periodStart}~${d.periodEnd} 연속 12개월 수출 ${d.exports1000MT} 천 MT, 수입 ${d.imports1000MT} 천 MT. 역내 교역 제외, 100kg 원단위를 MT로 변환한 물량이며 가격·단가·소비·생산·재고·공급사 확정 오퍼가 아닙니다.`,sourceUrl:POTATO_COMEXT_PAGE,sourceTitle:'Eurostat Comext · extra-EU potato starch',observedAt:d.periodEnd,verifiedAt:a.checkedAt<b.checkedAt?a.checkedAt:b.checkedAt,verification:'original-record',recordSha256:hash(a.sha256+b.sha256),measure:{metric:'수출',scope:`EU27:extra-EU:CN11081300:${d.periodStart}~${d.periodEnd}`,benchmark:'Eurostat:Comext:11081300',unit:'천 MT',value:d.exports1000MT,valueKind:'actual'}});}catch{out.failures.push('potato-official-trade-receipt-unavailable-or-invalid');}
 return out;
}
