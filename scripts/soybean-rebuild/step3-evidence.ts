/** STEP 3 offline candidate-evidence review. Does not call Gemini or visit any URL.
 * Snippets are verbatim windows from texts already downloaded in STEP 2.
 * A publisher document's successful retrieval does NOT automatically verify
 * each number, context, or comparison in the extracted snippets.
 */

import {type Commodity} from './commodity-config.ts';
import {findCommodityHits} from './commodity-aliases.ts';
export type Step2Grade = 'A' | 'B' | 'EXCLUDED';
export type EvidenceTheme = 'supply' | 'demand' | 'prices' | 'trade' | 'processing' | 'weather' | 'policy' | 'logistics' | 'other';
export type ReviewSource = {
  grade: Step2Grade;
  reason: string;
  googleCitation: {index: number; title: string; uri: string};
  publisherUrl: string | null;
  publisherHost: string | null;
  httpStatus: number | null;
  documentType: 'html' | 'pdf' | null;
  title: string | null;
  publishedAt: string | null;
  extractedText: string | null;
  extractedCharacters: number;
  relevance?: 'strong'|'related'|'none';
  notes?: string; // present in the STEP2 publisher grade record; optional for older fixtures
};
export type EvidenceWindow = {
  id: string;
  sourceId: string;
  theme: EvidenceTheme;
  exactExcerpt: string;
  containsNumber: boolean;
  charStart: number;
  reviewStatus: 'candidate-not-fact-checked';
};

// Keep the proven snippet-selection and scoring algorithm; replace only fixed soybean anchors.
// No generation or translation of facts and NO numerical conclusions.
const SIGNALS: Array<[EvidenceTheme, RegExp]> = [
  ['supply', /\bproduction\b|\boutput\b|\bcrop\b|\bharvest\b|\byield\b|\bplanting\b|\bacreage\b|\bending stocks?\b|\binventor(?:y|ies)\b|\bsupply\b|생산|작황|재고|단수|파종/i],
  ['demand', /\bdemand\b|\bconsum(?:e|ption)\b|\bimport(?:s|ed|ing)?\b|\bpurchas(?:e|ing)\b|\bfeed demand\b|수요|소비|수입/i],
  ['prices', /\bprice\b|\bfuture(?:s)?\b|\bCBOT\b|\bUSD\b|\bdollars?\b|\bbenchmark\b|\bquotation\b|가격|시세|선물/i],
  ['trade', /\bexports?\b|\bshipments?\b|\btrade\b|\bsales?\b|\bChina\b|\bBrazil\b|\bArgentin(?:a|ian)\b|수출|무역|중국|브라질/i],
  ['processing', /\bcrush\b|\bmeal\b|\boil\b|\bprocessing\b|압착|대두박|대두유/i],
  ['weather', /\bweather\b|\bdrought\b|\brainfall\b|\btemperature\b|\bflood\b|강우|가뭄|기상/i],
  ['policy', /\btariff\b|\bdut(?:y|ies)\b|\bpolicy\b|\bsanction\b|\brestriction\b|관세|정책/i],
  ['logistics', /\bport\b|\bfreight\b|\bshipping\b|\blogistics\b|\btransport\b|항만|물류|운임/i],
];
export function chooseTheme(s: string): EvidenceTheme {
  const matching=SIGNALS.filter(([,r])=>r.test(s));
  // Keep a stable first match; this is indexing only, not market analysis.
  return matching[0]?.[0] || 'other';
}
function boundedWindow(text:string, offset:number, maxLength=500):{start:number; excerpt:string} {
  const before=Math.floor(maxLength*0.35);
  let start=Math.max(0,offset-before),end=Math.min(text.length,start+maxLength);
  // Nudge to nearest whitespace, but never fabricate content or join unrelated excerpts.
  if(start>0){const s=text.indexOf(' ',start);if(s>=0&&s-start<55)start=s+1;}
  if(end<text.length){const e=text.lastIndexOf(' ',end);if(e>start+maxLength*0.55)end=e;}
  return {start,excerpt:text.slice(start,end).trim()};
}
export function sourceId(index:number):string {return `G${String(index).padStart(3,'0')}`;}
export function extractEvidenceCandidates(text:string, id:string, max=6,commodity:Commodity='soybean'):EvidenceWindow[] {
  if(typeof text!=='string'||!text.trim())return [];
  // Preserve original characters and numbers; only normalize whitespace for readability.
  const normalized=text.replace(/\s+/g,' ').trim();
  const matches=findCommodityHits(normalized,commodity);
  const pool: Array<EvidenceWindow & {score:number}> = [];
  let previousStart=-9999;
  for(const match of matches.slice(0,700)){
    const at=match.start;
    if(at<0||at-previousStart<180)continue;
    const {start,excerpt}=boundedWindow(normalized,at);
    if(excerpt.length<75)continue;
    previousStart=start;
    const number=/\d[\d,.]*(?:\s?%|\s?(?:million|billion|thousand|tonnes?|bushels?|hectares?|acres?|MT|t\/ha))?/i.test(excerpt);
    const theme=chooseTheme(excerpt);
    let score=Number(number)*4+(theme!=='other'?3:0);
    if(/20(?:2[4-9]|3\d)/.test(excerpt))score+=1;
    if(/\b(?:USDA|WASDE|FAO|IGC|AMIS|CME|FAS|ERS)\b/.test(excerpt))score+=1;
    pool.push({id:'',sourceId:id,theme,exactExcerpt:excerpt,containsNumber:number,charStart:start,reviewStatus:'candidate-not-fact-checked',score});
  }
  // Prefer relevant diversity without requiring arbitrary article/number counts.
  pool.sort((a,b)=>b.score-a.score||a.charStart-b.charStart);
  const chosen:typeof pool=[];const byTheme=new Set<EvidenceTheme>();
  for(const p of pool){
    if(chosen.length>=max)break;
    if(chosen.some(q=>Math.abs(q.charStart-p.charStart)<160))continue;
    if(byTheme.has(p.theme)&&pool.some(q=>!byTheme.has(q.theme)&&q.score>=p.score-4))continue;
    chosen.push(p);byTheme.add(p.theme);
  }
  for(const p of pool){
    if(chosen.length>=max)break;
    if(!chosen.some(q=>Math.abs(q.charStart-p.charStart)<160))chosen.push(p);
  }
  return chosen.sort((a,b)=>a.charStart-b.charStart).map((p,i)=>({id:`${id}-E${i+1}`,sourceId:p.sourceId,theme:p.theme,exactExcerpt:p.exactExcerpt,containsNumber:p.containsNumber,charStart:p.charStart,reviewStatus:p.reviewStatus}));
}
export type ReviewItem={
  id:string;grade:Step2Grade;reason:string;googleTitle:string;googleCitationUrl:string;
  publisherUrl:string|null;publisherHost:string|null;publishedAt:string|null;
  documentType:'html'|'pdf'|null;extractedCharacters:number;
  eligibility:'document-readable-needs-fact-review'|'citation-only-needs-verification'|'retained-not-usable-as-soybean-evidence'|'excluded';
  warnings:string[];evidence:EvidenceWindow[];
};
export function buildEvidenceReview(records:ReviewSource[],commodity:Commodity='soybean'):ReviewItem[] {
  return records.map(r=>{
    const id=sourceId(r.googleCitation.index);
    let eligibility:ReviewItem['eligibility']='excluded';
    if(r.grade==='A')eligibility='document-readable-needs-fact-review';
    if(r.grade==='B')eligibility=r.reason==='publisher-unrelated'?'retained-not-usable-as-soybean-evidence':'citation-only-needs-verification';
    const warnings:string[]=[];
    if(!r.publishedAt)warnings.push('발행일 미확인: 현재 뉴스로 사용 금지; 과거 분석 근거로는 검토 가능');
    if(r.grade==='A'&&(r.extractedCharacters>=129500||(r.extractedText||'').length>=129500))warnings.push('STEP2 텍스트가 130,000자에서 잘렸을 수 있음; 원문 전체 확인 필요');
    if(r.grade==='A'&&(!r.title||r.title==='PDF original'))warnings.push('원문 제목이 파싱되지 않았음; 제목 및 자료 범위 확인 필요');
    if(r.grade==='B')warnings.push('Google 인용 근거만 확인; 원문 사실·수치 검증 안 됨');
    if(r.reason==='publisher-unrelated')warnings.push(`원문에서 ${commodity} 관련성 확인 실패: B로 보관하되 분석 근거로 사용 금지`);
    const evidence=r.grade==='A'?extractEvidenceCandidates(r.extractedText||'',id,6,commodity):[];
    if(r.grade==='A'&&!evidence.length)warnings.push(`현재 품목(${commodity}) 관련 원문 문맥을 자동 추출하지 못함; 수동 재검토 필요`);
    return {id,grade:r.grade,reason:r.reason,googleTitle:r.googleCitation.title,googleCitationUrl:r.googleCitation.uri,
      publisherUrl:r.publisherUrl,publisherHost:r.publisherHost,publishedAt:r.publishedAt,documentType:r.documentType,
      extractedCharacters:r.extractedCharacters,eligibility,warnings,evidence};
  });
}
