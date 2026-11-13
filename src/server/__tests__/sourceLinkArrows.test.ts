import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { load } from 'cheerio';
import { SourceAttribution } from '../../components/SourceAttribution';
import { resolveSourceLinkArrowColorsForPdf } from '../../components/SourceLinkArrow';

test('source links retain their labels and destinations and draw only decorative SVG arrows', () => {
  const url = 'https://example.com/report';
  const $ = load(renderToStaticMarkup(createElement(SourceAttribution, { entries: [
    { label: 'Publisher \u2197', url, description: 'Original report' },
    { label: 'Unlinked publisher \u2197' },
  ] })));
  const link = $('a');
  const icon = link.find('svg[data-rms-source-link-arrow]');
  assert.equal(link.attr('href'), url);
  assert.equal(link.attr('aria-description'), 'Original report');
  assert.equal(link.text().trim(), 'Publisher');
  assert.equal(icon.length, 1);
  assert.equal(icon.attr('aria-hidden'), 'true');
  assert.equal(icon.attr('stroke'), 'currentColor');
  assert.equal(icon.find('path').length, 1);
  assert.equal($('svg').length, 1);
  assert(!$.text().includes('\u2197'));
});

test('all commodity source paths and Global Overview source paths use SVG, including both PDF captures', () => {
  const paths = [
    ['components/SourceAttribution.tsx', 1],
    ['components/CommodityNews.tsx', 1],
    ['components/CommodityDetail.tsx', 5],
    ['components/OverviewTerminal.tsx', 6],
  ] as const;
  const read = (file: string) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  for (const [file, sites] of paths) {
    const code = read(file);
    assert(!code.includes('\u2197'), file);
    assert.equal((code.match(/<SourceLinkArrow\s*\/>/g) ?? []).length, sites, file);
  }
  const chart = read('components/CommodityDetail.tsx');
  assert.match(chart, /\{exchange\.name\}[^\n]*<SourceLinkArrow/);
  assert.equal((chart.match(/resolveSourceLinkArrowColorsForPdf\(el\)/g) ?? []).length, 2);
  assert.match(read('utils/exportDashboardPdf.ts'), /resolveSourceLinkArrowColorsForPdf\(clonedPage\)/);
});

test('PDF clone resolves each marked arrow color independently', () => {
  const attrs = new Map();
  const arrow = { setAttribute: (key: string, value: string) => attrs.set(key, value) };
  const cloned = {
    ownerDocument: { defaultView: { getComputedStyle: () => ({ color: 'rgb(30, 41, 59)' }) } },
    querySelectorAll(selector: string) {
      assert.equal(selector, 'svg[data-rms-source-link-arrow]');
      return [arrow];
    },
  };
  resolveSourceLinkArrowColorsForPdf(cloned as unknown as HTMLElement);
  assert.equal(attrs.get('stroke'), 'rgb(30, 41, 59)');
});
