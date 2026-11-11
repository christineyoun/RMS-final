/** Shared presentation only: procurement-risk severity owns every badge color.
 * No recommendation text, risk classification, or data is derived here.
 */
export const PROCUREMENT_RISK_BADGE_PALETTE = {
  '안정': 'rms-status-positive bg-[#F0FDF4] border-[#86EFAC] text-[#059669]',
  '주의': 'rms-status-warning text-[#EC870C] bg-[#fff7ed] border-[#fed7aa]',
  '경계': 'rms-status-negative text-red-700 bg-red-50 border-red-200',
  '판정 보류': 'bg-slate-100 text-slate-600 border-slate-300',
} as const;

/** Unknown, stale, or missing STEP 7 level must never claim a risk severity. */
export function getRiskBadgeColor(level: string | null | undefined): string {
  if (level === '안정' || level === '주의' || level === '경계') {
    return PROCUREMENT_RISK_BADGE_PALETTE[level];
  }
  return PROCUREMENT_RISK_BADGE_PALETTE['판정 보류'];
}

export const DESK_RECOMMENDATION_STYLE = 'rms-desk-recommendation border font-bold px-2.5 py-1 rounded-md';

/** Recommendation wording does not determine its badge color: STEP 7 risk does. */
export function getRecommendationColor(_text: string, riskLevel?: string | null): string {
  return `${DESK_RECOMMENDATION_STYLE} ${getRiskBadgeColor(riskLevel)}`;
}
