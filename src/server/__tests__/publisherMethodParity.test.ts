/** OFFLINE replay: genuine saved outputs, no SDK, grant, generation or persistence.
 * Mutations below are explicitly synthetic validator probes, never AI analyses. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {acceptPublisherResearchReport,parsePublisherResearchResponse,buildPublisherResearchRequest} from '../liveAiAnalysisService.ts';
import {publisherResearchIntegrityIssues,publisherProcurementIssues,publisherAttributionIssues} from '../cornAiQuality.ts';
import {RMS_PROCUREMENT_POLICY} from '../../utils/rmsProcurementCondition.ts';

const diagnostic=JSON.parse(fs.readFileSync('.rms-stage3/diagnostics/standalone-soybean-oil-af2df5f4fd65-1-soybean-oil.json','utf8'));
const retained=JSON.parse(fs.readFileSync('.rms-stage3/diagnostics/rejected-analysis/standalone-soybean-oil-af2df5f4fd65-analysis-soybean-oil.json','utf8'));
const oil=retained.payload.data;
const files:string[]=[];
function walk(p:string){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else files.push(f);}}
walk('.rms-stage3');const hashes=()=>files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
const before=hashes(),native=globalThis.fetch;let stubbedRedirects=0;
globalThis.fetch=async()=>{throw Error('OFFLINE: external network prohibited');};
const results:Record<string,unknown>={externalProviderCalls:0,productionGrants:0,productionSnapshotWrites:0};
try{
  // Genuine historical saved Corn; Wheat is explicitly its later manual correction,
  // not a recovered original Oct 16 provider response or wire request.
  for(const id of ['corn','wheat']){
    const s=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-'+id+'.json','utf8'));
    const a=s.payload.data;
    const accepted=acceptPublisherResearchReport(JSON.stringify(a),id,a.model,a.sources,a.generatedAt);
    for(const k of ['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'] as const)
      assert.deepEqual(accepted[k],a[k],id+' saved report preserved');
    results[id]={pass:true,runId:s.runId,sourceCount:a.sources.length,manualCorrection:s.qualityReview||null};
  }
  assert.equal(diagnostic.stage,'validated','old automated acceptance genuinely passed');
  assert.equal(JSON.parse(diagnostic.response.text).deskRecommendation,oil.deskRecommendation);
  const issues=publisherResearchIntegrityIssues(oil,oil.sources,'soybean-oil',RMS_PROCUREMENT_POLICY);
  for(const issue of ['unsupported-numerical-buying-target','unsupported-basis-direction',
    'missing-original-publisher-citation:nopa-fastmarkets','missing-original-publisher-citation:usda-ers',
    'soybean-oil-import-total-not-south-american-allocation','at-least-two-independent-direct-publisher-links-required'])
    assert(issues.includes(issue),issue);
  assert.throws(()=>acceptPublisherResearchReport(diagnostic.response.text,'soybean-oil',diagnostic.model,oil.sources,oil.generatedAt),/guard failed/);
  // Replay the real Google grounding redirects using their retained, resolved
  // destinations. Only redirect transport is stubbed; no citations are invented.
  const chunks=diagnostic.response.candidates[0].groundingMetadata.groundingChunks;
  const destinations=new Map(chunks.map((c:any,i:number)=>[c.web.uri,oil.sources[i].url]));
  globalThis.fetch=async(input:any)=>{const target=destinations.get(String(input));assert(target,'only retained redirects may resolve');stubbedRedirects++;return new Response(null,{status:302,headers:{location:String(target)}});};
  await assert.rejects(parsePublisherResearchResponse(diagnostic.response,'soybean-oil',diagnostic.model),/guard failed/);
  assert(stubbedRedirects>0);
  globalThis.fetch=async()=>{throw Error('OFFLINE: external network prohibited');};
  results.rejectedGenuineOil={oldAutomatedStage:diagnostic.stage,newIssues:issues,stubbedRedirects};

  const requests=['wheat','corn','soybean','soybean-oil'].map(id=>buildPublisherResearchRequest('gemini-3.8-flash',id,'2026-10-22',true,id==='soybean-oil'?diagnostic.request.evidence:undefined));
  for(const q of requests){
    assert.deepEqual(q.config,requests[0].config);
    assert.deepEqual(q.config.tools,[{googleSearch:{}}]);
    assert.equal(q.config.maxOutputTokens,8192);
    assert.equal(q.config.thinkingConfig.thinkingLevel,'LOW');
    assert.deepEqual(q.config.responseSchema.required,['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems']);
    for(const instruction of ['Do not prescribe numerical buying/entry price targets','national total import forecasts separate from bilateral origin allocations','original publisher links','unrelated watch item'])assert(q.contents.includes(instruction));
    assert(!/typed-segments-v1|claim-contract-v5|evidence-constrained-plan-v1/.test(q.contents));
  }
  assert(requests[3].contents.includes('4232000')&&requests[3].contents.includes('not measured industrial extraction'));
  results.sameSearchModelSchemaControls=true;

  // Synthetic probes distinguish a reported market number from a buy instruction.
  for(const text of ['65~66 US¢/lb 선에서 근월물 안전재고 확보','65.9 US¢/lb 이하 매수',
    '목표 매수가 1450 USD/MT로 구매 검토','buy below 65 cents/lb'])
    assert(publisherProcurementIssues({deskRecommendation:text}).includes('unsupported-numerical-buying-target'),text);
  assert.deepEqual(publisherProcurementIssues({executiveSummary:'2026년 10월 21일 ZL 일봉은 잠정 65.94 US¢/lb로 1.66% 하락했습니다.',deskRecommendation:'실제 견적 비교 후 필요 물량 분할 매수 검토'}),[]);
  assert.deepEqual(publisherProcurementIssues({deskRecommendation:'베이시스 약세 여부 확인 후 실제 공급사 견적·운임·환율 비교를 통한 분할 매수 검토'}),[]);
  assert.deepEqual(publisherProcurementIssues({executiveSummary:'선물 하락이 현물 베이시스의 하락을 뜻하지는 않습니다.'}),[]);
  assert(publisherProcurementIssues({deskRecommendation:'베이시스 약세 구간 분할 계약 체결',watchItems:['실제 공급사 견적·운임·환율 확인']}).includes('unsupported-basis-direction'));
  assert(publisherProcurementIssues({executiveSummary:'베이시스 약세가 확인되었습니다. 베이시스 약세 구간 계약 체결을 권고합니다.'}).includes('unsupported-basis-direction'));

  const originalSources=diagnostic.request.evidence.facts.filter((f:any)=>f.id.startsWith('article-')).map((f:any)=>({url:f.sourceUrl,title:f.sourceTitle}));
  assert.deepEqual(publisherAttributionIssues(oil,originalSources),[],'real retained originals satisfy attribution check only, not a publication approval');
  const ers={executiveSummary:'USDA ERS 보고서에 따르면 전망이 변경되었습니다.'};
  assert(publisherAttributionIssues(ers,[{url:'https://example.org/?source=ers.usda.gov'}]).length);
  assert(publisherAttributionIssues(ers,[{url:'http://www.ers.usda.gov/publications/115629'}]).length);
  assert(publisherAttributionIssues(ers,[{url:'https://ers.usda.gov.evil.example/report'}]).length);
  assert.deepEqual(publisherAttributionIssues(ers,[{url:'https://www.ers.usda.gov/publications/115629'}]),[]);

  // A synthetic control report with safe procurement wording and correct scopes.
  // It is never persisted or presented as provider output.
  const safe={...oil,deskRecommendation:'실제 공급사 견적·베이시스·운임·환율 비교 후 필요 물량 분할 구매 검토',
    executiveSummary:'대두유 선물 일봉은 잠정 관측값이며 실제 도착원가와 구분해야 합니다. NOPA 회원사의 월간 재고 수치는 과거 미국 회원사 집계입니다. 세계 수급 전망과 구분합니다. USDA ERS의 연간 수급 전망은 관측된 실적과 구분해 검토해야 합니다. 미국 바이오연료 정책의 집행 일정은 확정되지 않았습니다. 현재 물리적 베이시스·운임·실행 환율·공급사 견적은 미확인 상태이므로 실제 조건을 비교한 후 구매 시점과 규모를 검토하는 대응이 적절합니다.',
    bullishFactors:['과거 회원사 재고 감소에 따른 미국 가공 여건 모니터링 필요','인도 총 대두유 수입 전망 5.6 million MT 및 주요 공급국인 남미의 수출 흐름 구분 확인'],
    bearishFactors:['미국 수확 진척에 따른 원료 공급 확대 가능성','바이오연료 정책 집행 시기 불확실성에 따른 수요 전망 변동']};
  acceptPublisherResearchReport(JSON.stringify(safe),'soybean-oil',oil.model,originalSources,oil.generatedAt);
  for(const quantity of ['5.6 million MT','6 million MT','560만 톤']){
    const bad={...safe,bullishFactors:['인도 남미산 대두유 수입 수요('+quantity+') 집중',safe.bullishFactors[0]]};
    assert(publisherResearchIntegrityIssues(bad,originalSources,'soybean-oil',RMS_PROCUREMENT_POLICY).includes('soybean-oil-import-total-not-south-american-allocation'));
  }
  // Adding missing links alone cannot rescue the actual unsafe original prose.
  assert.throws(()=>acceptPublisherResearchReport(diagnostic.response.text,'soybean-oil',oil.model,originalSources,oil.generatedAt),/unsupported-numerical-buying-target/);
  assert.deepEqual(hashes(),before,'all production diagnostics, rejected output, grants, ledgers and snapshots byte-identical');
  results.syntheticProbes='PASS, validator inputs only; no generation or persistence';
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'rms-publisher-parity-OFFLINE-'));
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  console.log('PASS: genuine Corn and corrected Wheat replay; genuine rejected Oil now rejects; unchanged Search/schema/controls; focused negative and safe controls; zero provider calls, grants or snapshot writes. '+out);
}finally{globalThis.fetch=native;}
