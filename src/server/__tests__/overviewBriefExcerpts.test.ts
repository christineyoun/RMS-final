import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionBrief, firstOverviewSentence } from '../../utils/overviewDecisionBrief';
import { aggregateOverview, OVERVIEW_COMMODITIES } from '../../utils/overviewIntelligence';

test('first Overview sentence preserves citation groups, numbers, and punctuation', () => {
  const pairs = [
    ['예상 단수는 53.3부셸로 조정되었습니다(G100, G110). 추가 내용입니다.', '예상 단수는 53.3부셸로 조정되었습니다(G100, G110).'],
    ['U.S. Wheat Associates 전망입니다. (G12-E2) 다음 문장입니다.', 'U.S. Wheat Associates 전망입니다. (G12-E2)'],
    ['생산이 증가했다 (G100)(G101-E2). 수요는 감소했다.', '생산이 증가했다 (G100)(G101-E2).'],
    ['첫 문장입니다. 다음 문장입니다.', '첫 문장입니다.'],
    ['  \n  관망 유지\n다음 항목  ', '관망 유지'],
    ['일부 시장 가격은 12.29달러', '일부 시장 가격은 12.29달러'],
    [undefined, ''],
  ] as const;
  for (const [before, after] of pairs) assert.equal(firstOverviewSentence(before), after);
});

test('all eight commodities use the same excerpt in market judgments and directive context', () => {
  for (const [id] of OVERVIEW_COMMODITIES) {
    const sentence = '공급 전망이 하향 조정되었습니다(G100, G110).';
    const full = sentence + ' EXCLUDE THIS SECOND SENTENCE.';
    const analysis = { generatedAt: '2026-11-13T00:20:00Z', executiveSummary: full, deskRecommendation: '관망 유지', sources: [] };
    const report = decisionBrief([{ id, ...analysis }]);
    assert.equal(report.fragments.find(item => item.field === 'executiveSummary')?.excerpt, sentence, id);
    const overview = aggregateOverview([{ id, analysis, articles: [] }]);
    assert.equal(overview.directives[0]?.reason, sentence, id);
    assert(!overview.brief.includes('EXCLUDE THIS'), id);
    assert.equal(analysis.executiveSummary, full, id);
  }
});
