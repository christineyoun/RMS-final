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

export function publisherResearchIntegrityIssues(report: CornAiReport, sources: CornAiSource[],commodity:'corn'|'soybean'='corn',policy?:typeof RMS_PROCUREMENT_POLICY): string[] {
  const recommendation=String(report.deskRecommendation||'');
  const executive=String(report.executiveSummary||'');
  const factors=[...(report.bullishFactors||[]), ...(report.bearishFactors||[]), ...(report.watchItems||[])];
  const body=[recommendation,executive,...factors].join(' ');
  const issues:string[]=[];
  issues.push(...procurementPolicyContradictions(body));
  if (!(commodity==='corn'?/(?:옥수수|maize|corn)/i:/(?:대두(?!유)|soybeans?)/i).test(executive)) issues.push(commodity+'-not-identified-in-executive-summary');
  if(commodity==='soybean'){
    if(/(?:CBOT|ZS=F|대두\s*선물)[^.!?\n]{0,55}(?:US¢\/lb|센트\s*\/\s*파운드|cents?\s*\/\s*lb|ZL=F)/i.test(body))issues.push('soybean-benchmark-or-quotation-unit-mismatch');
    if(/미국(?:의|산|내)\s*(?:마토그로소|Mato Grosso)/i.test(body))issues.push('mato-grosso-is-brazil-not-us');
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
  const distinctHosts=new Set(direct.map(s=>new URL(String(s.url)).hostname.replace(/^www\./,'')));
  if (direct.length<2 || distinctHosts.size<2)
    issues.push('at-least-two-independent-direct-publisher-links-required');
  if (/평단가|평균\s*(?:가격|FOB)/.test(body) && /FOB/.test(body))
    issues.push('avoid-unsubstantiated-fob-average-price-label');
  return issues;
}
export function cornAiIntegrityIssues(report:CornAiReport,sources:CornAiSource[],policy?:typeof RMS_PROCUREMENT_POLICY){return publisherResearchIntegrityIssues(report,sources,'corn',policy);}
export function ensurePublisherResearchIntegrity(report:CornAiReport,sources:CornAiSource[],commodity:'corn'|'soybean',policy?:typeof RMS_PROCUREMENT_POLICY){
 const issues=publisherResearchIntegrityIssues(report,sources,commodity,policy);
 if(issues.length)throw new Error(commodity+' AI evidence/procurement guard failed; prior snapshot preserved: '+issues.join('; '));
}
export function ensureCornAiIntegrity(report: CornAiReport, sources: CornAiSource[],policy?:typeof RMS_PROCUREMENT_POLICY): void {
  const issues=cornAiIntegrityIssues(report,sources,policy);
  if (issues.length) throw new Error('Corn AI evidence/procurement guard failed; prior snapshot preserved: '+issues.join('; '));
}
