import {collectPotatoPublisherEvidence} from './potatoAnalysisEvidence.ts';
import {collectSugarArticleEvidence} from './sugarAnalysisEvidence.ts';
import {load} from 'cheerio';
/** One pinned retained response; no SDK invocation, paid approval or automatic caller. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {acceptPublisherResearchReport} from './liveAiAnalysisService.ts';
import {isDirectCornAiSource} from './cornAiQuality.ts';
import {acquirePaidLease,hasOutstandingPaidRequest,paidRuntimeRoot} from './paidJobLease.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from './stage3Runtime.ts';
import {persistAnalysisSnapshot,type RetainedPromotionAudit} from './analysisSnapshotPersistence.ts';
import {RMS_PROCUREMENT_POLICY} from '../utils/rmsProcurementCondition.ts';
import {collectAnalysisEvidence,validAnalysisFact} from './analysisEvidence.ts';
import {PALM_NEWS_CANDIDATES,verifyPalmArticle} from './palmVerifiedNews.ts';
import {originalArticleFact} from './analysisArticleEvidence.ts';
import {SOYBEAN_OIL_NEWS_CARDS,verifySoybeanOilArticle} from './soybeanOilVerifiedNews.ts';

export const RETAINED_SOYBEAN_RUN='standalone-soybean-a874e58ab620';
export const RETAINED_PROMOTION_APPROVAL='soybean-eighth-retained-no-gemini-v1';
export const RETAINED_REVIEW_SHA256='accb47042bc432b3551ceca0e62d9ed6def13718a5ded58a891c444b8ca9f635';
export const RETAINED_OIL_RUN='standalone-soybean-oil-f0d79222ad12';
export const RETAINED_OIL_APPROVAL='soybean-oil-retained-reviewed-v1';
export const RETAINED_OIL_REVIEW_SHA256='96212cd910df49d42788be365361d1247388d677b90425191f6126d9d749d500';
export const RETAINED_PALM_RUN='standalone-palm-oil-2159cb51-381';
export const RETAINED_PALM_APPROVAL='palm-oil-retained-reviewed-v1';
export const RETAINED_PALM_REVIEW_SHA256='d02a0dd68ab9c87a67a93ac6b246eb030f6b2553c1aa8732f09e7676afc387d6';
export const RETAINED_SUGAR_RUN='standalone-sugar-5456090e-f69';
export const RETAINED_SUGAR_APPROVAL='sugar-retained-reviewed-v1';
export const RETAINED_SUGAR_REVIEW_SHA256='7d66c69d43e03e5f0e5ccd228517211027dde6a332b81f6f0050bf20ec931863';
export const RETAINED_POTATO_RUN='standalone-potato-starch-d1138748-a23';
export const RETAINED_POTATO_APPROVAL='potato-starch-retained-reviewed-v1';
export const RETAINED_POTATO_REVIEW_SHA256='d423b6de66d972153dd620607d38eb3e2a8237a62d6dae9ff8119e7ae11fe0e7';
type Commodity='soybean'|'soybean-oil'|'palm-oil'|'sugar'|'potato-starch';
const target=(commodity:Commodity)=>commodity==='soybean'?{run:RETAINED_SOYBEAN_RUN,approval:RETAINED_PROMOTION_APPROVAL,sha:RETAINED_REVIEW_SHA256,folder:'soybean-eighth'}:commodity==='soybean-oil'?{run:RETAINED_OIL_RUN,approval:RETAINED_OIL_APPROVAL,sha:RETAINED_OIL_REVIEW_SHA256,folder:'soybean-oil-latest'}:commodity==='palm-oil'?{run:RETAINED_PALM_RUN,approval:RETAINED_PALM_APPROVAL,sha:RETAINED_PALM_REVIEW_SHA256,folder:'palm-publisher-reviewed'}:commodity==='sugar'?{run:RETAINED_SUGAR_RUN,approval:RETAINED_SUGAR_APPROVAL,sha:RETAINED_SUGAR_REVIEW_SHA256,folder:'sugar-publisher-reviewed'}:commodity==='potato-starch'?{run:RETAINED_POTATO_RUN,approval:RETAINED_POTATO_APPROVAL,sha:RETAINED_POTATO_REVIEW_SHA256,folder:'potato-publisher-reviewed'}:(()=>{throw Error('Unsupported retained commodity');})();
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const root=()=>path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3');
const reviewDir=(commodity:Commodity='soybean')=>path.join(root(),'retained-response-review',target(commodity).folder);
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
function writeOnce(p:string,value:unknown){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});}
const grantFile=(id:string)=>path.join(root(),'retained-promotion-approvals',id+'.json');
const consumedFile=(commodity:Commodity='soybean')=>path.join(root(),'retained-promotions',target(commodity).run+'.json');
function identity(approval:string,id:string,commodity:Commodity='soybean'){if(approval!==target(commodity).approval||!/^[a-zA-Z0-9_-]{12,100}$/.test(id))throw Error('Explicit retained-promotion authorization required');}
function idle(commodity:Commodity='soybean'){
  if(path.resolve(root())!==path.resolve(paidRuntimeRoot()))throw Error('Promotion/runtime root mismatch');
  if(hasOutstandingPaidRequest())throw Error('Outstanding paid request; promotion blocked');
  if(fs.existsSync(path.join(root(),'snapshots','analysis-'+commodity+'.json')))throw Error('Existing Soybean snapshot preserved');
  if(fs.existsSync(consumedFile(commodity)))throw Error('Retained response already attempted; no automatic retry');
}

/** Read-only readiness. All provenance comes from pinned, lossless records. */
export function reviewRetainedSoybeanPromotion(commodity:Commodity='soybean'){
  const t=target(commodity),raw=fs.readFileSync(path.join(reviewDir(commodity),'manifest.json'));
  if(hash(raw)!==t.sha)throw Error('Review manifest integrity failure');
  const review=JSON.parse(raw.toString());
  const diagnosticFile=path.join(root(),'diagnostics',t.run+'-1-'+commodity+'.json');
  const diagnosticRaw=fs.readFileSync(diagnosticFile),d=JSON.parse(diagnosticRaw.toString());
  if(hash(diagnosticRaw)!==review.diagnosticSha256||hash(d.response.text)!==review.responseSha256||
     hash(JSON.stringify(d.response.candidates[0].groundingMetadata??null))!==review.groundingSha256||
     d.runId!==t.run||d.commodity!==commodity||d.model!=='gemini-3.8-flash'||d.response.candidates[0].finishReason!=='STOP')throw Error('Original response/source integrity failure');
  const run=read(path.join(root(),'standalone-analysis.json')).runs.find((r:any)=>r.runId===t.run);
  const events=fs.readFileSync(path.join(root(),'paid-requests.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter((e:any)=>e.runId===t.run);
  if(!run||run.status!=='failed'||hash(JSON.stringify(run))!==review.originalRunSha256||
     hash(JSON.stringify(events))!==review.originalRequestEventsSha256||
     !events.some((e:any)=>e.phase==='completed'&&e.responseStatus===200&&e.httpAttempts===1&&e.recordedAt===review.originalGeneratedAt))throw Error('Original run/transport provenance failure');
  if(hash(JSON.stringify(review.qualifications))!==review.qualificationsSha256)throw Error('Review qualifications integrity failure');
  if(commodity==='potato-starch')return reviewPotatoDerivative(review,d);
  if(commodity==='sugar')return reviewSugarDerivative(review,d);
  if(commodity==='palm-oil')return reviewPalmDerivative(review,d);
  if(commodity==='soybean-oil')return reviewOilDerivative(review,d);
  const chunks=d.response.candidates[0].groundingMetadata.groundingChunks;
  const sources=review.sources.map((s:any,i:number)=>{
    if(s.chunkIndex!==i||i>=6||s.title!==chunks[i]?.web?.title||!isDirectCornAiSource(s.url)||
       s.httpStatus!==200||s.receiptFile!=='source-'+i+'.html'||!Number.isFinite(Date.parse(s.verifiedAt))||
       hash(fs.readFileSync(path.join(reviewDir(),s.receiptFile)))!==s.sha256)throw Error('Retained publisher evidence integrity failure');
    return {url:s.url,title:s.title};
  });
  if(new Set(sources.map((s:any)=>new URL(s.url).hostname.replace(/^www\./,''))).size<2)throw Error('Two independent verified publisher hosts required');
  const report=acceptPublisherResearchReport(d.response.text,'soybean',d.model,sources,review.originalGeneratedAt);
  const original=JSON.parse(d.response.text);
  for(const k of ['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'])
    if(JSON.stringify((report as any)[k])!==JSON.stringify(original[k]))throw Error('Promotion must preserve exact Gemini report fields');
  if(report.procurementConditionPolicy!==RMS_PROCUREMENT_POLICY)throw Error('Separate RMS procurement policy required');
  return {review,report,reviewSha256:RETAINED_REVIEW_SHA256};
}

/** Same pinned review/approval/persistence operation; only this reviewed Oil
 * derivative may differ from provider fields, and every difference is retained. */
function reviewOilDerivative(review:any,d:any){
  const dir=reviewDir('soybean-oil'),editorialBytes=fs.readFileSync(path.join(dir,review.editorialFile));
  if(review.editorialFile!=='editorial.json'||hash(editorialBytes)!==review.editorialSha256)throw Error('Editorial integrity failure');
  const editorial=JSON.parse(editorialBytes.toString()),original=JSON.parse(d.response.text),keys=['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'];
  if(editorial.kind!=='reviewed-editorial-derivative'||editorial.originalRunId!==RETAINED_OIL_RUN||keys.some(k=>JSON.stringify(editorial.originalFields[k])!==JSON.stringify(original[k])))throw Error('Editorial original fields mismatch');
  const changed=keys.filter(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.publishedFields[k]));
  if(JSON.stringify(changed)!==JSON.stringify(editorial.changedFields)||changed.some(k=>!editorial.reasons[k]))throw Error('Undocumented editorial changes');
  const resolutionBytes=fs.readFileSync(path.join(dir,review.resolutionFile));
  if(review.resolutionFile!=='grounding-resolution.json'||hash(resolutionBytes)!==review.resolutionSha256||JSON.stringify(JSON.parse(resolutionBytes.toString()).resolvedSources)!==JSON.stringify(review.geminiSources.map(({chunkIndex,...s}:any)=>s)))throw Error('Original grounding resolution mismatch');
  if(review.geminiSources.some((s:any,i:number)=>s.chunkIndex!==i||s.title!==d.response.candidates[0].groundingMetadata.groundingChunks[i]?.web?.title))throw Error('Grounding identity mismatch');
  const sources=review.sources.map((s:any)=>{
    if(path.basename(s.receiptFile)!==s.receiptFile||!isDirectCornAiSource(s.url)||!Number.isFinite(Date.parse(s.verifiedAt)))throw Error('Invalid source receipt');
    const bytes=fs.readFileSync(path.join(dir,s.receiptFile));if(hash(bytes)!==s.sha256)throw Error('Source receipt hash mismatch');
    if(s.kind==='verified-retained-original'){
      const r=JSON.parse(bytes.toString()),{sha256,...content}=r,c=SOYBEAN_OIL_NEWS_CARDS.find(c=>c.originalUrl===s.url);
      if(!c||r.sourceUrl!==s.url||sha256!==s.articleReceiptSha256||hash(JSON.stringify(content))!==sha256||!verifySoybeanOilArticle(r.html,c,r.document))throw Error('Original publisher verification failed');
    }else if(s.kind==='independently-verified-original'){
      if(s.url!=='https://www.spglobal.com/energy/en/news-research/latest-news/agriculture/101526-brazil-soybean-oil-exports-rise-as-conab-forecasts-record-2026-27-soybean-crop'||!bytes.toString().includes(s.url)||s.claimPatterns.some((p:string)=>!new RegExp(p,'i').test(bytes.toString())))throw Error('Independent publisher verification failed');
    }else throw Error('Unsupported source provenance');
    return {url:s.url,title:s.title,publisher:s.publisher,publisherVerified:true,provenance:{kind:'verified-retained-original' as const,receiptSha256:s.articleReceiptSha256||s.sha256,verifiedAt:s.verifiedAt,evidenceIds:[],supportedClaims:s.supportedClaims}};
  });
  const base=acceptPublisherResearchReport(JSON.stringify(editorial.publishedFields),'soybean-oil',d.model,sources,review.originalGeneratedAt);
  const report={...base,citationProvenance:{geminiGroundedUrls:review.geminiSources.map((s:any)=>s.url),verifiedRetainedOriginalUrls:sources.map((s:any)=>s.url)},qualityReview:{kind:'reviewed-editorial-derivative',version:editorial.version,reviewedAt:editorial.reviewedAt,originalRunId:RETAINED_OIL_RUN,originalResponseSha256:review.responseSha256,editorialSha256:review.editorialSha256,originalFields:editorial.originalFields,publishedFields:editorial.publishedFields,changedFields:changed,reasons:editorial.reasons}};
  if(!report.executiveSummary.includes('잠정')||!report.executiveSummary.includes('실행 환율')||!report.executiveSummary.includes('정제유 공급 부족을 확정할 수는 없습니다'))throw Error('Required editorial qualifications missing');
  return {review,report,reviewSha256:RETAINED_OIL_REVIEW_SHA256};
}

/** Same sealed retained-review operation. The Search tool ran, but this exact
 * Palm response has no publisher grounding chunks; sources stay independent. */
function reviewPalmDerivative(review:any,d:any){
  const dir=reviewDir('palm-oil');if(hash(fs.readFileSync(path.join(dir,'factual-review.json')))!==review.factualReviewSha256)throw Error('Palm factual review integrity failure');
  const pin=path.join(dir,'pinned-evidence'),keys=['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'];
  for(const [relative,expected]of Object.entries(review.evidenceFiles)){
    const file=path.resolve(dir,relative);if(!file.startsWith(path.resolve(pin)+path.sep)||hash(fs.readFileSync(file))!==expected)throw Error('Palm pinned source integrity failure');
  }
  if(hash(fs.readFileSync(path.join(dir,'evidence.json')))!==review.evidenceSha256)throw Error('Palm evidence hash mismatch');
  const evidence=read(path.join(dir,'evidence.json')),at=new Date(review.reviewedAt),rebuilt=collectAnalysisEvidence('palm-oil',pin,at);
  if(evidence.commodity!=='palm-oil'||evidence.facts.some((f:any)=>!validAnalysisFact(f,'palm-oil',at)))throw Error('Invalid Palm evidence');
  for(const f of evidence.facts){
    if(!f.id.startsWith('article-')){if(!rebuilt.facts.some(r=>JSON.stringify(r)===JSON.stringify(f)))throw Error('Palm price/PSD fact mismatch');continue;}
    const candidate=PALM_NEWS_CANDIDATES.find(c=>c.originalUrl===f.sourceUrl);if(!candidate)throw Error('Unverified Palm original identity');
    const r=read(path.join(pin,'.rms-stage3/evidence/articles','article-'+f.recordSha256+'.json'));
    if(hash(r.html)!==f.recordSha256||r.sourceUrl!==f.sourceUrl||!verifyPalmArticle(r.html,candidate,at))throw Error('Palm article integrity failure');
    const parsed=originalArticleFact(r.html,f.sourceUrl,candidate.publishedAt,'palm-oil',r.verifiedAt),{referenceContext,...canonical}=f;
    if(JSON.stringify(parsed)!==JSON.stringify(canonical)||referenceContext?.receiptSha256!==f.recordSha256)throw Error('Palm original evidence mismatch');
  }
  const editorialRaw=fs.readFileSync(path.join(dir,'editorial.json'));if(review.editorialFile!=='editorial.json'||hash(editorialRaw)!==review.editorialSha256)throw Error('Palm editorial integrity failure');
  const editorial=JSON.parse(editorialRaw.toString()),original=JSON.parse(d.response.text),changed=keys.filter(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.publishedFields[k]));
  if(editorial.kind!=='reviewed-editorial-derivative'||editorial.originalRunId!==RETAINED_PALM_RUN||keys.some(k=>JSON.stringify(editorial.originalFields[k])!==JSON.stringify(original[k]))||JSON.stringify(changed)!==JSON.stringify(editorial.changedFields)||changed.some(k=>!editorial.reasons[k]))throw Error('Palm undocumented editorial change');
  const transport=review.originalTransport;
  for(const [file,digest]of [[transport.requestFile,transport.requestSha256],[transport.responseFile,transport.responseSha256]])if(path.basename(file)!==file||hash(fs.readFileSync(path.join(root(),'diagnostics',file)))!==digest)throw Error('Palm complete transport integrity failure');
  const wire=read(path.join(root(),'diagnostics',transport.responseFile));
  if(wire.status!==200||!wire.body.candidates[0].content.parts.some((p:any)=>p.toolCall?.toolType==='GOOGLE_SEARCH_WEB')||!wire.body.candidates[0].content.parts.some((p:any)=>p.toolResponse?.toolType==='GOOGLE_SEARCH_WEB')||d.response.candidates[0].groundingMetadata)throw Error('Palm Search provenance mismatch');
  const sources=review.sources.map((s:any)=>{
    if(!isDirectCornAiSource(s.url)||!evidence.facts.some((f:any)=>f.sourceUrl===(s.evidenceSourceUrl||s.url)&&f.recordSha256===s.recordSha256)||!s.evidenceIds.length||s.evidenceIds.some((id:string)=>!evidence.facts.some((f:any)=>f.id===id&&f.sourceUrl===(s.evidenceSourceUrl||s.url))))throw Error('Palm source mapping mismatch');
    const reprint=s.url===PALM_NEWS_CANDIDATES[3].originalUrl;
    if((s.kind==='verified-republication')!==reprint)throw Error('Palm source origin mislabelled');
    return{url:s.url,title:s.title,publisher:s.publisher,publisherVerified:true,provenance:{kind:reprint?'verified-retained-republication' as const:'verified-retained-original' as const,evidenceSourceUrl:s.evidenceSourceUrl||s.url,receiptSha256:s.recordSha256,verifiedAt:s.verifiedAt,evidenceIds:s.evidenceIds,supportedClaims:s.supportedClaims}};
  });
  const base=acceptPublisherResearchReport(JSON.stringify(editorial.publishedFields),'palm-oil',d.model,sources,review.originalGeneratedAt);
  if(!base.executiveSummary.includes('실행 환율')||!base.executiveSummary.includes('미확인')||!base.executiveSummary.includes('재게시')||!base.executiveSummary.includes('전망')||/1,042.15|130.269|Permendag|수확 차질/.test(JSON.stringify(editorial.publishedFields)))throw Error('Palm factual qualifications missing or rejected claims retained');
  const report={...base,citationProvenance:{geminiGroundedUrls:[],verifiedRetainedOriginalUrls:sources.filter(s=>s.provenance.kind==='verified-retained-original').map(s=>s.url),verifiedRetainedRepublicationUrls:sources.filter(s=>s.provenance.kind==='verified-retained-republication').map(s=>s.url)},qualityReview:{kind:'reviewed-editorial-derivative',version:editorial.version,reviewedAt:editorial.reviewedAt,originalRunId:RETAINED_PALM_RUN,originalResponseSha256:review.responseSha256,editorialSha256:review.editorialSha256,originalFields:editorial.originalFields,publishedFields:editorial.publishedFields,changedFields:changed,reasons:editorial.reasons,reviewerDecision:editorial.reviewerDecision}};
  return{review,report,reviewSha256:RETAINED_PALM_REVIEW_SHA256};
}

/** Sugar uses the same pinned editorial approval and immutable persistence.
 * Only the separately reviewed exact derivative can be promoted, never raw output. */
function reviewSugarDerivative(review:any,d:any){
  const dir=reviewDir('sugar'),pin=path.join(dir,'pinned-evidence'),keys=['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'];
  if(hash(fs.readFileSync(path.join(dir,'factual-review.json')))!==review.factualReviewSha256)throw Error('Sugar factual review integrity failure');
  for(const[relative,expected]of Object.entries(review.evidenceFiles)){const file=path.resolve(dir,relative);if(!file.startsWith(path.resolve(pin)+path.sep)||hash(fs.readFileSync(file))!==expected)throw Error('Sugar pinned evidence integrity failure');}
  if(hash(fs.readFileSync(path.join(dir,'evidence.json')))!==review.evidenceSha256)throw Error('Sugar evidence hash mismatch');
  const at=new Date(review.reviewedAt),evidence=read(path.join(dir,'evidence.json')),rebuilt=collectAnalysisEvidence('sugar',pin,at);rebuilt.facts.push(...collectSugarArticleEvidence(pin,at).facts);
  if(evidence.commodity!=='sugar'||evidence.facts.length!==rebuilt.facts.length||evidence.facts.some((f:any)=>!validAnalysisFact(f,'sugar',at)||!rebuilt.facts.some(r=>JSON.stringify(r)===JSON.stringify(f))))throw Error('Sugar source facts mismatch');
  const bytes=fs.readFileSync(path.join(dir,'editorial.json'));if(review.editorialFile!=='editorial.json'||hash(bytes)!==review.editorialSha256)throw Error('Sugar editorial integrity failure');
  const editorial=JSON.parse(bytes.toString()),original=JSON.parse(d.response.text),changed=keys.filter(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.publishedFields[k]));
  if(editorial.kind!=='reviewed-editorial-derivative'||editorial.originalRunId!==RETAINED_SUGAR_RUN||keys.some(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.originalFields[k]))||JSON.stringify(changed)!==JSON.stringify(editorial.changedFields)||changed.some(k=>!editorial.reasons[k]))throw Error('Sugar undocumented editorial changes');
  for(const[file,digest]of[[review.originalTransport.requestFile,review.originalTransport.requestSha256],[review.originalTransport.responseFile,review.originalTransport.responseSha256]])if(path.basename(file)!==file||hash(fs.readFileSync(path.join(root(),'diagnostics',file)))!==digest)throw Error('Sugar complete transport integrity failure');
  const transport=read(path.join(root(),'diagnostics',review.originalTransport.responseFile));if(transport.status!==200||!transport.body.candidates[0].content.parts.some((p:any)=>p.toolCall?.toolType==='GOOGLE_SEARCH_WEB')||!d.response.candidates[0].groundingMetadata?.groundingChunks?.length)throw Error('Sugar actual Search grounding missing');
  const resolutionBytes=fs.readFileSync(path.join(dir,'grounding-resolution.json'));if(hash(resolutionBytes)!==review.resolutionSha256)throw Error('Sugar grounding resolution mismatch');
  const grounded=JSON.parse(resolutionBytes.toString()).originalSources,chunks=d.response.candidates[0].groundingMetadata.groundingChunks;
  if(grounded.some((s:any,i:number)=>!isDirectCornAiSource(s.url)||s.title!==chunks[i]?.web?.title))throw Error('Sugar original grounding source mismatch');
  const sources=review.sources.map((s:any)=>{
    if(!isDirectCornAiSource(s.url)||!Number.isFinite(Date.parse(s.verifiedAt)))throw Error('Sugar invalid source identity');
    if(s.receiptFile){if(path.basename(s.receiptFile)!==s.receiptFile)throw Error('Sugar invalid receipt path');const raw=fs.readFileSync(path.join(dir,s.receiptFile));if(hash(raw)!==s.sha256)throw Error('Sugar publisher receipt integrity failure');const r=JSON.parse(raw.toString());const $=load(r.body);$('script,style,nav,footer,header').remove();const text=$('main').text()||$('body').text();if(r.url!==s.url||r.status!==200||s.claimPatterns.some((p:string)=>!text.includes(p)))throw Error('Sugar original publisher evidence missing');
    }else if(!s.evidenceIds?.length||s.evidenceIds.some((id:string)=>!evidence.facts.some((f:any)=>f.id===id&&f.sourceUrl===(s.evidenceSourceUrl||s.url))))throw Error('Sugar price/PSD source mapping mismatch');
    const secondary=s.publisher==='ETAgriculture';if((s.kind==='verified-retained-republication')!==secondary)throw Error('Sugar secondary-source provenance mismatch');
    return{url:s.url,title:s.title,publisher:s.publisher,publisherVerified:true,provenance:{kind:secondary?'verified-retained-republication' as const:'verified-retained-original' as const,receiptSha256:s.sha256||review.evidenceSha256,verifiedAt:s.verifiedAt,evidenceIds:s.evidenceIds||[],supportedClaims:s.claimPatterns||s.evidenceIds,evidenceSourceUrl:s.evidenceSourceUrl||s.url}};
  });
  const base=acceptPublisherResearchReport(JSON.stringify(editorial.publishedFields),'sugar',d.model,sources,review.originalGeneratedAt);
  if(!base.executiveSummary.includes('잠정')||!base.executiveSummary.includes('5월')||!base.executiveSummary.includes('The Hindu')||!base.executiveSummary.includes('실행 환율')||!base.executiveSummary.includes('미검증')||/\[sugar-|12\.5%|기관 투자가|110억|1~3개월 소요분/.test(JSON.stringify(editorial.publishedFields)))throw Error('Sugar mandatory factual qualifications missing');
  return{review,reviewSha256:RETAINED_SUGAR_REVIEW_SHA256,report:{...base,citationProvenance:{geminiGroundedUrls:grounded.map((s:any)=>s.url),verifiedRetainedOriginalUrls:sources.filter(s=>s.provenance.kind==='verified-retained-original').map(s=>s.url),verifiedRetainedRepublicationUrls:sources.filter(s=>s.provenance.kind==='verified-retained-republication').map(s=>s.url)},qualityReview:{kind:'reviewed-editorial-derivative',version:editorial.version,reviewedAt:editorial.reviewedAt,originalRunId:RETAINED_SUGAR_RUN,originalResponseSha256:review.responseSha256,editorialSha256:review.editorialSha256,originalFields:editorial.originalFields,publishedFields:editorial.publishedFields,changedFields:changed,reasons:editorial.reasons,reviewerDecision:editorial.reviewerDecision}}};
}

function reviewPotatoDerivative(review:any,d:any){
  const dir=reviewDir('potato-starch'),pin=path.join(dir,'pinned-evidence'),keys=['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'];
  if(hash(fs.readFileSync(path.join(dir,'factual-review.json')))!==review.factualReviewSha256)throw Error('Potato factual review integrity failure');
  for(const[relative,expected]of Object.entries(review.evidenceFiles)){const file=path.resolve(dir,relative);if(!file.startsWith(path.resolve(pin)+path.sep)||hash(fs.readFileSync(file))!==expected)throw Error('Potato pinned evidence integrity failure');}
  if(hash(fs.readFileSync(path.join(dir,'evidence.json')))!==review.evidenceSha256)throw Error('Potato evidence hash mismatch');
  const at=new Date(review.reviewedAt),evidence=read(path.join(dir,'evidence.json')),rebuilt=collectPotatoPublisherEvidence(pin,at);
  if(evidence.commodity!=='potato-starch'||evidence.facts.length!==rebuilt.facts.length||evidence.facts.some((f:any)=>!validAnalysisFact(f,'potato-starch',at)||!rebuilt.facts.some(r=>JSON.stringify(r)===JSON.stringify(f))))throw Error('Potato source facts mismatch');
  const bytes=fs.readFileSync(path.join(dir,'editorial.json'));if(review.editorialFile!=='editorial.json'||hash(bytes)!==review.editorialSha256)throw Error('Potato editorial integrity failure');
  const editorial=JSON.parse(bytes.toString()),original=JSON.parse(d.response.text),changed=keys.filter(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.publishedFields[k]));
  if(editorial.kind!=='reviewed-editorial-derivative'||editorial.originalRunId!==RETAINED_POTATO_RUN||keys.some(k=>JSON.stringify(original[k])!==JSON.stringify(editorial.originalFields[k]))||JSON.stringify(changed)!==JSON.stringify(editorial.changedFields)||changed.some(k=>!editorial.reasons[k]))throw Error('Potato undocumented editorial changes');
  for(const[file,digest]of[[review.originalTransport.requestFile,review.originalTransport.requestSha256],[review.originalTransport.responseFile,review.originalTransport.responseSha256]])if(path.basename(file)!==file||hash(fs.readFileSync(path.join(root(),'diagnostics',file)))!==digest)throw Error('Potato complete transport integrity failure');
  const transport=read(path.join(root(),'diagnostics',review.originalTransport.responseFile));if(transport.status!==200||!transport.body.candidates[0].content.parts.some((p:any)=>p.toolCall?.toolType==='GOOGLE_SEARCH_WEB')||!d.response.candidates[0].groundingMetadata?.groundingChunks?.length)throw Error('Potato actual Search grounding missing');
  const resolutionBytes=fs.readFileSync(path.join(dir,'grounding-resolution.json'));if(hash(resolutionBytes)!==review.resolutionSha256)throw Error('Potato grounding resolution mismatch');
  const grounded=JSON.parse(resolutionBytes.toString()).originalSources,chunks=d.response.candidates[0].groundingMetadata.groundingChunks;
  if(grounded.some((s:any,i:number)=>!isDirectCornAiSource(s.url)||s.title!==chunks[i]?.web?.title))throw Error('Potato original grounding source mismatch');
  const sources=review.sources.map((s:any)=>{
    if(!isDirectCornAiSource(s.url)||s.kind!=='verified-retained-original'||!s.evidenceIds?.length||s.evidenceIds.some((id:string)=>!evidence.facts.some((f:any)=>f.id===id&&f.sourceUrl===s.url&&f.recordSha256===s.recordSha256)))throw Error('Potato original source mapping mismatch');
    return{url:s.url,title:s.title,publisher:s.publisher,publisherVerified:true,provenance:{kind:'verified-retained-original' as const,receiptSha256:s.recordSha256,verifiedAt:s.verifiedAt,evidenceIds:s.evidenceIds,supportedClaims:s.supportedClaims}};
  });
  const base=acceptPublisherResearchReport(JSON.stringify(editorial.publishedFields),'potato-starch',d.model,sources,review.originalGeneratedAt);
  if(!base.executiveSummary.includes('2025년')||!base.executiveSummary.includes('미확인')||!base.executiveSummary.includes('지역 표본')||!base.executiveSummary.includes('역내 교역')||/25\.4%|2,070|EU ETS|1~3개월|재고 부담/.test(JSON.stringify(editorial.publishedFields)))throw Error('Potato factual scope qualifications missing');
  return{review,reviewSha256:RETAINED_POTATO_REVIEW_SHA256,report:{...base,citationProvenance:{geminiGroundedUrls:grounded.map((s:any)=>s.url),verifiedRetainedOriginalUrls:sources.filter(s=>s.provenance.kind==='verified-retained-original').map(s=>s.url),verifiedRetainedRepublicationUrls:[]},qualityReview:{kind:'reviewed-editorial-derivative',version:editorial.version,reviewedAt:editorial.reviewedAt,originalRunId:RETAINED_POTATO_RUN,originalResponseSha256:review.responseSha256,editorialSha256:review.editorialSha256,originalFields:editorial.originalFields,publishedFields:editorial.publishedFields,changedFields:changed,reasons:editorial.reasons,reviewerDecision:editorial.reviewerDecision}}};
}

/** Local owner provisioning only, after a future explicit approval. Does not save or generate. */
export function approveRetainedSoybeanPromotion(approval:string,authorizationId:string,reviewSha256:string,acknowledgedQualificationsSha256:string,reason:string,commodity:Commodity='soybean'){
  const t=target(commodity);identity(approval,authorizationId,commodity);const release=acquirePaidLease('analysis-job','approve-promotion-'+authorizationId);
  try{
    idle(commodity);const {review}=reviewRetainedSoybeanPromotion(commodity);
    if(reviewSha256!==t.sha||acknowledgedQualificationsSha256!==review.qualificationsSha256||reason.trim().length<20)throw Error('Owner must acknowledge exact reviewed provenance and qualifications');
    const grant={authorizationId,approval,purpose:'retained-response-promotion-no-gemini',originalRunId:t.run,reviewSha256,acknowledgedQualificationsSha256,maxOperations:1,
      approvedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+4*3600000).toISOString(),reason};
    writeOnce(grantFile(authorizationId),grant);return grant;
  }finally{release();}
}
export function retainedPromotionPreflight(approval:string,authorizationId:string,commodity:Commodity='soybean'){
  const t=target(commodity);identity(approval,authorizationId,commodity);idle(commodity);
  const grant=read(grantFile(authorizationId)),now=Date.now();
  if(grant.authorizationId!==authorizationId||grant.approval!==approval||grant.purpose!=='retained-response-promotion-no-gemini'||
     grant.originalRunId!==t.run||grant.reviewSha256!==t.sha||grant.maxOperations!==1||
     !Number.isFinite(Date.parse(grant.approvedAt))||Date.parse(grant.approvedAt)>now||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now||
     Date.parse(grant.expiresAt)-Date.parse(grant.approvedAt)>4*3600000)throw Error('Invalid/expired retained-promotion grant');
  const prepared=reviewRetainedSoybeanPromotion(commodity);
  if(grant.acknowledgedQualificationsSha256!==prepared.review.qualificationsSha256)throw Error('Qualifications not acknowledged');
  return prepared;
}
/** No network. A separate immutable occurrence ledger leaves paid history untouched. */
export function promoteRetainedSoybeanResponse(approval:string,authorizationId:string,commodity:Commodity='soybean'){
  const t=target(commodity);identity(approval,authorizationId,commodity);const promotionId='retained-'+commodity+'-'+randomUUID(),release=acquirePaidLease('analysis-job',promotionId);
  try{
    const {review,report}=retainedPromotionPreflight(approval,authorizationId,commodity),promotedAt=new Date().toISOString();
    writeOnce(consumedFile(commodity),{promotionId,authorizationId,originalRunId:t.run,reviewSha256:t.sha,startedAt:promotedAt,purpose:'retained-response-promotion-no-gemini'});
    const ctx:Stage3RunContext={runId:promotionId,permitted:false,attempts:0,successfulCalls:0,maxCalls:0,estimatedUsd:0,maxEstimatedUsd:0,
      abortController:new AbortController(),deadlineAt:Date.now()+75000};
    const audit:RetainedPromotionAudit={kind:'retained-response-promotion-no-gemini',promotionId,authorizationId,promotedAt,
      originalRunId:t.run,originalGeneratedAt:review.originalGeneratedAt,diagnosticSha256:review.diagnosticSha256,
      responseSha256:review.responseSha256,groundingSha256:review.groundingSha256,reviewSha256:t.sha,
      qualifications:review.qualifications,generationTimeBasis:review.generationTimeBasis,sourceReceipts:review.sources};
    if('qualityReview' in report)audit.editorialReview=report.qualityReview;
    try{
      const saved=withAuthorizedStage3Run(ctx,()=>persistAnalysisSnapshot(root(),commodity,t.run,{success:true,data:report},audit));
      const result={promotionId,status:'saved',saved,originalRunId:t.run,promotedAt,geminiHttpAttempts:0,estimatedPaidCostUsd:0};
      writeOnce(consumedFile(commodity)+'.result.json',result);return result;
    }catch(e){writeOnce(consumedFile(commodity)+'.result.json',{promotionId,status:'failed',error:String((e as Error).message),geminiHttpAttempts:0});throw e;}
    finally{ctx.cancelled=true;ctx.abortController!.abort();}
  }finally{release();}
}
