/**
 * Shared, cost-free text-quality gate for RMS Market Intelligence.
 * Applied to both stored snapshots and new summaries, for all eight commodities.
 * A pass means the Korean summary contains actionable market information;
 * it does NOT independently validate numerical facts or the publisher URL.
 */
const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const boilerplate = [
  /구체적(?:인)?\s*(?:가격|수치|내용|자료|정보|데이터)[^.!?]{0,65}(?:제공되지|포함되지|확인되지|제시되지|없(?:어|다|으며|습니다|음))/i,
  /(?:가격|수급|생산|재고|수출|수입)\s*(?:관련\s*)?(?:수치|정보|데이터)[^.!?]{0,60}(?:제공되지|확인되지|제시되지|없(?:어|다|습니다))/i,
  /(?:이번|해당|본|원문|기사|보고서)[^.!?]{0,70}(?:구체적|세부)[^.!?]{0,65}(?:제공되지|없(?:어|다|습니다)|확인할\s*수\s*없)/i,
  /(?:기사|본문|원문|보고서)[^.!?]{0,45}(?:제공되지\s*않|확인되지\s*않|내용을\s*확인할\s*수\s*없)/i,
  /시장\s*(?:분석|동향)\s*보고서[^.!?]{0,40}(?:발표|소개)(?:되었|했|됐다)/i,
  /(?:보고서|자료)는?\s*(?:전반적인|일반적인|다양한)\s*(?:시장|곡물|농산물)[^.!?]{0,45}(?:다룬|소개|제시)/i,
  /(?:자세한\s*(?:내용|수치)|세부\s*(?:정보|내용))[^.!?]{0,35}(?:원문|참조|확인)\s*(?:에서|을|하)/i,
];
const marketSubject = /(?:가격|시세|선물|현물|FOB|운임|환율|생산|수확|재배|작황|수출|수입|수급|재고|소비|수요|공급|교역|물류|파종|관세|기상|강수|가뭄|홍수|항만|선적|수매|조달|납기|재배면적|계약)/i;
const development = /(?:상승|하락|증가|감소|확대|축소|상향|하향|급등|급락|반등|조정|강세|약세|차질|지연|중단|회복|부진|부족|초과|개선|악화|변동\s*없음|동결|유지|높아|낮아|증산|감산|감소세|증가세|집중|압박|견조|둔화|전환|중단|제한|위축|강화|완화|불안|과잉|호조|타격|악천후|차단|급변)/i;
const concreteValue = /(?:\d[\d,.]*\s*(?:%|달러|원|톤|부셸|mt|mmt|mm|cents?|usd|억|만|천)|(?:전년|전월|전주|지난주|올해|내년|이번\s*달|이번\s*주)\s*(?:대비|보다|수준))/i;
const cropAliases: Record<string, RegExp> = {
  wheat: /(?:밀|소맥|wheat|HRW|SRW|HRS)/i,
  corn: /(?:옥수수|maize|corn)/i,
  soybean: /(?:대두|콩|soybean|soyabean)/i,
  'soybean-oil': /(?:대두유|콩기름|soybean\s*oil|soyoil)/i,
  'palm-oil': /(?:팜유|팜올레인|palm|olein|CPO)/i,
  sugar: /(?:설탕|원당|사탕수수|sugar)/i,
  'potato-starch': /(?:감자\s*전분|감자전분|potato\s*starch)/i,
  'tapioca-starch': /(?:타피오카|카사바|tapioca|cassava)/i,
};

export type NewsSummaryQuality = { pass: boolean; reason: 'ok' | 'missing-korean-summary' | 'boilerplate' | 'off-topic' | 'no-specific-market-development' };
export function assessNewsSummary(summary: unknown, title: unknown, commodityId: string): NewsSummaryQuality {
  const s = normalize(summary), t = normalize(title);
  if (s.length < 45 || !/[가-힣]/.test(s)) return {pass:false,reason:'missing-korean-summary'};
  if (boilerplate.some(re => re.test(s))) return {pass:false,reason:'boilerplate'};
  const crop = cropAliases[commodityId.toLowerCase().replace(/_/g,'-')];
  if (crop && !crop.test(`${t} ${s}`)) {
    // Some publisher titles are broad (e.g. global grains), but an article
    // must still identify its RMS commodity rather than a different crop.
    return {pass:false,reason:'off-topic'};
  }
  if (!marketSubject.test(s) || !(development.test(s) || concreteValue.test(s))) {
    return {pass:false,reason:'no-specific-market-development'};
  }
  return {pass:true,reason:'ok'};
}
