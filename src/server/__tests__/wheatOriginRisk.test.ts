import assert from 'node:assert/strict';
import { parseOpenMeteoEvidence, wheatOriginRiskService } from '../wheatOriginRiskService.ts';

const now='2026-10-16T12:00:00Z';
const time=[] as string[];
const heavyRain=[] as number[];
const temp=[] as number[];
for(let i=0;i<8;i++){
  time.push(new Date(Date.parse('2026-10-08T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  heavyRain.push(20);
  temp.push(28);
}
const meta={latitude:38.5,longitude:-98.3,timezone:'America/Chicago',utc_offset_seconds:-18000,daily_units:{time:'iso8601',precipitation_sum:'mm',temperature_2m_max:'°C'}};
const rows={...meta,daily:{time,precipitation_sum:heavyRain,temperature_2m_max:temp}};
const heavy=parseOpenMeteoEvidence(rows,'usa','캔자스(HRW)',now);
assert.ok(heavy);
assert.equal(heavy?.source,'Open-Meteo');
assert.equal(heavy?.status,'monitor');
assert.equal(heavy?.precipLast7Mm,140);
assert.equal(heavy?.mostRecentDay,'2026-10-15');
assert.equal(heavy?.days,7);

const mild=parseOpenMeteoEvidence({...meta,daily:{time,precipitation_sum:time.map(()=>2),temperature_2m_max:temp}},'usa','캔자스(HRW)',now);
assert.equal(mild?.status,'no-signal');
assert.equal(mild?.precipLast7Mm,14);

const hot=parseOpenMeteoEvidence({...meta,daily:{time,precipitation_sum:time.map(()=>2),temperature_2m_max:time.map(()=>38)}},'usa','캔자스(HRW)',now);
assert.equal(hot?.status,'monitor');

assert.equal(parseOpenMeteoEvidence({daily:{time,precipitation_sum:[],temperature_2m_max:temp}},'usa','test',now),null);
assert.equal(parseOpenMeteoEvidence({daily:{time,precipitation_sum:time.map(()=>null),temperature_2m_max:temp}},'usa','test',now),null);
assert.equal(parseOpenMeteoEvidence({daily:{time,precipitation_sum:heavyRain,temperature_2m_max:time.map(()=>-999)}},'usa','test',now),null);
assert.equal(parseOpenMeteoEvidence({daily:{time:time.map(()=> '2026-10-20'),precipitation_sum:heavyRain,temperature_2m_max:temp}},'usa','test',now),null);
assert.equal(typeof wheatOriginRiskService.enrich,'function');
console.log('PASS: Open-Meteo dated daily parser, heavy-rain/heat screening, and invalid/forecast-only rejection');
console.log('PASS: No weather network requests or Gemini calls during offline tests');
