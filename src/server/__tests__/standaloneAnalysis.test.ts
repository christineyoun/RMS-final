/** OFFLINE-MOCK only: real SDK serialization + shared factual validation; isolated stores. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {mock as clock} from 'node:test';
import {approveStandaloneRun,standaloneContext,standalonePreflight,runStandaloneAnalysis,STANDALONE_ANALYSIS_ALLOWLIST} from '../standaloneAnalysis.ts';
import {GoogleGenAI} from '../paidGeminiGuard.ts';import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {recordAnalysisDiagnostic} from '../analysisDiagnostics.ts';import {acquirePaidLease,hasOutstandingPaidRequest} from '../paidJobLease.ts';import {runAnalysisRecovery} from '../analysisRecovery.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));
clock.timers.enable({apis:['Date'],now:new Date(fixture.checkedAt)});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-standalone-OFFLINE-MOCK-')),native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Real network prohibited');};
let serial=0,http=0;const approval='soybean-publisher-search-v1',authorization='OFFLINE-MOCK-owner-approval';
const setup=()=>{const root=path.join(temp,String(++serial));process.env.RMS_ANALYSIS_RECOVERY_ROOT=root;process.env.RMS_STAGE3_RUNTIME_ROOT=root;approveStandaloneRun('soybean',approval,authorization,'Explicit OFFLINE-MOCK owner approval for one isolated test.');const ctx=standaloneContext('OFFLINE-MOCK-'+serial);return {root,ctx};};
const ev=fixture.packets.soybean,f=ev.facts.find((f:any)=>f.id==='psd-28'),second=ev.facts.find((f:any)=>f.id==='psd-176');
const mock:any={testOnly:'OFFLINE-MOCK-NOT-GEMINI',evidenceContractVersion:4,confidenceScore:60,bullishFactors:[],bearishFactors:[],watchItems:[],evidenceClaims:[]};
const fields=['deskRecommendation','executiveSummary','bullishFactors.0','bullishFactors.1','bearishFactors.0','bearishFactors.1','watchItems.0','watchItems.1'];
fields.forEach((field,i)=>{const text=[
'향후 대두 생산 전망이 변경되더라도 실제 공급사 견적과 환율을 확인한 후 구매 시점을 검토할 필요가 있습니다.',
'만약 대두 생산 전망이 향후 하향 수정된다면 해당 원료 조달 여건이 달라질 수 있습니다.',
'만약 대두 생산 전망이 상향 수정된다면 산지 공급 증가로 인해 구매 부담이 낮아질 가능성이 있습니다.',
'만약 대두 생산 전망이 하향 수정된다면 해당 제품 공급사 오퍼를 더 자주 점검할 필요가 있습니다.',
'만약 대두 생산 전망이 달라진다면 동일 범위의 공급 전망을 다시 비교할 필요가 있습니다.',
'만약 대두 생산 전망이 변경된다면 해당 원료 구매 시점을 다시 검토할 수 있습니다.',
'만약 대두 생산 전망이 새로 발표된다면 원문 수치를 모니터링할 필요가 있습니다.',
'만약 대두 생산 전망이 향후 수정된다면 실제 공급사 오퍼와 함께 확인할 수 있습니다.'
][i];const segments=[{kind:'fact',text:f.text,evidenceIds:[f.id],support:[]},...(i===1?[{kind:'fact',text:second.text,evidenceIds:[second.id],support:[]}]:[]),{kind:i===0?'recommendation':'conditional',text,evidenceIds:[f.id],support:[{evidenceId:f.id,aspect:'production'}]}];const [key,index]=field.split('.');if(index===undefined)mock[key]=segments.map(s=>s.text).join(' ');else mock[key][+index]=segments.map(s=>s.text).join(' ');mock.evidenceClaims.push({field,segments});});
const sdkResponse=(body=mock)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:200}});
const generate=(ctx:any,mode='success')=>async(id:string)=>{
 assert.equal(id,'soybean');const request=buildRecoveryAnalysisRequest('gemini-3.8-flash',id,ev,fixture.checkedAt.slice(0,10),'verified-only');assert.deepEqual(request.config.tools,[]);assert.equal(request.config.maxOutputTokens,8192);assert.equal(request.config.thinkingConfig.thinkingLevel,'LOW');
 const ai=new GoogleGenAI({apiKey:'OFFLINE-SECRET',httpOptions:{fetch:async(_url:any,init:any)=>{http++;assert.ok(init.signal);if(mode==='delay')return new Promise<Response>((resolve)=>setTimeout(()=>resolve(new Response(JSON.stringify(sdkResponse()),{status:200})),60));if(mode==='http-error')return new Response('{"error":{"message":"offline","code":503}}',{status:503});const body=structuredClone(mock);if(mode==='reject')body.executiveSummary='unsupported 9999999';if(mode==='fact-reject'){const claim=body.evidenceClaims[0];claim.segments[0].text+=' 생산량은 9999999 MT입니다.';body.deskRecommendation=claim.segments.map((s:any)=>s.text).join(' ');}const wire=mode==='success'?{outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:body.confidenceScore,evidenceClaims:body.evidenceClaims.map((c:any)=>({...c,segments:c.segments.map((s:any)=>{const v={...s};if(v.kind==='fact')delete v.text;return v;})}))}:body;return new Response(JSON.stringify({...sdkResponse(wire),...(mode==='over-budget'?{usageMetadata:{promptTokenCount:200000,candidatesTokenCount:20000}}:{})}),{status:200,headers:{'content-type':'application/json'}});}}});
 let response:any;try{response=await ai.models.generateContent(request);const data=parseGroundedAnalysis(response,'OFFLINE-MOCK',new Date(),ev,{requiredContractVersion:4});recordAnalysisDiagnostic(id,'OFFLINE-MOCK',response);return {success:true,testOnly:true,data};}catch(error){recordAnalysisDiagnostic(id,'OFFLINE-MOCK',response,error);throw error;}
};
try{
 assert.deepEqual(STANDALONE_ANALYSIS_ALLOWLIST,['soybean','soybean-oil','palm-oil','sugar','potato-starch']);
 {const {ctx}=setup();await assert.rejects(runStandaloneAnalysis('soybean','',authorization,ctx,generate(ctx)),/approval/);for(const id of ['tapioca-starch','unapproved-test'])assert.throws(()=>standalonePreflight(id,approval,authorization),/allowlisted/);assert.equal(http,0);}
 {for(const change of [{maxCalls:2},{maxEstimatedUsd:.45},{requestDeadlineMs:180000},{evidenceMode:'verified-only'},{analysisCommodity:'soybean-oil'}]){const {ctx}=setup();Object.assign(ctx,change);await assert.rejects(runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx)),/bounded controls/);}assert.equal(http,0);}
 {const {root,ctx}=setup();const before=http;const run=await runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx));assert.equal(run.status,'completed',JSON.stringify(run.failed));assert.equal(http-before,1);assert.equal(run.attempts,1);assert.equal(run.successfulCalls,1);assert.ok(run.estimatedUsd<.25);const saved=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json'),'utf8'));assert.equal(saved.payload.testOnly,true);assert.equal(saved.payload.data.model,'OFFLINE-MOCK');assert.equal(saved.payload.data.evidenceAudit.contractVersion,4);assert.throws(()=>standalonePreflight('soybean',approval,'different-owner-approval'),/snapshot/);assert.equal(hasOutstandingPaidRequest(),false);assert.ok(!fs.existsSync(path.join(root,'.rms-stage3/analysis-recovery.json')));}
 for(const mode of ['reject','fact-reject','http-error','over-budget']){const {root,ctx}=setup(),before=http;const run=await runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx,mode));assert.equal(run.status,'failed');assert.equal(http-before,1);assert.ok(!fs.existsSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json')));assert.throws(()=>standalonePreflight('soybean',approval,authorization),/already attempted/);assert.ok(fs.existsSync(path.join(root,'.rms-stage3/analysis-soybean-diagnostic.json')));}
 {const {root,ctx}=setup();ctx.deadlineAt=Date.now()+15;const before=http;const pending=runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx,'delay'));await new Promise(r=>setTimeout(r,5));await assert.rejects(runStandaloneAnalysis('soybean',approval,'duplicate-approval-id',standaloneContext('duplicate'),generate(ctx)),/running|attempted|Outstanding/);const run=await pending;assert.equal(run.status,'failed');assert.ok(ctx.cancelled);assert.equal(http-before,1);assert.equal(hasOutstandingPaidRequest(),true,'ignored abort keeps transport lease');await new Promise(r=>setTimeout(r,90));assert.equal(hasOutstandingPaidRequest(),false);assert.ok(!fs.existsSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json')),'late response cannot persist');}
 {const {ctx}=setup();const release=acquirePaidLease('analysis-job','OTHER-JOB');await assert.rejects(runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx)),/active/);release();const request=acquirePaidLease('request','OTHER-REQUEST');assert.throws(()=>standalonePreflight('soybean',approval,authorization),/Outstanding/);request();}
 {const {ctx,root}=setup();const original=generate(ctx);const run=await runStandaloneAnalysis('soybean',approval,authorization,ctx,async id=>{const body=await original(id);const file=path.join(root,'.rms-stage3/snapshots/analysis-soybean.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'concurrently saved');return body;});assert.equal(run.status,'failed');assert.equal(run.failed[0].stage,'persistence');assert.equal(fs.readFileSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json'),'utf8'),'concurrently saved');}
 {setup();await assert.rejects(runAnalysisRecovery('remaining','RETIRED-BATCH',async()=>{throw Error('Must not generate');},true),/execution retired/);}

 // A second occurrence requires a new explicit grant, never a fabricated revision.
 {const {root,ctx}=setup();const first=await runStandaloneAnalysis('soybean',approval,authorization,ctx,generate(ctx,'reject'));const original=JSON.stringify(first);
  assert.throws(()=>approveStandaloneRun('soybean',approval,authorization,'An already consumed approval must never be renewed.'),/already attempted/);
  const next='OFFLINE-MOCK-explicit-second';assert.throws(()=>standalonePreflight('soybean',approval,next),/approval record required/);
  assert.throws(()=>approveStandaloneRun('soybean-oil','soybean-oil-claim-contract-v5',next,'Other commodities remain disabled despite explicit request.'),/approval/);
  const grant=approveStandaloneRun('soybean',approval,next,'Explicit owner approval for ONE additional offline diagnostic.');assert.equal(grant.revision,first.revision);
  assert.throws(()=>approveStandaloneRun('soybean',approval,next,'Duplicate provisioning must preserve the immutable approval.'),/EEXIST/);
  const second=await runStandaloneAnalysis('soybean',approval,next,standaloneContext('OFFLINE-MOCK-second'),generate(ctx));assert.equal(second.status,'completed');
  const saved=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/standalone-analysis.json'),'utf8'));assert.equal(JSON.stringify(saved.runs[0]),original);assert.equal(saved.runs.length,2);assert.equal(saved.runs[1].authorizationId,next);
 }
 {const {root}=setup(),file=path.join(root,'.rms-stage3/manual-analysis-approvals',authorization+'.json'),grant=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const change of [{commodity:'soybean-oil'},{maxAttempts:2},{purpose:'scheduled'},{expiresAt:'2000-01-01T00:00:00Z'},{config:{...grant.config,maxEstimatedUsd:1}}]){fs.writeFileSync(file,JSON.stringify({...grant,...change}));assert.throws(()=>standalonePreflight('soybean',approval,authorization),/Invalid or expired/);}
 }
 // Exercise the actual HTTP gateway offline: authentication, allowlist, duplicate
 // controls, and a full mocked internal generation request. Never bind a socket.
 {const {root}=setup(),cwd=process.cwd();fs.mkdirSync(root,{recursive:true});process.chdir(root);
  try{
   const {createStage3Gateway,RETIRED_AI_CONTROLS,startStage3Scheduler}=await import('../stage3DailyUpdates.ts');const gateway=createStage3Gateway();
   const route=(url:string,method='GET',headers:any={})=>{let payload:any;const res:any={statusCode:0,setHeader(){},end(value:string){payload=JSON.parse(value);}};gateway({url,method,headers,socket:{remoteAddress:'127.0.0.1'}} as any,res,()=>{throw Error('Unexpected downstream execution');});return {code:res.statusCode,payload};};
   const beforeHttp=http;for(const url of RETIRED_AI_CONTROLS)for(const method of ['POST','GET'])assert.equal(route(url,method).code,410);startStage3Scheduler();assert.equal(http,beforeHttp);
   for(const id of ['wheat','corn','tapioca-starch']){const file=path.join(cwd,'.rms-stage3/snapshots/analysis-'+id+'.json'),saved=JSON.parse(fs.readFileSync(file,'utf8')),dest=path.join(root,'.rms-stage3/snapshots/analysis-'+id+'.json');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);const response=route('/api/ai-analysis/'+id);assert.equal(response.code,200);assert.equal(response.payload.data.executiveSummary,saved.payload.data.executiveSummary);assert.deepEqual(response.payload.data.sources,saved.payload.data.sources);assert.equal(fs.readFileSync(dest,'utf8'),fs.readFileSync(file,'utf8'));}
   assert.equal(route('/api/ai-analysis/soybean').code,503);
   const admin=fs.readFileSync(path.join(root,'.rms-stage3/admin-token'),'utf8').trim();
   const call=(method:string,commodity='soybean',headers:any={},remote='127.0.0.1')=>{let payload:any;const res:any={statusCode:0,setHeader(){},end(value:string){payload=JSON.parse(value);}};gateway({url:'/api/rms/control/standalone-analysis?commodity='+commodity,method,headers,socket:{remoteAddress:remote}} as any,res,()=>{throw Error('Must handle control route');});return {code:res.statusCode,payload};};
   assert.equal(call('POST').code,403);assert.equal(call('GET','soybean',{'x-rms-stage3-admin':admin}).code,403);
   const headers={'x-rms-stage3-admin':admin,'x-rms-paid-approval':approval,'x-rms-authorization-id':'OFFLINE-MOCK-gateway-approval'};
   assert.equal(call('POST','soybean',headers,'192.0.2.10').code,403);
   assert.equal(call('POST','soybean-oil',headers).code,409);assert.equal(call('POST','soybean',{...headers,'x-rms-paid-approval':''}).code,409);
   approveStandaloneRun('soybean',approval,headers['x-rms-authorization-id'],'Explicit OFFLINE-MOCK owner approval for one gateway test.');
   let internal=0;globalThis.fetch=async(url:any)=>{assert.match(String(url),/ai-analysis\/soybean\?force=true$/);internal++;const {getStage3RunContext}=await import('../stage3Runtime.ts');const ctx=getStage3RunContext()!;assert.equal(ctx.analysisCommodity,'soybean');assert.equal(route('/api/ai-analysis/soybean-oil?force=true','GET',{'x-rms-stage3-job':admin}).code,403);const {getGroundedAiAnalysis}=await import('../liveAiAnalysisService.ts');await assert.rejects(getGroundedAiAnalysis('soybean-oil',true),/explicit authorization/);return new Response(JSON.stringify(await generate(ctx)('soybean')),{status:200});};
   const result=call('POST','soybean',headers);assert.equal(result.code,202);assert.equal(result.payload.maxCalls,1);assert.equal(result.payload.maxEstimatedUsd,.25);
   assert.equal(call('POST','soybean',headers).code,409);
   for(let i=0;i<50&&!fs.existsSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json'));i++)await new Promise(r=>setTimeout(r,5));
   assert.equal(internal,1);assert.ok(fs.existsSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json')));assert.equal(call('POST','soybean',headers).code,409);
  }finally{process.chdir(cwd);globalThis.fetch=async()=>{throw Error('Real network prohibited');};}
 }
 console.log('PASS standalone: owner/allowlist gate, typed full mock + real SDK one-HTTP transport, schema/factual validation, exclusive persistence, failures, no repeats, parallel leases, deadline/late discard; legacy batch retired; independent selected commodity. ZERO paid calls. '+temp);
}finally{globalThis.fetch=native;clock.timers.reset();delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;delete process.env.RMS_STAGE3_RUNTIME_ROOT;}
