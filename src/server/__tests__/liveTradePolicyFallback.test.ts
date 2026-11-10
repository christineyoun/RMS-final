import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {policyRecordPresentation} from '../../utils/overviewMacroPresentation.ts';

test('trade-policy fallback does not promote one historic news URL into live market policy',()=>{
  const source=fs.readFileSync('src/server/stage3DailyUpdates.ts','utf8');
  const start=source.indexOf("    if(key==='trade-policy'){");
  const end=source.indexOf('    const cached=readSnapshot(key);',start);
  assert(start>=0 && end>start);
  const branch=source.slice(start,end);
  assert(!branch.includes('readVerifiedPalmNews().find('));
  assert(!branch.includes('prestasisawit.mpob.gov.my'));
  assert(!branch.includes('인도네시아'));
  assert(branch.includes("const published=readFreePublication()?.data?.transportPolicy;"));
  assert(branch.includes('const p=transport?.policy;'));
  assert(branch.includes("statusTag:'판정 보류'"));
});

test('missing official record is neutral, with no source impersonation or market prediction',()=>{
 const display=policyRecordPresentation({title:'통상 정책',summary:'새 공식 발표가 확인되지 않았습니다.',statusType:'neutral',statusTag:'판정 보류'});
 assert.equal(display.statusType,'neutral');
 assert.equal(display.statusTag,'판정 보류');
 assert.equal(display.sourceUrl,undefined);
 assert.equal(display.procurementImplication,undefined);
});
