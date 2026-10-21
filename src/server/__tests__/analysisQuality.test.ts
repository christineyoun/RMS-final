import {mock as testClock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {collectAnalysisEvidence,compareAnalysisObservations,type AnalysisFact} from '../analysisEvidence.ts';
import {prepareAnalysisEvidence,originalArticleFact} from '../analysisArticleEvidence.ts';
import {validateConditionalReasoning} from '../analysisReasoning.ts';
import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));


const fixturePath='.rms-stage3/diagnostics/analysis-recovery-palm-2f654d767230-1-palm-oil.json';
const retained=JSON.parse(fs.readFileSync(fixturePath,'utf8')),now=new Date(frozen.checkedAt);
testClock.timers.enable({apis:['Date'],now});
const protectedFiles=[fixturePath,'.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/analysis-recovery.json',
  ...fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n)];
const hash=()=>protectedFiles.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')).join(':');
const before=hash(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-quality-'));
const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Real network/paid generation prohibited');};
const evidence=structuredClone(frozen.packets['palm-oil']),original=JSON.parse(retained.response.text);
const production=evidence.facts.find(f=>f.id==='psd-28')!;
const price=evidence.facts.find(f=>f.id==='palm-cpo-2026-10-19')!,exports=evidence.facts.find(f=>f.id==='psd-88')!,stocks=evidence.facts.find(f=>f.id==='psd-176')!;
const clone=<T>(v:T):T=>structuredClone(v);
const set=(data:any,field:string,segments:any[])=>{
  data.evidenceClaims.find((c:any)=>c.field===field).segments=segments;
  const text=segments.map(s=>s.text).join(' '),[key,n]=field.split('.');if(n===undefined)data[key]=text;else data[key][Number(n)]=text;
};
const raw=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
try{
  assert.equal(fs.statSync(fixturePath).mode&0o077,0,'retained provider response is owner-only');
  let replay:AnalysisValidationError|undefined;
  try{parseGroundedAnalysis(retained.response,retained.model,new Date(retained.recordedAt),retained.request.evidence);}catch(error){replay=error as AnalysisValidationError;}
  assert.equal(replay?.stage,'sources');
  assert.ok(replay!.issues.includes('unsupported-observed-price-trend:deskRecommendation'));
  assert.ok(replay!.issues.includes('unsupported-inventory-adequacy:bullishFactors.1'));
  assert.ok(replay!.issues.includes('unsupported-observed-market-trend:executiveSummary'));
  for(const field of ['bearishFactors.0','bearishFactors.1','watchItems.1'])assert.ok(!replay!.issues.some(s=>s.endsWith(':'+field)),field+' no longer rejected for ordinary Korean');

  const normal=[
    ['만약 팜유 생산 전망이 실현될 경우, 공급 증가로 인해 가격 부담이 낮아질 가능성이 있습니다.',production],
    ['팜유 수출 보고서가 향후 발표되면, 전망과 실제 선적을 비교할 수 있습니다.',exports],
    ['만약 CPO 실제 공급사 견적을 확정할 수 있는 경우, 환율 및 운임 때문에 구매 시점을 재검토할 수 있습니다.',price],
    ['CPO 가격이 낮아진다면, 따라서 실제 공급사 견적을 비교할 필요가 있습니다.',price],
    ['만약 향후 CPO 가격 하락이 발생할 경우, 베이시스와 운임 차이를 확인해야 합니다.',price],
    ['만약 팜유 재고가 향후 타이트해질 경우, 공급사 오퍼를 다시 점검할 수 있습니다.',stocks],
    ['만약 향후 타이트한 팜유 재고가 형성될 경우, 공급사 오퍼를 다시 비교할 수 있습니다.',stocks],
  ] as const;
  for(const [text,fact] of normal)assert.deepEqual(validateConditionalReasoning(text,[fact]).issues,[],text);
  for(const text of [
    '팜유 재고가 부족하여 가격은 반드시 상승합니다.',
    '만약 CPO 가격이 오르는 경우, 정부가 새 정책을 발표했습니다. 가격 부담이 높아질 수 있습니다.',
    '만약 CPO 가격이 오르는 경우, 가격은 무조건 상승할 수 있습니다.',
    '만약 CPO 가격이 오르는 경우, 조달 물량의 50%를 매수할 수 있습니다.',
    '만약 CPO 가격이 오르는 경우, 현재 재고는 부족합니다. 따라서 매수를 검토할 수 있습니다.',
  ])assert.ok(validateConditionalReasoning(text,[price]).issues.length,text);
  assert.ok(validateConditionalReasoning('만약 CPO 강세가 지속될 경우, 수입 비용이 높아질 수 있습니다.',[price]).issues.includes('unsupported-observed-price-trend'));
  assert.ok(validateConditionalReasoning('만약 팜유의 타이트한 기말재고가 유지될 경우, 가격 부담이 높아질 수 있습니다.',[stocks]).issues.includes('unsupported-inventory-adequacy'));
  const trend=evidence.facts.find(f=>f.comparison?.metric==='price'&&f.topic==='CPO'&&f.comparison.monotonic&&f.comparison.observationCount===3)!;
  assert.deepEqual(validateConditionalReasoning('만약 CPO 강세가 지속될 경우, 수입 비용이 높아질 수 있습니다.',[trend]).issues,[]);
  const olein=evidence.facts.find(f=>f.topic==='RBD Olein'&&f.measure?.metric==='price'&&!f.comparison)!;
  assert.equal(compareAnalysisObservations([price,olein]),null,'different benchmark/unit cannot establish a comparison');
  const older=evidence.facts.find(f=>f.id==='palm-cpo-2026-10-12')!;
  assert.equal(compareAnalysisObservations([older,{...price,sourceUrl:olein.sourceUrl}]),null,'source mismatch');
  assert.equal(compareAnalysisObservations([older,{...price,measure:{...price.measure!,unit:'USD/MT'}}]),null,'unit mismatch');
  const interval=evidence.facts.find(f=>f.comparison?.baselineId===older.id)!;
  assert.equal(interval.comparison!.pct,2.46);assert.equal(interval.comparison!.monotonic,false,'net increase is not a sustained monotonic trend');
  const stockBalance=evidence.facts.find(f=>f.comparison?.metric==='annual-stock-forecast-balance')!;
  assert.match(stockBalance.text,/실제 월간 재고 변화나 재고 부족 판정이 아닙니다/);

  // A deliberately rewritten MOCK demonstrates a legitimate path through the
  // shared validator. It is not a repaired/saved Gemini response or a promotion.
  const mock=clone(original);
  const replacements:Record<string,string>={
    deskRecommendation:'만약 CPO 후속 종가와 실제 공급사 견적이 확인되는 경우, 환율 및 운임을 비교하여 구매 시점을 검토할 수 있습니다.',
    executiveSummary:'만약 팜유 후속 생산 및 수출 전망이 달라지는 경우, 제품별 공급사 오퍼를 다시 점검할 수 있습니다.',
    'bullishFactors.0':'만약 향후 CPO 공표 종가가 상승하는 경우, 해당 원료의 조달 비용 부담이 높아질 가능성이 있습니다.',
    'bullishFactors.1':'만약 향후 팜유 재고가 감소하는 경우, 공급사 견적을 더 자주 점검할 필요가 있습니다.',
    'watchItems.0':'만약 향후 RBD Olein 선물 종가가 발표될 경우, 해당 벤치마크의 가격 변화를 모니터링할 필요가 있습니다.',
  };
  for(const [field,text] of Object.entries(replacements)){
    const segments=clone(mock.evidenceClaims.find((c:any)=>c.field===field).segments);if(field==='executiveSummary')segments.find((s:any)=>s.kind==='conditional').evidenceIds=['psd-28','psd-88'];segments.find((s:any)=>s.kind==='conditional').text=text;set(mock,field,segments);
  }
  assert.equal(parseGroundedAnalysis(raw(mock),'OFFLINE-MOCK',now,evidence).evidenceAudit?.version,4);
  const interpretation=clone(mock),claims=interpretation.evidenceClaims.find((c:any)=>c.field==='bearishFactors.0');
  set(interpretation,'bearishFactors.0',[{kind:'fact',text:interval.text,evidenceIds:[interval.id]},
    {kind:'interpretation',text:interval.interpretations![0],evidenceIds:[interval.id]},claims.segments.at(-1)]);
  assert.ok(parseGroundedAnalysis(raw(interpretation),'OFFLINE-MOCK',now,evidence));
  const unsupported=clone(interpretation);unsupported.evidenceClaims.find((c:any)=>c.field==='bearishFactors.0').segments[1].text='현재 재고는 타이트하며 가격 상승이 확실합니다.';
  const changed=unsupported.evidenceClaims.find((c:any)=>c.field==='bearishFactors.0');set(unsupported,changed.field,changed.segments);
  assert.throws(()=>parseGroundedAnalysis(raw(unsupported),'mock',now,evidence),/unsupported-interpretation/);
  const wrongNumber=clone(mock),first=wrongNumber.evidenceClaims[0];first.segments[0].text=first.segments[0].text.replace('4797','4798');set(wrongNumber,first.field,first.segments);
  assert.throws(()=>parseGroundedAnalysis(raw(wrongNumber),'mock',now,evidence),/unsupported-factual-claim/);

  for(const id of ['palm-oil','soybean','soybean-oil','sugar','potato-starch'])assert.ok(structuredClone(frozen.packets[id]).facts.some(f=>f.comparison),id+' receives shared comparative evidence');
  const eurostat=structuredClone(frozen.packets['potato-starch']);
  assert.ok(eurostat.facts.every(f=>/대리지표|raw-potato-production/.test(f.text)),'production never becomes starch price');

  const url='https://theedgemalaysia.com/node/offline-palm-fixture';
  const html='<html><head><meta property="article:published_time" content="2026-10-19T00:00:00Z"><meta property="og:title" content="Palm oil export outlook"></head><body><article>'+Array.from({length:3},()=>'<p>Palm oil export demand increased according to the dated publisher report, while production forecasts and stocks remain subject to revision and supplier confirmation.</p>').join('')+'</article></body></html>';
  assert.ok(originalArticleFact(html,url,'2026-10-19','palm-oil',now.toISOString()));
  assert.equal(originalArticleFact(html,url,'2026-10-18','palm-oil',now.toISOString()),null,'publisher date mismatch');
  assert.equal(originalArticleFact(html,url,'2026-10-19','soybean-oil',now.toISOString()),null,'irrelevant commodity');
  fs.mkdirSync(path.join(temp,'.rms-stage3/snapshots'),{recursive:true});
  const news={payload:{articles:[{originalUrl:url,publishedAt:'2026-10-19',summary:'Invented AI summary 9999 tonnes.'}]}};
  fs.writeFileSync(path.join(temp,'.rms-stage3/snapshots/news-palm-oil.json'),JSON.stringify(news));
  const noOriginal=await prepareAnalysisEvidence('palm-oil',temp,now,{fetchSources:false});assert.ok(!noOriginal.facts.some(f=>f.id.startsWith('article-')),'AI summary is not original evidence');
  let checks=0;
  const fetched=await prepareAnalysisEvidence('palm-oil',temp,now,{fetcher:async()=>{checks++;return new Response(html,{status:200,headers:{'content-type':'text/html'}});}});
  assert.equal(checks,1);assert.ok(fetched.facts.some(f=>f.id.startsWith('article-')));assert.ok(fetched.facts.every(f=>!f.text.includes('9999')));
  const cached=await prepareAnalysisEvidence('palm-oil',temp,now,{fetcher:async()=>{throw Error('Cache must avoid refetch');}});assert.ok(cached.facts.some(f=>f.id.startsWith('article-')));
  assert.equal(hash(),before,'retained response/snapshots/paid logs were not changed or promoted');
  console.log('PASS: exact secure response replay still rejects unsupported trends/tightness; Korean conditional/causal/publication expressions; supported interpretations; numerical/source/unit mismatches; all five comparative adapters; original news verification/cache; zero paid calls or promotion.');
}finally{testClock.timers.reset();globalThis.fetch=nativeFetch;fs.rmSync(temp,{recursive:true,force:true});}
