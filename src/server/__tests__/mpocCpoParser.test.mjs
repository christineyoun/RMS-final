import assert from 'node:assert/strict';
import {parseMpocCpoTable,MPOC_CPO_URL} from '../mpocCpoParser.mjs';
const now=new Date('2026-11-05T03:00:00Z');
const fixture=(rows,contract='Jan, 27 Contract')=>`<!doctype html><html><body><div>Palm OilPrice Today RM 4496 (${contract})</div>
<h1>Daily Palm Oil Prices</h1><h2>CPO Prices</h2><figure class="wp-block-table"><table><thead><tr><th>Pricing Date</th><th>Settlement Price RM</th></tr></thead>
<tbody>${rows.map(([date,price])=>`<tr><td>${date}</td><td>${price}</td></tr>`).join('')}</tbody></table></figure>
<a href="https://www.bursamalaysia.com">Palm Oil Prices : Courtesy of Bursa Malaysia Berhad</a>
<h2>CPO , SFO and SBO Prices (US$/MT)</h2><table><tr><td>Date</td><td>CPO, BMD+3</td></tr><tr><td>26-Oct</td><td>1064</td></tr></table>
</body></html>`;
const rows=[['22 Oct 26','4,792'],['23 Oct 26','4,818'],['2 Nov 26','4,649'],['4 Nov 26','4496']];
const good=parseMpocCpoTable(fixture(rows),now);
assert.equal(MPOC_CPO_URL,'https://www.mpoc.org.my/market-insight/daily-palm-oil-prices/');
assert.equal(good.contractMonth,'2027-01');
assert.equal(good.rows.length,4);
assert.deepEqual(good.rows[0],{date:'2026-10-22',value:4792});
assert.deepEqual(good.rows.at(-1),{date:'2026-11-04',value:4496});
assert.ok(good.rows.every(p=>p.date.startsWith('2026-')));
assert.equal(parseMpocCpoTable(fixture(rows,'Feb, 27 Contract'),now).contractMonth,'2027-02');
for(const bad of [
  fixture(rows).replace('Settlement Price RM','Settlement Price USD'),
  fixture([['22 Oct 26','4,792'],['22 Oct 26','4,890']]),
  fixture([['22 Oct 26','4,792'],['23 Oct 26','not a price']]),
  fixture([['29 Feb 26','4,792']]),
  fixture([['6 Nov 26','4,792']]),
  fixture(rows,'Unknown Contract'),
  fixture(rows).replaceAll('Bursa Malaysia','Not Bursa'),
  fixture(rows).replaceAll('CPO Prices','SBO Prices'),
  fixture(rows)+'<table><tr><td>Pricing Date</td><td>Settlement Price RM</td></tr><tr><td>4 Nov 26</td><td>4496</td></tr></table>'
])assert.throws(()=>parseMpocCpoTable(bad,now),'Invalid publisher page or a conflicting table must never create a price');
console.log('PASS: MPOC dated Bursa CPO settlement table, explicit contract month, MYR units, chronological order, no invented prices, reject contradictory/foreign/future data.');
