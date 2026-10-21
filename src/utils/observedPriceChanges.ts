/** Calculate price movements only from dated, actual source observations.
 * Return unavailable when there is no nearby observation for the comparison window.
 * Amounts stay in USD/MT; the UI converts them using the same FX as its price.
 */
export type ObservedMove = { pct: number | null; amountUsdMt: number | null; referenceDate: string | null };
export type ObservedPriceChanges = { wow: ObservedMove; mom: ObservedMove };

const unavailable = (): ObservedMove => ({ pct: null, amountUsdMt: null, referenceDate: null });
const DAY_MS = 86_400_000;
const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

export function observedPriceChanges(input: Array<{ date: string; usdPerMT: number; isSynthetic?: boolean }>): ObservedPriceChanges {
  const byDate = new Map<string, number>();
  for (const item of input) {
    if (item && !item.isSynthetic && Date.parse(item.date) <= Date.now() && validDate(item.date) && Number.isFinite(item.usdPerMT) && item.usdPerMT > 0) {
      byDate.set(item.date, item.usdPerMT);
    }
  }
  const points = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (points.length < 2) return { wow: unavailable(), mom: unavailable() };
  const [latestDate, latestPrice] = points[points.length - 1];
  const latestMs = Date.parse(`${latestDate}T00:00:00Z`);

  const movement = (targetDays: number, toleranceDays: number): ObservedMove => {
    let reference: [string, number] | null = null;
    let minGap = Infinity;
    for (const candidate of points.slice(0, -1)) {
      const age = (latestMs - Date.parse(`${candidate[0]}T00:00:00Z`)) / DAY_MS;
      const gap = Math.abs(age - targetDays);
      if (age > 0 && gap <= toleranceDays && gap < minGap) {
        minGap = gap;
        reference = candidate;
      }
    }
    if (!reference) return unavailable();
    const [referenceDate, previousPrice] = reference;
    return {
      pct: Number((((latestPrice - previousPrice) / previousPrice) * 100).toFixed(2)),
      amountUsdMt: Number((latestPrice - previousPrice).toFixed(2)),
      referenceDate,
    };
  };
  return { wow: movement(7, 4), mom: movement(30, 7) };
}
