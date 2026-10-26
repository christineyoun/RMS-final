import assert from 'node:assert/strict';
import {parseUsWheatFuturesPdf} from '../wheatReportFuturesPdf.ts';
import {mergePublishedWheatReport} from '../wheatPriceHistoryStore.ts';
// Numeric settlement rows from the independently retrieved official PR-261023 PDF.
const text=`Weekly Price Report October 23, 2026
DEC (Z26) MAR (H27)
Futures Exchange Settlements
Chicago BOT SRW W 229.64 6.2500 (0.3550)
Kansas City BOT HRW K 244.16 6.6450 (0.3950)
Minneapolis MIAX NS/DNS M 235.71 6.4150 (0.3500)
Legend:`;
const exact=parseUsWheatFuturesPdf(text,'2026-10-23','December')!;assert(exact);
assert.deepEqual([exact.srwMt,exact.hrwMt,exact.hrsMt],[229.64,244.16,235.71]);
assert.equal(parseUsWheatFuturesPdf(text,'2026-10-16','December'),null);
assert.equal(parseUsWheatFuturesPdf(text,'2026-10-23','May'),null);
assert.equal(parseUsWheatFuturesPdf(text.replace('235.71','335.71'),'2026-10-23','December'),null);
const prior:any={version:1,points:[{date:'2026-10-16',srwMt:242.69,hrwMt:258.67,hrsMt:248.57,contractMonth:'December',provenance:'source-verified'}]};
const merged=mergePublishedWheatReport(prior,{...exact,date:exact.reportDate,sourceUrl:'https://uswheat.org/wp-content/uploads/2026/10/PR-261023.pdf'});
assert.equal(prior.points.length,1);assert.equal(merged.history.points.length,2);assert.equal(merged.history.points[0].date,'2026-10-16');
console.log('PASS official October23 printed settlements, crop/contract/date/units, and non-destructive October16 retention.');
