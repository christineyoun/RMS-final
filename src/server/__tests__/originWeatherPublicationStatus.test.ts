import assert from 'node:assert/strict';
import {test} from 'node:test';
import fixture from './fixtures/origin-weather-minima-all8-v1.json';
import {originWeatherPublicationStatus} from '../originWeatherPublicationStatus.ts';
import {parseSharedOpenMeteo,weatherWindowEnd} from '../originWeatherService.ts';
import type {OriginRadarResponse} from '../originRadarService.ts';

function group<T>(values:T[],key:(value:T)=>string) {
  const groups:Record<string,T[]>={};
  for(const value of values)(groups[key(value)]??=[]).push(value);
  return groups;
}
// Retain the real fixture's locations, timezone and evaluation instant, and build
// a controlled 28-day provider payload. Some original minima fixtures span 7 days.
const records=fixture.records.map(r=>{
  const raw=structuredClone(r.evidence.rawResponse);
  raw.daily.time=Array.from({length:28},(_,i)=>new Date(Date.parse(r.evidence.lastDay)-(27-i)*86400000).toISOString().slice(0,10));
  raw.daily.precipitation_sum=Array(28).fill(5);
  raw.daily.temperature_2m_max=Array(28).fill(24);
  raw.daily.temperature_2m_min=Array(28).fill(12);
  const evidence=parseSharedOpenMeteo(raw,r.point,r.evidence.checkedAt,28,true);
  assert(evidence);
  return {...r,evidence};
});
const groups=group(records,r=>r.commodity);
function publish(rows:typeof records,id:string):OriginRadarResponse{
  const origins=Object.entries(group(rows,r=>r.point.key)).map(([originKey,records])=>{
    const evidence=records!.map(r=>r.evidence);
    return {originKey,weatherEvidence:id==='palm-oil'?{shared:evidence[0]}:
      ['wheat','corn','soybean'].includes(id)?evidence:evidence[0]};
  });
  return {success:true,statusCode:200,lastUpdated:'',origins,sourcesUsed:[],sourceFooterText:''} as OriginRadarResponse;
}

test('all eight check exactly the 46 configured local weather windows and do not promote retained evidence',async()=>{
  let assessed=0;
  for (const [id,rows] of Object.entries(groups)){
    assert(rows?.length);
    const publication=publish(rows,id);
    const now=new Date(Math.max(...rows.map(r=>Date.parse(r.evidence.checkedAt))));
    const before=JSON.stringify(publication);
    const current=await originWeatherPublicationStatus(id,publication,now);
    assert.equal(current.counts.current,rows.length,id);
    assert(current.points.every(p=>p.observed===p.expected));
    const tomorrow=new Date(now.getTime()+86400000);
    const old=await originWeatherPublicationStatus(id,publication,tomorrow);
    assert.equal(old.counts.current,0);
    assert.equal(old.counts.retained,rows.length);
    assert.equal(old.latestObservation,current.latestObservation);
    assert(old.points.every(p=>p.observed&&p.expected&&p.observed<p.expected));
    assessed+=old.points.length;
    assert.equal(JSON.stringify(publication),before,'last known published weather is preserved');
  }
  assert.equal(assessed,46);
});

test('missing peer points, invalid receipts and incomplete current windows do not pass',async()=>{
  const rows=structuredClone(groups.wheat!);
  const now=new Date(Math.max(...rows.map(r=>Date.parse(r.evidence.checkedAt))));
  const invalid=rows[1];
  invalid.evidence.history[0].precipMm=999;
  const partial=rows[2];
  const body=partial.evidence.rawResponse;
  body.daily.temperature_2m_min[body.daily.time.indexOf(partial.evidence.lastDay)]=null;
  const parsed=parseSharedOpenMeteo(body,partial.point,partial.evidence.checkedAt,28,true);
  assert(parsed);
  partial.evidence=parsed;
  assert.equal(parsed.minimumTemperatureDays,6);

  const flags=await originWeatherPublicationStatus('wheat',publish(rows.slice(1),'wheat'),now);
  assert.equal(flags.counts.missing,1);
  assert.equal(flags.counts.invalid,1);
  assert.equal(flags.counts.incomplete,1);
  assert.equal(flags.counts.current,rows.length-3);
});

test('when only one location crossed midnight it alone becomes retained, even though all were checked on the same date',async()=>{
  const rows=groups['soybean-oil']!;
  const start=new Date(rows[0].evidence.checkedAt);
  const publication=publish(rows,'soybean-oil');
  let mixed:Awaited<ReturnType<typeof originWeatherPublicationStatus>>|undefined;
  for(let hours=1;hours<=24;hours++){
    const now=new Date(start.getTime()+hours*3600000);
    const expected=rows.map(r=>weatherWindowEnd(now,r.evidence.timeZone));
    const advanced=rows.filter((r,i)=>r.evidence.lastDay<expected[i]).length;
    if(advanced>0&&advanced<rows.length){
      mixed=await originWeatherPublicationStatus('soybean-oil',publication,now);
      assert.equal(mixed.counts.retained,advanced);
      assert.equal(mixed.counts.current,rows.length-advanced);
      break;
    }
  }
  assert(mixed,'fixture covers multiple local midnights');
});
