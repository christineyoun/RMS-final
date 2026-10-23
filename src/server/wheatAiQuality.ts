/**
 * Wheat-specific post-generation safety checks.
 * This is NOT a fact checker: it rejects a small set of known stale references
 * and unsupported procurement implications. Source claim matching still needs
 * human review; do not portray a grounding URL as proof of every statement.
 * Pure/offline, no API calls.
 */
import {RMS_PROCUREMENT_POLICY,procurementPolicyContradictions} from '../utils/rmsProcurementCondition.ts';
import {publisherProcurementIssues,publisherAttributionIssues} from './cornAiQuality.ts';
export interface WheatAiCheckInput {
  deskRecommendation?: string;
  executiveSummary?: string;
  bullishFactors?: string[];
  bearishFactors?: string[];
  watchItems?: string[];
}
export interface WheatAiSource { url?: string; title?: string }

export function wheatAiIntegrityIssues(
  report: WheatAiCheckInput,
  sources: WheatAiSource[],
  asOf = new Date(),
  policy?:typeof RMS_PROCUREMENT_POLICY
): string[] {
  const recommendation = String(report.deskRecommendation || '');
  const body = [recommendation, report.executiveSummary || '', ...(report.bullishFactors || []),
    ...(report.bearishFactors || []), ...(report.watchItems || [])].join(' ');
  const issues: string[] = [];
  issues.push(...procurementPolicyContradictions(body));
  issues.push(...publisherProcurementIssues(report),...publisherAttributionIssues(report,sources));
  const dated = asOf.getTime() >= Date.UTC(2026, 8, 1);
  // A May 2026 Australian forecast must not masquerade as the latest outlook.
  const outdatedAustraliaForecast = sources.some(s =>
    /teucrium\.substack\.com\/p\/wheat-when-the-worlds-fourth-largest/i.test(s.url || ''));
  if (dated && outdatedAustraliaForecast && /호주|Australia|ABARES|엘니뇨|El Ni.n?o/i.test(body)) {
    issues.push('stale-australia-source: May 2026 Teucrium outlook is not suitable as a current Australian crop forecast');
  }
  // Correct comparison dimensions for the specifically verified Oct 2026 USDA edition.
  if (/2026\/27|2026년\s*10월|10월\s*9일/.test(body) && /미국/.test(body)) {
    if (/(?:밀\s*)?수출\s*(?:전망|량)[^,，;。.!?\n]{0,35}(?:7억\s*4,000만\s*부셸|740\s*million\s*bushels)/i.test(body)) {
      issues.push('usda-oct2026-export-stock-swap: 740m bushels is ending stocks, not exports');
    }
    if (/기말\s*재고[^,，;。.!?\n]{0,35}(?:7억\s*5,000만\s*부셸|750\s*million\s*bushels)/i.test(body)) {
      issues.push('usda-oct2026-export-stock-swap: 750m bushels is exports, not ending stocks');
    }
  }
  // Physical basis and actual supplier purchasing costs cannot be inferred from futures/export cuts alone.
  const assertsBasisFall = /베이시스\s*(?:약세|완화|하락|인하|축소)|(?:basis)\s*(?:weakening|falling|declining)/i.test(body);
  const conditionalBasis = /(?:베이시스|basis)[^.!?\n]{0,65}(?:실제|견적|오퍼|확인|검증|비교|조건부|모니터링|검토)/i.test(body) ||
    /(?:실제|견적|오퍼|확인|검증|비교|조건부)[^.!?\n]{0,40}(?:베이시스|basis)/i.test(body);
  if (assertsBasisFall && !conditionalBasis) {
    issues.push('unsupported-basis-direction: basis weakness asserted without qualifying actual physical quotes');
  }
  if (policy!==RMS_PROCUREMENT_POLICY && /매수|구매|선도\s*계약|헤지|커버리지/.test(recommendation)) {
    const missing = ['베이시스', '운임', '환율', '실제 공급사 견적'].filter(k => !body.includes(k));
    if (missing.length) issues.push('purchase-conditions-missing: ' + missing.join(', '));
    if (!/확인|검토|비교|검증|확정|조건|견적/.test(body)) {
      issues.push('purchase-conditions-unqualified');
    }
  }
  return issues;
}

export function ensureWheatAiIntegrity(report: WheatAiCheckInput, sources: WheatAiSource[], asOf?: Date,policy?:typeof RMS_PROCUREMENT_POLICY): void {
  const problems = wheatAiIntegrityIssues(report, sources, asOf,policy);
  if (problems.length) {
    throw new Error('Wheat AI factual/procurement guard failed; saved analysis preserved: ' + problems.join('; '));
  }
}
