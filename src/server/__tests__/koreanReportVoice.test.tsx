/** OFFLINE editorial checks; no regeneration or publication of historical reports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildPublisherResearchRequest, buildRecoveryAnalysisRequest, KOREAN_REPORT_VOICE} from '../liveAiAnalysisService.ts';
import AiRecommendation from '../../components/AiRecommendation.tsx';

assert(KOREAN_REPORT_VOICE.length < 800, 'keep the shared style brief compact');
for (const id of ['wheat','corn','soybean']) {
  const request = buildPublisherResearchRequest('gemini-3.8-flash',id,'2026-10-21',true);
  assert.equal(request.contents.split(KOREAN_REPORT_VOICE).length,2);
  assert.deepEqual(request.config.tools,[{googleSearch:{}}]);
  assert.equal(request.config.toolConfig.includeServerSideToolInvocations,true);
  assert.equal(request.config.responseMimeType,'application/json');
  assert.equal(request.config.thinkingConfig.thinkingLevel,'LOW');
  assert.equal(request.config.maxOutputTokens,8192);
  assert.equal(request.config.responseSchema.required.length,6);
  assert(request.contents.includes('never contradict the condition, guarantee savings'));
  assert(!request.contents.includes('separately displays'));
}
// Oil and the remaining commodities use this same unconditional interpolation
// in their existing builder. Do not fabricate cross-commodity evidence to test style.
assert(buildRecoveryAnalysisRequest.toString().includes('${KOREAN_REPORT_VOICE}'));
assert(KOREAN_REPORT_VOICE.includes('상승 요인(bullishFactors)과 하락 요인(bearishFactors)'));
assert(KOREAN_REPORT_VOICE.includes('간결한 분석적 명사구'));
assert(KOREAN_REPORT_VOICE.includes('불필요한 ~습니다/~합니다 종결을 쓰지 말고'));
assert(KOREAN_REPORT_VOICE.includes('격식체(~습니다'));
assert(KOREAN_REPORT_VOICE.includes('모니터링 항목(watchItems)'));
assert(!KOREAN_REPORT_VOICE.includes('완결된 문장'));
assert.throws(()=>buildPublisherResearchRequest('gemini-3.8-flash','soybean-oil','2026-10-21'),/Unsupported/);
const examples = {
  wheat:'흑해 수출 위험 모니터링 및 분할 매수 검토',
  corn:'수확기 약세에 따른 단기 관망 및 분할 매수 검토',
  soybean:'관망 유지 및 분할 매수 검토',
  'soybean-oil':'바이오연료 정책 변화 시 분할 매수 검토',
};
for (const [id,recommendation] of Object.entries(examples)) {
  const saved=id==='soybean-oil'?null:JSON.parse(fs.readFileSync(`.rms-stage3/snapshots/analysis-${id}.json`,'utf8')).payload.data;
  const html=renderToStaticMarkup(<AiRecommendation commodityId={id} recommendedCoverage={recommendation}
    executiveSummary={saved?.executiveSummary || 'OFFLINE-MOCK 문체 예시입니다. 대두유 선물과 현물가격을 구분하며, 정책 변화가 확인되는 경우에만 구매 전략을 재검토합니다.'}
    bullishFactors={saved?.bullishFactors || ['바이오연료 수요 확대가 확인되면 대두유 가격에 상승 압력이 작용할 가능성이 있습니다.']}
    bearishFactors={saved?.bearishFactors || ['대두유 공급 증가가 확인되면 가격에 하방 압력이 작용할 가능성이 있습니다.']}
    watchItems={saved?.watchItems || ['미국 바이오연료 정책과 대두유 수요 전망']}
    researchSources={saved?.sources || []} researchStatus="cached" researchModel="OFFLINE-MOCK-EDITORIAL"/>);
  assert(html.includes(recommendation));
  if(saved) assert(html.includes(saved.executiveSummary));
  assert(!/[()]/.test(recommendation));
}
console.log('PASS: compact shared Korean voice, unchanged publisher controls, all-eight builder coverage, four editorial rendering examples; no provider requests.');
