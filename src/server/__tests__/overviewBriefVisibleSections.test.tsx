import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import AiMarketBrief from '../../components/AiMarketBrief';
import { BRIEF_SECTIONS } from '../../utils/overviewDecisionBrief';

const comparison = '전일 대비 주요 변화';
const visible = BRIEF_SECTIONS.filter(label => label !== comparison);
const markup = (brief?: string) => load(renderToStaticMarkup(createElement(AiMarketBrief, { aiBriefText: brief })));

test('the overview and its PDF capture keep the four non-comparison sections', () => {
  const $ = markup(BRIEF_SECTIONS.map((label, index) => `[${label}] SECTION-CONTENT-${index}`).join('\n\n'));
  const card = $('.pdf-section-card');
  assert.deepEqual(card.find('[data-brief-section]').map((_, node) => $(node).attr('data-brief-section')).get(), visible);
  assert(!card.text().includes(comparison));
  assert(!card.text().includes('SECTION-CONTENT-1'));
  for (const index of [0, 2, 3, 4]) assert(card.text().includes(`SECTION-CONTENT-${index}`));
});

test('loading and older briefs never leak the hidden section into adjacent content', () => {
  const loading = markup();
  assert.deepEqual(loading('[data-brief-section]').map((_, node) => loading(node).attr('data-brief-section')).get(), visible);
  const $ = markup('[오늘의 시장 판단] Summary\n[전일 대비 주요 변화] OMIT-ME\n[공급 위험] Risk');
  assert.equal($('[data-brief-section]').length, 2);
  assert(!$('.pdf-section-card').text().includes('OMIT-ME'));
  assert($('.pdf-section-card').text().includes('Risk'));
});
