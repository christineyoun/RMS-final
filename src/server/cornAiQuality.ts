/**
 * Offline-safe semantic guard for Corn RMS AI. It is not a replacement for
 * verifying factual assertions against the actual source documents.
 * Contains NO dated crop numbers, prices, or hardcoded recommendations.
 */
import {RMS_PROCUREMENT_POLICY,procurementPolicyContradictions} from '../utils/rmsProcurementCondition.ts';
export interface CornAiReport {
  deskRecommendation?: string;
  executiveSummary?: string;
  bullishFactors?: string[];
  bearishFactors?: string[];
  watchItems?: string[];
}
export interface CornAiSource { title?: string; url?: string }

/** Narrow offline checks, not exhaustive fact checking. An unrelated watch
 * item must not qualify a desk instruction. Sourced market prices are allowed. */
export function publisherProcurementIssues(report:CornAiReport):string[] {
  const issues=new Set<string>();
  const fields=[report.deskRecommendation,report.executiveSummary,...(report.bullishFactors||[]),...(report.bearishFactors||[]),...(report.watchItems||[])];
  const price=String.raw`\d[\d,.]*(?:\s*(?:[~～–—-]|to)\s*\d[\d,.]*)?\s*(?:US\s*)?(?:¢\s*\/\s*(?:lb|bu)|cents?\s*\/\s*(?:lb|bu)|센트(?:\s*\/\s*(?:lb|bu|파운드|부셸))?|USD\s*\/\s*MT|달러\s*\/\s*톤)`;
  const entryAfter=new RegExp(price+String.raw`\s*(?:선에서|구간|이하|미만|수준에서)`,'i');
  const entryBefore=new RegExp(String.raw`(?:목표\s*(?:매수|구매|진입)?\s*(?:가|가격)?|(?:매수|구매|진입)\s*(?:가|가격|구간)|buy\s+below|entry\s+(?:at|below)|target\s+price)[^.!?\n]{0,35}`+price,'i');
  for(const field of fields)for(const sentence of String(field||'').split(/[.!?](?=\s|$)|[。\n]/)){
    if(/매수|구매|계약|확보|\bbuy\b|purchase|entry/i.test(sentence)&&(entryAfter.test(sentence)||entryBefore.test(sentence)))
      issues.add('unsupported-numerical-buying-target');
    const direction=/베이시스(?:의)?\s*(?:약세|완화|하락|인하|축소)|basis\s*(?:weakening|falling|declining|weakness)/i.test(sentence);
    const qualified=/확인|검증|비교|여부|조건부|모니터링|미확인|알\s*수\s*없|입증하지|뜻하지|단정할\s*수\s*없|unverified|unknown|not\s+(?:confirmed|verified)|confirm|compare/i.test(sentence);
    if(direction&&!qualified)issues.add('unsupported-basis-direction');
  }
  return [...issues];
}

/** Require original links for explicitly attributed retained publishers;
 * never manufacture citations from prose. This is a limited attribution check. */
export function publisherAttributionIssues(report:CornAiReport,sources:CornAiSource[]):string[]{
  const body=[report.executiveSummary,report.deskRecommendation,...(report.bullishFactors||[]),...(report.bearishFactors||[]),...(report.watchItems||[])].join(' ');
  const hosts=sources.filter(s=>isDirectCornAiSource(s.url)).map(s=>new URL(String(s.url)).hostname.toLowerCase().replace(/^www\./,''));
  return ([
    ['nopa-fastmarkets',/\bNOPA\b|Fastmarkets|패스트마켓/i,['nopa.org','fastmarkets.com']],
    ['usda-ers',/USDA\s*ERS|USDA\s*(?:경제연구|경제조사)|미국\s*농무부\s*경제연구/i,['ers.usda.gov']],
    ['asa',/American Soybean Association|미국대두협회|\bASA\b/i,['soygrowers.com']],
  ] as const).flatMap(([name,mention,allowed])=>mention.test(body)&&!hosts.some(h=>allowed.some(a=>h===a||h.endsWith('.'+a)))?['missing-original-publisher-citation:'+name]:[]);
}

function publisherFamily(url:string):string {
  const u=new URL(url),host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(host==='usda.gov'||host.endsWith('.usda.gov'))return 'usda.gov';
  // Exact inspected articles only; do not infer all articles on a host share an origin.
  const credits:Record<string,string>={
    'agriculture.economictimes.indiatimes.com/news/policy-and-rural-economy/india-tightens-ethanol-sourcing-as-sugar-supplies-come-under-pressure/135043338':'thehindu.com',
    'prestasisawit.mpob.gov.my/ms/palmnews/news/40027':'reuters.com',
    'zyotwdhon.com/en/news/south-american-soybean-oil-exports-exceed-forecasts-india-leads-a7h3':'ukragroconsult.com',
    'zyotwdhon.com/en/news/us-soybean-oil-stocks-hit-12-year-low-i9x0':'fastmarkets.com',
    'zyotwdhon.com/en/news/brazil-soybean-oil-exports-exceed-2025-totals-q6ft':'ukragroconsult.com',
    'hellenicshippingnews.com/brazil-soybean-oil-exports-rise-as-conab-forecasts-record-2026-27-soybean-crop':'spglobal.com',
  };
  return credits[host+u.pathname.replace(/\/+$/,'')]||host;
}

export function isDirectCornAiSource(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    if (/^(?:localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1)/.test(h) ||
      /(?:\.internal|\.local)$/.test(h)) return false;
    if (h === 'vertexaisearch.cloud.google.com' ||
      /^(?:www\.)?google\.[a-z.]+$/.test(h) || h === 'news.google.com') return false;
    return true;
  } catch { return false; }
}

/** Gemini may supply Google redirect URIs. Only resolve the original URI;
 * do not manufacture a guessed publisher URL from a title or domain. */
export async function resolveCornGroundedSources<T extends CornAiSource>(sources: T[]): Promise<T[]> {
  const resolved = await Promise.all(sources.slice(0, 6).map(async (source) => {
    const current = String(source?.url || '');
    if (isDirectCornAiSource(current)) return source;
    let u: URL;
    try { u = new URL(current); } catch { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'vertexaisearch.cloud.google.com' ||
      !u.pathname.startsWith('/grounding-api-redirect/')) return null;
    for (const method of ['HEAD', 'GET'] as const) {
      try {
        // Never follow an uninspected redirect to a private network address.
        const r = await fetch(current, { method, redirect: 'manual', signal: AbortSignal.timeout(6500) });
        const location = r.headers.get('location');
        if (r.body) await r.body.cancel().catch(() => {});
        if (r.status >= 300 && r.status < 400 && location) {
          const target = new URL(location, current).toString();
          if (isDirectCornAiSource(target)) return { ...source, url: target };
        }
      } catch { /* direct URL resolution unavailable; retain no fake citation */ }
    }
    return null;
  }));
  return [...new Map(resolved.filter((s): s is Awaited<T> => s !== null)
    .map(s => [String(s.url).toLowerCase().replace(/\/+$/, ''), s])).values()];
}

export function publisherResearchIntegrityIssues(report: CornAiReport, sources: CornAiSource[],commodity:'corn'|'soybean'|'soybean-oil'|'palm-oil'|'sugar'|'potato-starch'='corn',policy?:typeof RMS_PROCUREMENT_POLICY): string[] {
  const recommendation=String(report.deskRecommendation||'');
  const executive=String(report.executiveSummary||'');
  const factors=[...(report.bullishFactors||[]), ...(report.bearishFactors||[]), ...(report.watchItems||[])];
  const body=[recommendation,executive,...factors].join(' ');
  const issues:string[]=[];
  issues.push(...procurementPolicyContradictions(body));
  issues.push(...publisherProcurementIssues(report),...publisherAttributionIssues(report,sources));
  if (!(commodity==='corn'?/(?:옥수수|maize|corn)/i:commodity==='soybean-oil'?/(?:대두유|soybean\s*oil|soyoil)/i:commodity==='palm-oil'?/(?:팜유|palm\s*oil|CPO|올레인)/i:commodity==='sugar'?/(?:설탕|원당|sugar)/i:commodity==='potato-starch'?/(?:감자전분|potato\s*starch)/i:/(?:대두(?!유)|soybeans?)/i).test(executive)) issues.push(commodity+'-not-identified-in-executive-summary');
  if(commodity==='soybean'){
    if(/(?:CBOT|ZS=F|대두\s*선물)[^.!?\n]{0,55}(?:US¢\/lb|센트\s*\/\s*파운드|cents?\s*\/\s*lb|ZL=F)/i.test(body))issues.push('soybean-benchmark-or-quotation-unit-mismatch');
    if(/미국(?:의|산|내)\s*(?:마토그로소|Mato Grosso)/i.test(body))issues.push('mato-grosso-is-brazil-not-us');
  }
  if(commodity==='soybean-oil'){
    // Known scope confusion: a national import total is not an origin allocation.
    if(/인도[^.!?\n]{0,120}남미(?:산)?[^.!?\n]{0,60}(?:수입|수요)[^.!?\n]{0,30}\d[\d,.]*\s*(?:million\s*(?:MT|tons?|tonnes?)|MMT|백만\s*톤|만\s*톤)/i.test(body))
      issues.push('soybean-oil-import-total-not-south-american-allocation');
    if(/(?:ZL(?:=F)?|대두유\s*선물|soybean\s*oil\s*futures)[^.!?\n]{0,65}(?:ZS(?:=F)?|US¢\/bu|cents?\s*\/\s*bushel|센트\s*\/\s*부셸)|(?:ZS=F)[^.!?\n]{0,35}(?:대두유|soybean\s*oil)/i.test(body))issues.push('soybean-oil-benchmark-or-quotation-unit-mismatch');
    if(/(?:대두유|soybean\s*oil)[^.!?\n]{0,40}(?:2222000)|(?:4232000)[^.!?\n]{0,35}(?:대두\s*곡물|soybean\s*grain)/i.test(body))issues.push('soybean-oil-psd-commodity-mismatch');
    if(/(?:생산\s*[\/÷]\s*압착|production\s*\/\s*crush|생산[^.!?\n]{0,12}압착[^.!?\n]{0,8}(?:비율|환산율))[^!?\n]{0,45}(?:실측|측정된|measured)[^.!?\n]{0,25}(?:효율|수율|efficiency|yield)(?![^.!?\n]{0,12}(?:아님|아닙|아니|not))/i.test(body))issues.push('soybean-oil-aggregate-ratio-is-not-measured-efficiency');
    if(/(?:NOPA|회원사)[^.!?\n]{0,50}(?:세계|글로벌|world)[^.!?\n]{0,25}(?:재고|stocks?)(?![^.!?\n]{0,15}(?:아님|아닙|아니|구분|not))/i.test(body))issues.push('nopa-members-are-not-world-inventory');
    if(/(?:선물|futures)[^.!?\n]{0,40}(?:현물|도착\s*원가|landed)[^.!?\n]{0,25}(?:확정|보장|guarantee)/i.test(body))issues.push('futures-do-not-confirm-physical-procurement-cost');
    if(/(?:대표\s*지점|격자|모델\s*기상)[^.!?\n]{0,50}(?:작황\s*피해|정제소\s*(?:중단|폐쇄)|국가\s*공급\s*차질)[^.!?\n]{0,20}(?:확정|입증했습니다|보장)/i.test(body))issues.push('upstream-point-weather-does-not-prove-downstream-damage');
  }
  if(commodity==='palm-oil'){
    if(/(?:CPO|FCPOc1)[^.!?\n]{0,35}(?:USD\s*\/\s*MT|달러\s*\/\s*톤)(?![^.!?\n]{0,15}(?:환산|converted))|(?:FPOLc1|RBD\s*(?:Palm\s*)?Olein)[^!?\n]{0,35}MYR\s*\/\s*MT/i.test(body))issues.push('palm-benchmark-currency-mismatch');
    if(/(?:선물|FCPO|FPOL)[^.!?\n]{0,35}(?:현물|도착\s*원가|공급사\s*견적)[^.!?\n]{0,25}(?:보장|확정됩니다|동일합니다)/i.test(body))issues.push('palm-futures-not-executable-refined-oil');
    if(/(?:선물|CPO|올레인)[^.!?\n]{0,35}(?:실제|실측|확정)[^.!?\n]{0,15}(?:가공|정제)\s*마진(?![^.!?\n]{0,80}(?:미확인|미검증|아닙|아님|not\s+(?:verified|confirmed)))/i.test(body))issues.push('palm-futures-not-actual-refining-margin');
    if(/(?:재고[^.!?\n]{0,30}(?:타이트|심각한\s*부족)|(?:약세|강세|반등세)[^.!?\n]{0,15}(?:지속|유지))/.test(body)&&!/(?:지속\s*추세.*(?:미확인|입증하지)|재고\s*적정성.*(?:미확인|판정.*아닙))/.test(body))issues.push('palm-stock-adequacy-or-sustained-trend-requires-specific-evidence');
  }
  if(commodity==='sugar'){
    if(/(?:SB=F|No\.?\s*11|원당\s*선물)[^!?\n]{0,40}(?:US¢\/bu|cents?\s*\/\s*bushel|센트\s*\/\s*부셸)|(?:ICE\s*No\.?\s*5)[^!?\n]{0,25}(?:SB=F|US¢\/lb)/i.test(body))issues.push('sugar-benchmark-or-quotation-unit-mismatch');
    if(/(?:SB=F|원당\s*선물)[^.!?\n]{0,35}(?:정제유|백설탕\s*현물|도착\s*원가)[^.!?\n]{0,20}(?:동일|보장|확정됩니다)/i.test(body))issues.push('raw-sugar-futures-not-refined-offer');
    if(/USDA[^.!?\n]{0,45}(?:세계\s*설탕|global\s*sugar)[^.!?\n]{0,30}(?:STRV|short\s*tons)/i.test(body))issues.push('sugar-us-strv-not-world-metric-forecast');
  }
  if ((executive.match(/[가-힣]/g)||[]).length<85) issues.push('insufficient-substantive-korean-report');
  if (!Array.isArray(report.bullishFactors) || !Array.isArray(report.bearishFactors) || !Array.isArray(report.watchItems) ||
    report.bullishFactors.length<2 || report.bearishFactors.length<2 || report.watchItems.length<2)
    issues.push('market-drivers-or-watch-items-insufficient');
  // Conditional physical purchasing: neither a futures move nor supply estimate
  // independently proves a change in delivered KRW cost for Nongshim.
  // Only the shared presentation-bound parser supplies this program-owned
  // policy. Raw/legacy callers retain the original explicit-condition checks.
  if (policy!==RMS_PROCUREMENT_POLICY && /매수|구매|계약|선도|발주|확보|헤지|커버리지|조달/.test(recommendation)) {
    for (const [label,pattern] of [
      ['physical-basis',/베이시스|basis|FOB|현물\s*오퍼/i],
      ['ocean-freight',/운임|해상\s*운송비|freight/i],
      ['fx',/환율|USD\/?KRW/i],
      ['supplier-quote',/실제\s*공급사\s*견적|공급사.*오퍼|실물.*가격|견적.*비교/i],
    ] as const) if (!pattern.test(body)) issues.push('missing-buying-condition:'+label);
    if (!/비교|확인|견적|조건|검토|산정|검증|확보\s*전/.test(body))
      issues.push('unqualified-procurement-call');
  }
  const direct=sources.filter(s=>isDirectCornAiSource(s.url));
  const distinctHosts=new Set(direct.map(s=>publisherFamily(String(s.url))));
  if (direct.length<2 || distinctHosts.size<2)
    issues.push('at-least-two-independent-direct-publisher-links-required');
  if (/평단가|평균\s*(?:가격|FOB)/.test(body) && /FOB/.test(body))
    issues.push('avoid-unsubstantiated-fob-average-price-label');
  return issues;
}
export function cornAiIntegrityIssues(report:CornAiReport,sources:CornAiSource[],policy?:typeof RMS_PROCUREMENT_POLICY){return publisherResearchIntegrityIssues(report,sources,'corn',policy);}
export function ensurePublisherResearchIntegrity(report:CornAiReport,sources:CornAiSource[],commodity:'corn'|'soybean'|'soybean-oil'|'palm-oil'|'sugar'|'potato-starch',policy?:typeof RMS_PROCUREMENT_POLICY){
 const issues=publisherResearchIntegrityIssues(report,sources,commodity,policy);
 if(issues.length)throw new Error(commodity+' AI evidence/procurement guard failed; prior snapshot preserved: '+issues.join('; '));
}
export function ensureCornAiIntegrity(report: CornAiReport, sources: CornAiSource[],policy?:typeof RMS_PROCUREMENT_POLICY): void {
  const issues=cornAiIntegrityIssues(report,sources,policy);
  if (issues.length) throw new Error('Corn AI evidence/procurement guard failed; prior snapshot preserved: '+issues.join('; '));
}
