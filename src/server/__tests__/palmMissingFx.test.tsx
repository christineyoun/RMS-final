import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommodityDetail} from '../../components/CommodityDetail.tsx';
import {COMMODITIES} from '../../data/commoditiesData.ts';
const commodity=COMMODITIES.find(c=>c.id==='palm-oil')!;
for(const currency of ['KRW','EUR'] as const){
  const html=renderToStaticMarkup(<CommodityDetail commodity={commodity} currency={currency} onNavigateBack={()=>{}} onRefreshGemini={()=>{}} isSyncing={false}/>);
  assert.ok(html.includes('환율 또는 가격 자료를 확인 중입니다.'),'missing FX cannot display a fallback-rate chart');
  assert.ok(!html.includes('NaN')&&!html.includes('Infinity'));
}
console.log('PASS: Palm KRW/EUR charts stay unavailable before verified FX rather than using a fixed fallback rate.');
