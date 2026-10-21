/** RMS policy, not Gemini-authored analysis or evidence of current offers. */
export const RMS_PROCUREMENT_POLICY='rms-procurement-conditions-v1' as const;
export const RMS_PROCUREMENT_CONDITION='실제 발주 전 공급사 견적을 비교하고, 현물 베이시스·운임·환율·재고 조건을 종합적으로 확인하세요.';

/** A visible policy cannot cure analytical assertions that contradict it. */
export function procurementPolicyContradictions(body:string):string[] {
  const issues:string[]=[];
  if (/(?:견적|베이시스|운임|환율|재고)[^.!?\n]{0,30}(?:확인|비교|검토)[^.!?\n]{0,12}(?:필요\s*없|불필요합니다|생략해도|생략하세요|무시하세요|하지\s*않아도)|(?:견적|베이시스|운임|환율|재고)[^.!?\n]{0,15}(?:무시하고|확인\s*없이|비교\s*없이)/.test(body))
    issues.push('procurement-policy-contradiction:required-checks-bypassed');
  if (/(?:보장된?|확실한)\s*(?:절감|수익)|(?:원가|도입\s*가격|구매\s*비용|수입\s*단가)[^.!?\n]{0,35}(?:하락|인하|절감)[^.!?\n]{0,12}(?:보장|확실)|(?:무조건|반드시)[^.!?\n]{0,20}(?:싸게|저렴하게|절감)/.test(body))
    issues.push('procurement-policy-contradiction:guaranteed-purchasing-outcome');
  if (/(?:무조건|조건\s*없이)[^.!?\n]{0,25}(?:매수|구매|발주|계약)|(?:즉시|지금)[^.!?\n]{0,12}전량[^.!?\n]{0,12}(?:구매|매수|발주|확정)|전량[^.!?\n]{0,12}(?:구매|매수|발주)[^.!?\n]{0,8}(?:확정|집행|권고)/.test(body))
    issues.push('procurement-policy-contradiction:unconditional-purchase');
  return issues;
}
