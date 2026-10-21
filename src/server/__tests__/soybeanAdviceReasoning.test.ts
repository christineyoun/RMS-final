/** Exact retained response, offline replay only. Never alters or persists analysis. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {mock as clock} from 'node:test';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {validateConditionalReasoning} from '../analysisReasoning.ts';import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
const original='.rms-stage3/diagnostics/standalone-soybean-0b72187f5350-1-soybean.json',d=JSON.parse(fs.readFileSync(original,'utf8')),body=JSON.parse(d.response.text),evidence=d.request.evidence;
const palmFixtures=['2f654d767230','a1128feff43d','250269cc4217'].map(id=>'.rms-stage3/diagnostics/analysis-recovery-palm-'+id+'-1-palm-oil.json');
const protectedFiles=[original,...palmFixtures,'.rms-stage3/standalone-analysis.json','.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/analysis-recovery.json','.rms-stage3/settings.json',...fs.readdirSync('.rms-stage3/snapshots').map(f=>'.rms-stage3/snapshots/'+f)];const hashes=()=>protectedFiles.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join(':');const before=hashes(),native=globalThis.fetch;
clock.timers.enable({apis:['Date'],now:new Date(d.recordedAt)});globalThis.fetch=async()=>{throw Error('Network and paid generation prohibited');};
const segment=(field:string)=>body.evidenceClaims.find((c:any)=>c.field===field).segments.find((s:any)=>s.kind!=='fact');
const fact=(id:string)=>evidence.facts.find((f:any)=>f.id===id);
const refs=(s:any)=>s.evidenceIds.map(fact);
const verdict=(s:any)=>validateConditionalReasoning(s.text,refs(s),{kind:s.kind,support:s.support});
const raw=(b:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(b)}]}}]});
const parse=(b:any=body,ev:any=evidence)=>parseGroundedAnalysis(raw(b),'OFFLINE-REPLAY-NOT-NEW-GEMINI',new Date(d.recordedAt),ev,{requiredContractVersion:4});
const replace=(b:any,field:string,s:any)=>{const claim=b.evidenceClaims.find((c:any)=>c.field===field);claim.segments[claim.segments.findIndex((v:any)=>v.kind!=='fact')]=s;const [key,index]=field.split('.');const text=claim.segments.map((v:any)=>v.text).join(' ');if(index===undefined)b[key]=text;else b[key][+index]=text;};
const advice=(text:string,id:string,aspect:string)=>({kind:'recommendation',text,evidenceIds:[id],support:[{evidenceId:id,aspect}]});
try{
 const request=buildRecoveryAnalysisRequest('gemini-3.8-flash','soybean',evidence,d.recordedAt.slice(0,10),'verified-only');
 for(const rule of ['CAUSAL AND PROCUREMENT DISCIPLINE','Actual physical procurement costs','evidenceIds must match support','natural, professional Korean','at least three directional observations','supplier quotations','An if-clause or a modal does not supply it'])assert.ok(request.contents.includes(rule),rule);
 assert.deepEqual(request.config.tools,[]);assert.equal(request.config.maxOutputTokens,8192);assert.equal(request.config.thinkingConfig.thinkingLevel,'LOW');
 const results=['deskRecommendation','executiveSummary','watchItems.0','watchItems.1'].map(field=>({field,text:segment(field).text,evidenceIds:segment(field).evidenceIds,before:d.issues.filter((i:string)=>i.endsWith(':'+field)),after:verdict(segment(field))}));
 for(const field of ['deskRecommendation','watchItems.0','watchItems.1'])assert.deepEqual(verdict(segment(field)).issues,[],field);
 assert.equal(verdict(segment('watchItems.0')).classification,'monitoring-recommendation');
 assert.ok(verdict(segment('executiveSummary')).issues.includes('unsupported-physical-cost-continuation'));
 let originalIssues:string[]=[];assert.throws(()=>parse(),(error:any)=>{assert.ok(error instanceof AnalysisValidationError);originalIssues=error.issues;return error.stage==='sources'&&error.issues.includes('unsupported-physical-cost-continuation:executiveSummary')&&!error.issues.some((i:string)=>/:(deskRecommendation|watchItems\.[01])$/.test(i));});
 // A labeled in-memory mock changing ONLY the unsupported summary is used
 // to ensure negative full-contract tests fail for their intended defect.
 // The retained original above remains unchanged and rejected; nothing saves.
 const supportedMock=structuredClone(body);supportedMock.testOnly='OFFLINE-MOCK-NOT-ORIGINAL-NOT-FOR-PERSISTENCE';
 const supportedSummary={...segment('executiveSummary'),text:'만약 향후 세계 대두 생산 전망이 수정된다면 실제 공급사 견적을 비교해 구매 시점을 검토할 필요가 있습니다.'};
 replace(supportedMock,'executiveSummary',supportedSummary);
 // Regional supply extrapolation is not a supported positive fixture.
 const planting=segment('bearishFactors.1');replace(supportedMock,'bearishFactors.1',{...planting,kind:'recommendation',text:"브라질 마토그로소 대두 파종 진척을 점검하고 실제 공급사 오퍼를 비교할 필요가 있습니다."});assert.equal(parse(supportedMock).status,'live');
 const desk=segment('deskRecommendation'),stock=segment('watchItems.0'),offer=segment('watchItems.1'),stockId=stock.evidenceIds[0],offerId=offer.evidenceIds[0];
 for(const phrase of ['고려할 때','고려해','고려하여'])assert.deepEqual(verdict({...desk,text:desk.text.replace('고려할 때',phrase)}).issues,[]);
 assert.deepEqual(verdict(advice('만약 미국 대두 기말재고 전망이 변경된다면 실제 공급사 견적을 확인한 후 분할 구매를 검토할 필요가 있습니다.',stockId,'inventory-level')).issues,[]);
 assert.deepEqual(verdict(advice('미국 대두 기말재고 전망 수정 여부를 모니터링할 필요가 있습니다.',stockId,'inventory-level')).issues,[]);
 assert.deepEqual(verdict(advice('향후 미국 대두 선물 가격이 변동한다면 실제 공급사 견적과 환율을 확인한 후 구매 시점을 검토할 필요가 있습니다.',desk.evidenceIds[0],'interval-change')).issues,[]);
 const negatives=[
  advice('대두 가격이 하락하는 만큼 공급사 견적을 비교 검토할 필요가 있습니다.',offerId,'price-level'),
  advice('대두 공급이 감소할 전망이니 공급사 오퍼를 비교 검토할 필요가 있습니다.','psd-28','production'),
  advice('가격이 상승할 것이므로 실제 공급사 견적을 비교 검토할 필요가 있습니다.',offerId,'price-level'),
  advice('공급이 감소했으므로 실제 공급사 오퍼를 비교 검토할 필요가 있습니다.','psd-28','production'),
  advice('예상되는 대두 가격 상승을 고려할 때 실제 공급사 견적을 비교 검토할 필요가 있습니다.',desk.evidenceIds[0],'interval-change'),
  advice('부족한 미국 대두 재고를 점검할 필요가 있습니다.',stockId,'inventory-level'),
  advice('브라질 대두 기말재고 전망 수정 여부를 점검할 필요가 있습니다.',stockId,'inventory-level'),
  advice('세계 대두 기말재고 전망 수정 여부를 점검할 필요가 있습니다.',stockId,'inventory-level'),
  advice('최근 실제 도입 원가 하락을 고려할 때 분할 구매를 검토할 필요가 있습니다.',desk.evidenceIds[0],'interval-change'),
  advice('대두 원가 하방 안정세가 이어질 수 있으므로 공급사 견적을 비교 검토할 필요가 있습니다.','psd-28','production'),
  advice('반드시 구매 단가 하락이 보장되므로 공급사 견적을 비교 검토할 필요가 있습니다.',offerId,'price-level'),
  advice('미국 대두 기말재고 전망 수정 여부를 점검할 필요가 있습니다.',offerId,'price-level'),
  advice('FOB 대두 가격차를 비교 검토할 필요가 있습니다.',offerId,'inventory-level'),
  advice('대두 가격 450 USD/MT를 확인한 후 구매를 검토할 필요가 있습니다.',offerId,'price-level'),
  advice('2026-10-22 대두 가격을 확인한 후 구매를 검토할 필요가 있습니다.',offerId,'price-level'),
 ];
 for(const s of negatives)assert.ok(verdict(s).issues.length,s.text);
 assert.ok(verdict({...offer,support:[]}).issues.includes('missing-structured-claim-support'));
 const lexicalSummary={...segment('executiveSummary'),text:segment('executiveSummary').text.replace('공급 전망','생산 전망')};assert.ok(verdict(lexicalSummary).issues.includes('unsupported-physical-cost-continuation'),'Even a recognized production metric cannot confer physical-cost support');
 for(const mutate of [(s:string)=>s.replace('USDA ERS','FAKE USDA ERS'),(s:string)=>s.replace('315','999'),(s:string)=>s.replace('million bushels','MMT'),(s:string)=>s.replace('미국','브라질'),(s:string)=>s.replace('2026-10-15','2026-10-22')]){
  const b=structuredClone(supportedMock),c=b.evidenceClaims.find((c:any)=>c.field==='watchItems.0');c.segments[0].text=mutate(c.segments[0].text);b.watchItems[0]=c.segments.map((s:any)=>s.text).join(' ');assert.throws(()=>parse(b),(e:any)=>e.issues.some((i:string)=>i==='unsupported-factual-claim:watchItems.0'));
 }
 const unknown=structuredClone(supportedMock),bad=structuredClone(offer);bad.evidenceIds=['invented-evidence'];bad.support=[{evidenceId:'invented-evidence',aspect:'price-level'}];replace(unknown,'watchItems.1',bad);assert.throws(()=>parse(unknown),(e:any)=>e.issues.includes('unknown-or-fabricated-citation:watchItems.1'));
 const failed=structuredClone(evidence);failed.facts[0].verification='url-only';assert.throws(()=>parse(body,failed),/failed-source-verification/);
 const invented=structuredClone(supportedMock);invented.sources=[{url:'https://fabricated.example/no-proof'}];assert.throws(()=>parse(invented),/fabricated-or-unverified-source-url/);
 // No positive mock or rejected response is saved. The unmodified original
 // is replayed separately; its original summary is still a blocking rejection.
 assert.equal(fs.existsSync('.rms-stage3/snapshots/analysis-soybean.json'),false);assert.equal(hashes(),before);
 const palmReplays=palmFixtures.map(file=>{const retained=JSON.parse(fs.readFileSync(file,'utf8'));let issues:string[]=[];assert.throws(()=>parseGroundedAnalysis(retained.response,retained.model,new Date(retained.recordedAt),retained.request.evidence),(error:any)=>{issues=error.issues;return issues.some((v:string)=>/unsupported-observed-price-trend|unsupported-inventory-adequacy|unsupported-observed-market-trend/.test(v));});return {file,rejected:true,issues};});
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'rms-advice-offline-'));fs.writeFileSync(path.join(out,'replay.json'),JSON.stringify({runId:d.runId,paidCalls:0,promoted:false,results,originalCompleteResponseRejected:true,originalIssues,negativeCases:negatives.length,palmReplays},null,2),{mode:0o600});fs.writeFileSync('/tmp/rms-advice-offline-result',out);
 console.log('PASS: exact retained Soybean replay: three advice claims pass; unsupported physical-cost summary and complete original still fail; '+negatives.length+' adversarial advice cases, exact facts/units/geography/dates/IDs/source failures; production evidence/snapshots/ledgers byte-identical. '+out);
}finally{globalThis.fetch=native;clock.timers.reset();}
