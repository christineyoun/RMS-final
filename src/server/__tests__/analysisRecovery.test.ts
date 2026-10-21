import {persistAnalysisSnapshot} from '../analysisSnapshotPersistence.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
import {runAnalysisRecovery,recoveryStatus} from '../analysisRecovery.ts';
import {GoogleGenAI} from '../paidGeminiGuard.ts';
import {recordAnalysisDiagnostic} from '../analysisDiagnostics.ts';
import {withAuthorizedStage3Run} from '../stage3Runtime.ts';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-analysis-recovery-'));
process.env.RMS_ANALYSIS_RECOVERY_ROOT=temp;
const body={confidenceScore:65,deskRecommendation:'실제 공급사 견적 비교 후 구매 검토',
  executiveSummary:'[OFFLINE FIXTURE ONLY] '+ '검증용 응답이며 실제 시장 분석이 아닙니다. 근거의 관측일과 원료 구분을 확인하고 베이시스, 운임, 환율 및 실제 공급사 견적을 비교해야 합니다. '.repeat(3),
  bullishFactors:['검증용 공급 근거','검증용 수요 근거'],bearishFactors:['검증용 재고 근거','검증용 수확 근거'],watchItems:['검증용 관측일 확인','검증용 원문 확인']};
const fixture=(data:any=body)=>({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'not JSON'},{text:JSON.stringify(data)}]},groundingMetadata:{webSearchQueries:['fixture only'],groundingChunks:[{web:{uri:'https://bad url'}},{web:{title:'Offline fixture',uri:'https://example.org/fixture'}}],
  groundingSupports:[{segment:{partIndex:1,startIndex:0,endIndex:Buffer.byteLength(JSON.stringify(data),'utf8'),text:JSON.stringify(data)},groundingChunkIndices:[1]}]}}]});
const payload=(response=fixture())=>({success:true,data:parseGroundedAnalysis(response,'mock-gemini')});
try {
  assert.throws(()=>new GoogleGenAI({apiKey:'mock'}),/blocked outside/);
  assert.equal(payload().data.sources.length,1,'bad citation must not discard valid ones');
  const fenced=fixture();const fencedText='```json\n'+JSON.stringify(body)+'\n```';fenced.candidates[0].content.parts=[{text:fencedText}];
  fenced.candidates[0].groundingMetadata.groundingSupports=[{segment:{partIndex:0,startIndex:0,endIndex:Buffer.byteLength(fencedText,'utf8'),text:fencedText},groundingChunkIndices:[1]}];assert.ok(payload(fenced).data.executiveSummary);
  const sdk=fixture();delete sdk.candidates[0].content;(sdk as any).text=JSON.stringify(body);assert.equal(payload(sdk).data.confidenceScore,65);
  const badJson=fixture();badJson.candidates[0].content.parts=[{text:'{"truncated":'}];assert.throws(()=>payload(badJson),(e:AnalysisValidationError)=>e.stage==='parsing');
  const short=fixture({...body,executiveSummary:'short',confidenceScore:'65',watchItems:['one']});
  assert.throws(()=>payload(short),(e:AnalysisValidationError)=>e.stage==='schema'&&e.issues.length===3);
  const noSources=fixture();noSources.candidates[0].groundingMetadata.groundingChunks=[];assert.throws(()=>payload(noSources),(e:AnalysisValidationError)=>e.stage==='grounding');
  const cut=fixture();cut.candidates[0].finishReason='MAX_TOKENS';assert.throws(()=>payload(cut),/MAX_TOKENS/);
  assert.throws(()=>payload({promptFeedback:{blockReason:'SAFETY'}} as any),/SAFETY/);
  let calls=0;const generate=async()=>{calls++;return payload();};
  await assert.rejects(runAnalysisRecovery('palm','retired',generate,true),/execution retired/);
  await assert.rejects(runAnalysisRecovery('remaining','retired',generate,true),/execution retired/);assert.equal(calls,0);
  assert.equal(recoveryStatus().retired,true);
  const snapshotDir=path.join(temp,'.rms-stage3/snapshots');fs.mkdirSync(snapshotDir,{recursive:true});
  for(const id of ['wheat','corn','tapioca-starch'])fs.writeFileSync(path.join(snapshotDir,'analysis-'+id+'.json'),'protected '+id);
  persistAnalysisSnapshot(path.join(temp,'.rms-stage3'),'soybean','OFFLINE-MOCK-INDEPENDENT',payload());
  for(const id of ['wheat','corn','tapioca-starch'])assert.equal(fs.readFileSync(path.join(snapshotDir,'analysis-'+id+'.json'),'utf8'),'protected '+id);
  assert.throws(()=>persistAnalysisSnapshot(path.join(temp,'.rms-stage3'),'soybean','repeat',payload()),/persistence/);
  const other=path.join(temp,'failure');process.env.RMS_ANALYSIS_RECOVERY_ROOT=other;
  const ctx={runId:'offline-diagnostic',permitted:true,attempts:1,successfulCalls:0,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:0.25};
  withAuthorizedStage3Run(ctx,()=>recordAnalysisDiagnostic('palm-oil','mock-gemini',noSources,new AnalysisValidationError('grounding',['no-valid-google-search-grounding-chunks'])));
  const diagnostic=JSON.parse(fs.readFileSync(path.join(other,'.rms-stage3/analysis-palm-oil-diagnostic.json'),'utf8'));
  assert.equal(diagnostic.stage,'grounding');assert.equal(diagnostic.response.candidates[0].finishReason,'STOP');assert.ok(diagnostic.response.text);
  process.env.RMS_ANALYSIS_RECOVERY_ROOT=path.join(temp,'persistence');
  const file=path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT!,'.rms-stage3/snapshots/analysis-palm-oil.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'concurrently saved snapshot');
  assert.throws(()=>persistAnalysisSnapshot(path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT!,'.rms-stage3'),'palm-oil','mock-persistence',payload()),/persistence/);
  assert.equal(fs.readFileSync(file,'utf8'),'concurrently saved snapshot');
  console.log('PASS: REST parts/SDK getter; JSON/schema/grounding/finish errors; retired runner blocked; independent snapshot persistence and preservation; zero paid calls.');
}finally{delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;fs.rmSync(temp,{recursive:true,force:true});}
