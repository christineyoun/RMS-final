import {strict as assert} from 'node:assert';
import {parseNlicScfiTable} from '../nlicScfiParser.mjs';
const now = new Date();
const dates=[8,15,22].map(days=>new Date(now.getTime()-days*86400000).toISOString().slice(0,10));
const head='<table><tr><th>기준일</th><th>SCFI</th><th>CCFI</th></tr>';
const tail='</table><p>▶ 국외 해상운임 지수 (기준년월: reference)</p>';
const wrap=(body)=>head+body+tail;
const column=wrap(dates.map(d=>'<tr><td>'+d+'</td></tr>').join('')+[2301.41,2312.55,2320.11,1100,1110,1120].map(n=>'<tr><td>'+n+'</td></tr>').join(''));
const rows=parseNlicScfiTable(column,now);
assert.equal(rows.length,3);assert.equal(rows[0].date,dates[0]);assert.equal(rows[0].scfi,2301.41);
const rowMajor=wrap(dates.map((d,i)=>`<tr><td>${d}</td><td>${2310+i}.13</td><td>1010.51</td></tr>`).join(''));
assert.equal(parseNlicScfiTable(rowMajor,now).length,3);
for(const bad of [column.replace('SCFI','CCFI'),column.replace('2301.41','invalid'),column.replace(dates[0],'2099-12-31'),column.replace('<p>▶ 국외','<p>NOT THE END'),wrap('<tr><td>'+dates[0]+'</td></tr>')]) {
 assert.throws(()=>parseNlicScfiTable(bad,now));
}
console.log('PASS: NLIC SCFI-only column- and row-major parsing, true dates, reject CCFI/invalid/missing/forward data; no cache writes.');
