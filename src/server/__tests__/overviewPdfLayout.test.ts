import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitOverviewPdfPage } from '../../utils/exportDashboardPdf.ts';

test('short overview pages retain the original width and margins', () => {
  assert.deepEqual(fitOverviewPdfPage(2400, 3342, 210, 297), {
    x: 10, y: 10, width: 190, height: 264.575,
  });
});

test('a tall overview page is centered and scales proportionally above the issue number', () => {
  // The reported page 2 capture height is a regression fixture, not a production limit.
  for (const canvasHeight of [3536, 4000, 5200]) {
    const box = fitOverviewPdfPage(2400, canvasHeight, 210, 297);
    assert(box.width < 190);
    assert.equal(box.y + box.height, 287);
    assert.equal(292 - (box.y + box.height), 5);
    assert(Math.abs(box.width / box.height - 2400 / canvasHeight) < 1e-10);
    assert.equal(box.x * 2 + box.width, 210);
  }
});

test('pill centering is scoped to rounded, padded, colored spans in the overview capture', async () => {
  const { centerOverviewPdfPills } = await import('../../utils/exportDashboardPdf.ts');
  const draws: Array<[string, number, number]> = [];
  const context = {
    font: '',
    fillStyle: '',
    scale() {},
    measureText: () => ({
      width: 20, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 20,
      actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2,
    }),
    fillText: (text: string, x: number, y: number) => draws.push([text, x, y]),
  };
  const transparent = {};
  let appended = 0;
  const badge = {
    getBoundingClientRect: () => ({ width: 40, height: 20 }),
    childNodes: [{ nodeType: 3, textContent: '시장 동향' }],
    children: [],
    style: { setProperty() {} },
    appendChild: () => appended++,
  };
  const root = {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, 'span[class*="rounded"][class*="px-"]');
      return [transparent, badge];
    },
    ownerDocument: {
      defaultView: { getComputedStyle: (node: unknown) => ({
        backgroundColor: node === transparent ? 'rgba(0, 0, 0, 0)' : 'rgb(239, 246, 255)',
        color: 'rgb(29, 78, 216)', fontSize: '11px', fontStyle: 'normal',
        fontFamily: 'sans-serif', fontWeight: '700', position: 'static',
        borderTopWidth: '1px', borderLeftWidth: '1px',
      }) },
      createElement: () => ({ getContext: () => context, setAttribute() {}, style: {} }),
    },
  };
  centerOverviewPdfPills(root as unknown as HTMLElement);
  assert.equal(appended, 1);
  assert.deepEqual(draws, [['시장 동향', 10, 13]]);
});
