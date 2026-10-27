import {mock as testClock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {collectAnalysisEvidence,type AnalysisEvidence,type AnalysisFact} from '../analysisEvidence.ts';
import {validateConditionalReasoning} from '../analysisReasoning.ts';
import {factClaimContext,type ClaimSupport} from '../analysisClaimSupport.ts';
import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {STANDALONE_ANALYSIS_CONFIG} from '../standaloneAnalysis.ts';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));


const now=new Date(frozen.checkedAt);
testClock.timers.enable({apis:['Date'],now});
const ids=['palm-oil','soybean','soybean-oil','sugar','potato-starch'];
const fixtures=['2f654d767230','a1128feff43d'].map(id=>'.rms-stage3/diagnostics/analysis-recovery-palm-'+id+'-1-palm-oil.json');
const protectedFiles=[...fixtures,'.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/analysis-recovery.json','.rms-stage3/settings.json',
  ...fs.readdirSync('.rms-stage3/snapshots',{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.parentPath+'/'+e.name),
  ...fs.readdirSync('.rms-price-history').filter(n=>n.endsWith('.json')).map(n=>'.rms-price-history/'+n)];
const hash=()=>protectedFiles.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')).join(':');
const before=hash(),nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Network and paid requests prohibited');};
const verdict=(text:string,refs:AnalysisFact[],kind:'conditional'|'recommendation'='conditional',support?:ClaimSupport[])=>validateConditionalReasoning(text,refs,{kind,support});
const pass=(text:string,refs:AnalysisFact[],kind:'conditional'|'recommendation'='conditional',support?:ClaimSupport[])=>assert.deepEqual(verdict(text,refs,kind,support).issues,[],text);
const fail=(text:string,refs:AnalysisFact[],reason:string,kind:'conditional'|'recommendation'='conditional',support?:ClaimSupport[])=>assert.ok(verdict(text,refs,kind,support).issues.some(i=>i.includes(reason)),text+' must fail '+reason);
const raw=(a:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(a)}]}}]});
const clone=<T>(x:T):T=>structuredClone(x);
const set=(a:any,field:string,segments:any[])=>{a.evidenceClaims.find((c:any)=>c.field===field).segments=segments;const [key,index]=field.split('.');const text=segments.map(s=>s.text).join(' ');if(index===undefined)a[key]=text;else a[key][+index]=text;};

try{
  const replays=fixtures.map(file=>{
    assert.equal(fs.statSync(file).mode&0o077,0,'private retained raw response');
    const d=JSON.parse(fs.readFileSync(file,'utf8')),a=JSON.parse(d.response.text),ev:AnalysisEvidence=d.request.evidence;
    const claims=a.evidenceClaims.flatMap((c:any)=>c.segments.map((s:any,index:number)=>({field:c.field,index,...s}))).map((s:any)=>{
      const refs=s.evidenceIds.map((id:string)=>ev.facts.find(f=>f.id===id));
      const issues=s.kind==='conditional'?verdict(s.text,refs).issues:
        s.kind==='fact'?(refs.length===1&&refs[0]?.text===s.text?[]:['unsupported-factual-claim']):
        refs.length===1&&refs[0]?.interpretations?.includes(s.text)?[]:['unsupported-interpretation'];
      return {...s,passed:issues.length===0,issues};
    });
    let full:any;
    try{parseGroundedAnalysis(d.response,d.model,new Date(d.recordedAt),ev);full={passed:true};}
    catch(e){assert.ok(e instanceof AnalysisValidationError);full={passed:false,stage:e.stage,issues:e.issues};}
    assert.equal(full.passed,false,'real rejected responses must not be promoted');
    assert.ok(claims.filter((c:any)=>c.kind==='fact').every((c:any)=>c.passed),'exact original factual segments remain valid');
    return {file,runId:d.runId,rawSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),full,claims};
  });
  const old=replays[0].claims.filter((c:any)=>c.kind==='conditional');
  assert.deepEqual(old.filter((c:any)=>c.passed).map((c:any)=>c.field),['bearishFactors.0','bearishFactors.1','watchItems.1']);
  assert.ok(old.find((c:any)=>c.field==='bullishFactors.1').issues.includes('unsupported-inventory-adequacy'));
  const latest=replays[1].claims.filter((c:any)=>c.kind==='conditional');
  assert.equal(latest.filter((c:any)=>c.passed).length,5);
  assert.ok(latest.find((c:any)=>c.field==='executiveSummary'&&c.text.includes('정제유 조달 원가')).issues.includes('unsupported-physical-cost-conclusion'));
  assert.ok(latest.find((c:any)=>c.field==='deskRecommendation').issues.includes('unsupported-observed-price-trend'));
  assert.ok(!latest.find((c:any)=>c.field==='deskRecommendation').issues.includes('unqualified-factual-or-predictive-statement'),'더라도 is recognized');
  assert.ok(!latest.find((c:any)=>c.field==='watchItems.1').issues.includes('unqualified-consequence'),'모니터링 recommendation is recognized');
  assert.ok(latest.find((c:any)=>c.field==='bearishFactors.1').issues.includes('unsupported-observed-price-trend'));

  const d=JSON.parse(fs.readFileSync(fixtures[1],'utf8')),ev:AnalysisEvidence=d.request.evidence;
  const get=(id:string)=>ev.facts.find(f=>f.id===id)!;
  const cpo=get('palm-cpo-2026-10-19'),stocks=get('psd-176'),production=get('psd-28'),consumption=get('psd-125');
  const rise=get('comparison-palm-cpo-2026-10-14--palm-cpo-2026-10-19');
  const interval=get('comparison-palm-cpo-2026-10-12--palm-cpo-2026-10-19');
  const olein=get('palm-olein-2026-10-15'),decline=get('comparison-palm-olein-2026-09-10--palm-olein-2026-10-15');
  const article=ev.facts.find(f=>f.id.startsWith('article-'))!,balance=get('psd-forecast-stock-balance');
  assert.ok(factClaimContext(article).aspects.includes('inventory-change'),'English original quotation conveys inventory context');
  pass('반면 말레이시아 재고 증가가 공급 부담으로 인식된다면 CPO 및 올레인 가격 상승폭이 제한될 수 있습니다.',[article]);
  const concession=latest.find((c:any)=>c.field==='deskRecommendation').text;
  pass(concession,[rise]); // same real Gemini sentence, correct comparison ID
  const review=latest.find((c:any)=>c.field==='watchItems.1').text;
  pass(review,[balance,production]); // same sentence, both actual metric records
  fail(review,[balance],'metric-mismatch:production');
  const dualForecast=latest.find((c:any)=>c.field==='executiveSummary'&&c.text.includes('연간 생산 및 소비')&&!c.passed).text;
  pass(dualForecast,[production,consumption]);
  fail(dualForecast,[stocks],'metric-mismatch');
  const recommendation='최근 CPO 가격 상승을 고려하면 단기 구매 물량을 분할 검토하되, 환율과 공급사 견적을 확인한 후 확정하는 것이 적절합니다.';
  pass(recommendation,[interval],'recommendation',[{evidenceId:interval.id,aspect:'interval-change'}]);
  fail(recommendation,[cpo],'unsupported-observed-interval-change','recommendation');
  pass('CPO 가격 상승을 고려해 단기 구매를 분할 검토하고 실제 공급사 견적을 확인하는 것이 적절합니다.',[interval],'recommendation');
  pass('향후 RBD Olein 가격이 하락한다면 실제 공급사 견적과 환율을 확인한 후 구매 시점을 검토할 필요가 있습니다.',[olein],'recommendation');
  pass('향후 팜유 재고가 타이트해질 경우, 실제 공급사 오퍼를 다시 비교할 필요가 있습니다.',[stocks]);
  fail('현재 팜유 재고가 타이트한 점을 고려하면 실제 공급사 견적을 확인한 후 분할 구매를 검토할 필요가 있습니다.',[stocks],'inventory-adequacy','recommendation');
  fail('팜유의 심각하게 부족한 재고가 유지된다면 구매 비용이 높아질 가능성이 있습니다.',[stocks],'inventory-adequacy');
  fail('만약 RBD Olein 가격 약세가 지속된다면 조달 비용이 줄어들 수 있습니다.',[decline],'unsupported-observed-price-trend');
  fail('만약 RBD Olein 가격 약세가 지속된다면 조달 비용이 줄어들 수 있습니다.',[decline,rise],'irrelevant-evidence-reference');
  fail('만약 CPO 가격이 상승한다면 이미 팜유 수요가 견조하므로 조달 비용이 높아질 가능성이 있습니다.',[cpo],'observed-market-trend');
  fail('만약 CPO 가격이 상승한다면 조달 물량의 50%를 구매할 수 있습니다.',[cpo],'unsupported-number');
  fail('만약 대두유 생산 전망이 바뀐다면 실제 공급사 오퍼를 비교할 수 있습니다.',[production],'subject-mismatch');
  fail('만약 CPO 가격이 상승한다면 공급사 오퍼를 비교할 수 있습니다.',[cpo,stocks],'irrelevant-evidence-reference');
  fail('만약 CPO 가격이 상승한다면 조달 비용이 높아질 수 있습니다.',[cpo],'unsupported-structured-claim-support','conditional',[{evidenceId:cpo.id,aspect:'sustained-price-trend'}]);
  fail('만약 CPO 가격이 상승한다면 조달 비용이 높아질 수 있습니다.',[cpo],'unsupported-structured-claim-support','conditional',[{evidenceId:olein.id,aspect:'price-level'}]);

  // All five actual evidence adapters, realistic supply/proxy scenarios and full
  // mocked reports. No rewriting or saving of an authentic response as success.
  const commodityResults=[];
  for(const id of ids){
    const evidence=structuredClone(frozen.packets[id]);
    const f=id==='potato-starch'?evidence.facts.find(f=>!f.comparison)!:evidence.facts.find(f=>f.id==='psd-28')!;
    const second=id==='potato-starch'?evidence.facts.find(other=>other.id!==f.id&&!other.comparison)!:evidence.facts.find(f=>f.id==='psd-176')!;
    assert.ok(f&&second,id+' original records');
    const aspect=id==='potato-starch'?'production-proxy':'production';
    const topic=id==='potato-starch'?'원료감자':f.topic;
    const metric=id==='potato-starch'?'생산량 대리지표':'생산 전망';
    const conditions=[
      `향후 ${topic} ${metric}가 변경되더라도 실제 공급사 견적과 환율을 확인한 후 구매 시점을 검토할 필요가 있습니다.`,
      `만약 ${topic} ${metric}가 향후 하향 수정된다면 해당 원료 조달 여건이 달라질 수 있습니다.`,
      `만약 ${topic} ${metric}가 상향 수정된다면 산지 공급 증가로 인해 구매 부담이 낮아질 가능성이 있습니다.`,
      `만약 ${topic} ${metric}가 하향 수정된다면 해당 제품 공급사 오퍼를 더 자주 점검할 필요가 있습니다.`,
      `만약 ${topic} ${metric}가 달라진다면 동일 범위의 공급 전망을 다시 비교할 필요가 있습니다.`,
      `만약 ${topic} ${metric}가 변경된다면 해당 원료 구매 시점을 다시 검토할 수 있습니다.`,
      `만약 ${topic} ${metric}가 새로 발표된다면 원문 수치를 모니터링할 필요가 있습니다.`,
      `만약 ${topic} ${metric}가 향후 수정된다면 실제 공급사 오퍼와 함께 확인할 수 있습니다.`,
    ];
    const fields=['deskRecommendation','executiveSummary','bullishFactors.0','bullishFactors.1','bearishFactors.0','bearishFactors.1','watchItems.0','watchItems.1'];
    const mock:any={evidenceContractVersion:4,confidenceScore:60,bullishFactors:[],bearishFactors:[],watchItems:[],evidenceClaims:fields.map(field=>({field,segments:[]}))};
    fields.forEach((field,i)=>{
      const segments=[{kind:'fact',text:f.text,evidenceIds:[f.id],support:[]},
        ...(i===1?[{kind:'fact',text:second.text,evidenceIds:[second.id],support:[]}]:[]),
        {kind:i===0?'recommendation':'conditional',text:conditions[i],evidenceIds:[f.id],support:[{evidenceId:f.id,aspect}]}];
      set(mock,field,segments);
    });
    const result=parseGroundedAnalysis(raw(mock),'OFFLINE-MOCK',now,evidence,{requiredContractVersion:4});
    assert.equal(result.evidenceAudit?.version,4);assert.equal(result.deskRecommendation,mock.deskRecommendation);
    const bound={outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:mock.confidenceScore,evidenceClaims:clone(mock.evidenceClaims)};for(const c of bound.evidenceClaims)for(const segment of c.segments)if(segment.kind==='fact')delete segment.text;const resolved=parseGroundedAnalysis(raw(bound),'OFFLINE-MOCK-BOUND',now,evidence,{requiredContractVersion:4});assert.equal(resolved.deskRecommendation,result.deskRecommendation);assert.deepEqual(resolved.sources,result.sources);
    if(id==='palm-oil'){
      const userExample=clone(mock),basis=evidence.facts.find(f=>f.id===interval.id)!;
      set(userExample,'deskRecommendation',[
        {kind:'fact',text:basis.text,evidenceIds:[basis.id],support:[]},
        {kind:'recommendation',text:recommendation,evidenceIds:[basis.id],support:[{evidenceId:basis.id,aspect:'interval-change'}]},
      ]);
      assert.equal(parseGroundedAnalysis(raw(userExample),'OFFLINE-MOCK',now,evidence,{requiredContractVersion:4}).deskRecommendation,
        userExample.deskRecommendation,'exact user recommendation passes full pipeline without known future offers or mandatory freight wording');
    }
    const legacy=clone(mock);delete legacy.evidenceContractVersion;
    assert.throws(()=>parseGroundedAnalysis(raw(legacy),'mock',now,evidence,{requiredContractVersion:4}),/required-evidence-contract-version/);
    const fake=clone(mock);fake.evidenceClaims[0].segments.at(-1).support=[{evidenceId:f.id,aspect:'inventory-adequacy'}];
    assert.throws(()=>parseGroundedAnalysis(raw(fake),'mock',now,evidence),/unsupported-structured/);
    const absent=clone(mock);delete absent.evidenceClaims[0].segments.at(-1).support;
    assert.throws(()=>parseGroundedAnalysis(raw(absent),'mock',now,evidence),/missing-structured/);
    const badNumber=clone(mock);const segments=badNumber.evidenceClaims[0].segments;segments[0].text+=' 생산량은 9999999 MT입니다.';set(badNumber,'deskRecommendation',segments);
    assert.throws(()=>parseGroundedAnalysis(raw(badNumber),'mock',now,evidence),/unsupported-factual/);
    const failedSource=clone(evidence);failedSource.facts[0].verification='url-only' as any;
    assert.throws(()=>parseGroundedAnalysis(raw(mock),'mock',now,failedSource),/failed-source-verification/);
    const invented=clone(mock);invented.sources=[{url:'https://fake.example/fiction'}];
    assert.throws(()=>parseGroundedAnalysis(raw(invented),'mock',now,evidence),/fabricated-or-unverified-source-url/);
    const request=buildRecoveryAnalysisRequest('gemini-3.8-flash',id,evidence,'2026-10-20','verified-only','claims');
    assert.deepEqual(request.config.tools,[]);assert.equal(request.config.maxOutputTokens,8192);assert.equal(request.config.thinkingConfig.thinkingLevel,'LOW');
    assert.ok(request.config.responseSchema.required.includes('evidenceContractVersion'));
    assert.ok(request.contents.includes('INTERVAL CHANGE')&&request.contents.includes('SUSTAINED TREND')&&request.contents.includes('STOCK ADEQUACY'));
    const schema=request.config.responseSchema.properties.evidenceClaims.items.properties.segments.items;
    assert.ok(schema.properties.kind.enum.includes('recommendation'));assert.ok(schema.required.includes('support'));
    assert.deepEqual(schema.properties.evidenceIds.items.enum,evidence.facts.map(f=>f.id));
    commodityResults.push({id,records:evidence.facts.length,fullMockPassed:true,unsupportedSupportRejected:true,failedSourcesRejected:true,originalProseUnchanged:true});
  }
  assert.equal(hash(),before,'both raw responses, all snapshots/prices/paid logs/settings unchanged');
  assert.deepEqual(STANDALONE_ANALYSIS_CONFIG,{revision:'publisher-search-v1',acceptance:'wheat-corn-publisher-search',model:'gemini-3.8-flash',maxCalls:1,maxEstimatedUsd:0.25,
    requestDeadlineMs:60000,jobDeadlineMs:75000,maxOutputTokens:8192,thinking:'LOW',evidenceMode:'search',search:true});
  if(process.env.RMS_OFFLINE_REPLAY_REPORT)fs.writeFileSync(process.env.RMS_OFFLINE_REPLAY_REPORT,JSON.stringify({checkedAt:new Date().toISOString(),paidCalls:0,promoted:false,replays,commodityResults},null,2),{mode:0o600});
  console.log('PASS: both exact Palm replays; concessive/monitoring forms; bilingual ID/metric context; interval-based purchasing; unsupported trends/tightness; specific references; typed claim contract; all five full mock reports; numerical/citation/source failures; zero network/paid calls or promotion.');
}finally{testClock.timers.reset();globalThis.fetch=nativeFetch;}
