/** OFFLINE ONLY: actual installed SDK, no provider/network requests. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {GoogleGenAI} from '@google/genai';
import {buildPublisherResearchRequest,parsePublisherResearchResponse} from '../liveAiAnalysisService.ts';
import {searchGroundingDiagnostic} from '../searchGroundingDiagnostic.ts';
import {recordAnalysisDiagnostic} from '../analysisDiagnostics.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from '../stage3Runtime.ts';

const original='.rms-stage3/diagnostics/standalone-soybean-933f5d3f3071-1-soybean.json';
const hash=()=>createHash('sha256').update(fs.readFileSync(original)).digest('hex');const before=hash();
const retained=JSON.parse(fs.readFileSync(original,'utf8'));
assert.equal(retained.response.candidates[0].groundingMetadata,undefined);
assert.equal(retained.response.usageMetadata.billedToolCalls,undefined);
assert.equal(retained.response.candidates[0].content,undefined,'Original diagnostic did not preserve tool parts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-search-diagnostic-OFFLINE-'));
const native=globalThis.fetch;const oldRoot=process.env.RMS_ANALYSIS_RECOVERY_ROOT;
globalThis.fetch=async()=>{throw Error('External network prohibited');};
process.env.RMS_ANALYSIS_RECOVERY_ROOT=root;
let calls=0;let wire:any;
const body={candidates:[{finishReason:'STOP',content:{parts:[
  {toolCall:{toolType:'GOOGLE_SEARCH_WEB',args:{queries:['SECRET_QUERY']}}},
  {toolResponse:{toolType:'GOOGLE_SEARCH_WEB',response:{secret:'SECRET_RESULT',url:'https://example.org/not-a-citation'}}},
  {text:retained.response.text},
]}}],responseId:'OFFLINE_RESPONSE_7',usageMetadata:{promptTokenCount:732,candidatesTokenCount:888,toolUsePromptTokenCount:40,billedToolCalls:[{toolType:'GOOGLE_SEARCH_WEB',successfulToolCallCount:2,failedToolCallCount:0}]}};
try {
  const client=new GoogleGenAI({apiKey:'OFFLINE_KEY',httpOptions:{fetch:async(_url,init)=>{
    calls++;wire=JSON.parse(String(init?.body));return new Response(JSON.stringify(body),{status:200});
  }}});
  const response=await client.models.generateContent(buildPublisherResearchRequest('gemini-3.8-flash','soybean','2026-10-21',true));
  assert.equal(calls,1);assert.deepEqual(wire.tools,[{googleSearch:{}}]);
  assert.deepEqual(wire.toolConfig,{includeServerSideToolInvocations:true});
  assert.equal(wire.generationConfig.responseMimeType,'application/json');assert(wire.generationConfig.responseSchema.required.length===6);
  assert.equal(wire.generationConfig.thinkingConfig.thinkingLevel,'LOW');
  const observed=searchGroundingDiagnostic(response);
  assert.equal(observed.candidates[0].toolCalls[0].toolType,'GOOGLE_SEARCH_WEB');
  assert.equal(observed.candidates[0].toolResponses[0].toolType,'GOOGLE_SEARCH_WEB');
  assert.equal(observed.billedToolCalls?.[0].successfulToolCallCount,2,'SDK retains undeclared billing usage field');
  assert.equal(observed.responseId,'OFFLINE_RESPONSE_7');
  assert(!JSON.stringify(observed).includes('SECRET_'));assert(!JSON.stringify(observed).includes('not-a-citation'));
  await assert.rejects(parsePublisherResearchResponse(response,'soybean','OFFLINE'),/근거 링크/,'Tool execution does not replace publisher citations');
  const unknown=searchGroundingDiagnostic({candidates:[{content:{parts:[{text:'offline'}]}}]});
  assert.equal(unknown.billedToolCalls,undefined);assert.equal(unknown.toolUsePromptTokenCount,undefined);
  assert.equal(unknown.candidates[0].groundingMetadataPresent,false);
  assert.deepEqual(searchGroundingDiagnostic({usageMetadata:{billedToolCalls:[{toolType:'SECRET_KEY',successfulToolCallCount:-1,failedToolCallCount:'SECRET'}]}}).billedToolCalls,[{toolType:'OTHER',successfulToolCallCount:undefined,failedToolCallCount:undefined}]);
  // Metadata elsewhere is visible as tool telemetry, not guessed as grounding.
  for(const extra of [{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.org/guessed'}}]}},{sources:[{url:'https://example.org/guessed'}]}])
    await assert.rejects(parsePublisherResearchResponse({...response,...extra},'soybean','OFFLINE'),/근거 링크/);
  // Existing supported candidate grounding remains accepted; direct hosts are
  // the old Corn standard, not a new assertion of per-claim verification.
  const corn=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-corn.json','utf8')).payload.data;
  const good={text:JSON.stringify({...corn,deskRecommendation:'OFFLINE-MOCK: 분할 구매는 실제 공급사 견적, FOB 베이시스, 운임, 환율을 비교한 후 검토합니다.'}),candidates:[{groundingMetadata:{groundingChunks:corn.sources.map((s:any)=>({web:{uri:s.url,title:s.title}}))}}]};
  const accepted=await parsePublisherResearchResponse(good,'corn','OFFLINE');assert(accepted.sources.length>=2);
  // Query-only and unresolvable/private redirects remain rejected.
  for(const chunks of [[],[{web:{uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/offline'}}]])
    await assert.rejects(parsePublisherResearchResponse({text:good.text,candidates:[{groundingMetadata:{webSearchQueries:['OFFLINE'],groundingChunks:chunks}}]},'corn','OFFLINE'),/근거 링크/);
  const context:Stage3RunContext={runId:'OFFLINE-search-diagnostic',permitted:true,attempts:1,successfulCalls:1,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:.25};
  withAuthorizedStage3Run(context,()=>recordAnalysisDiagnostic('soybean','OFFLINE',response,Error('Missing citations'),{tools:wire.tools,toolConfig:wire.toolConfig}));
  const diagnostic=JSON.parse(fs.readFileSync(root+'/.rms-stage3/diagnostics/OFFLINE-search-diagnostic-1-soybean.json','utf8'));
  assert.deepEqual(diagnostic.response.searchDiagnostics,JSON.parse(JSON.stringify(observed)));
  assert(!JSON.stringify(diagnostic).includes('SECRET_'),'Tool queries/results are omitted from saved diagnostic');
  assert.equal(hash(),before);assert.equal(calls,1);
  console.log('PASS SDK Search invocation/billing preservation; bounded diagnostics; missing/alternate/invalid-source rejection; retained seventh response unchanged. '+root);
} finally {
  globalThis.fetch=native;
  if(oldRoot===undefined)delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;else process.env.RMS_ANALYSIS_RECOVERY_ROOT=oldRoot;
}
