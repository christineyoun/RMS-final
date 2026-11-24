import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseUsWheatFuturesPdf as next} from '../wheatReportFuturesPdf.ts';
// Synthetic fixtures for parser testing only, never used as live observations.
function fixture(date,heading){return `Weekly Price Report ${date}\n${heading}\nFutures Exchange Settlements\nChicago BOT SRW W 220.46 6.0000\nKansas City BOT HRW K 238.83 6.5000\nMinneapolis MIAX NS/DNS M 257.21 7.0000\nLegend:`;}
const cases=[['November 20, 2026','2026-11-20','March','MAR (H27)',true],['December 18, 2026','2026-12-18','March','MAR (H27)',true],['January 8, 2027','2027-01-08','March','MAR (H27)',false],['October 23, 2026','2026-10-23','December','DEC (Z26)',false],['November 20, 2027','2027-11-20','March','MAR (H28)',true]];
for(const [date,iso,month,heading] of cases)test(`${iso} ${heading}`,()=>{const text=fixture(date,heading);assert.equal(next(text,iso,month)?.srwMt,220.46);});
test('rejects expired previous-year contract',()=>assert.equal(next(fixture('November 20, 2026','MAR (H26)'),'2026-11-20','March'),null));
test('rejects wrong date',()=>assert.equal(next(fixture('November 20, 2026','MAR (H27)'),'2026-11-13','March'),null));
test('rejects inconsistent USD units',()=>assert.equal(next(fixture('November 20, 2026','MAR (H27)').replace('220.46','300.46'),'2026-11-20','March'),null));
test('rejects missing row',()=>assert.equal(next(fixture('November 20, 2026','MAR (H27)').replace('Kansas City','Other City'),'2026-11-20','March'),null));
