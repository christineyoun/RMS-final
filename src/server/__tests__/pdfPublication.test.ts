import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { PDFParse } from 'pdf-parse';
import { issuePdfFilename, stampPdfIssue } from '../../utils/pdfPublication.ts';
import { getCategoryReportPdfFilename } from '../../utils/exportDashboardPdf.ts';
import { getDailyPublicationIssue, loadDailyPublicationIssue } from '../../utils/dailyPublicationIssue.ts';

const originalFetch = globalThis.fetch;
try {
  let publication: any = { revision: 'saved', publishedAt: '2026-10-25T15:01:00Z', data: {}, status: 'partial' };
  globalThis.fetch = async () => Response.json(publication);
  assert.equal(await loadDailyPublicationIssue(), '20261026');
  assert.equal(await getDailyPublicationIssue(), '20261026');
  publication = { success: false };
  assert.equal(await loadDailyPublicationIssue(), null);
  assert.equal(await getDailyPublicationIssue(), '20261026');
  for (const name of ['Wheat', 'Corn', 'Soybean', 'Soybean Oil', 'Palm Oil', 'Sugar', 'Potato Starch', 'Tapioca Starch']) {
    const expected = `Nongshim_RMS_${name.replaceAll(' ', '_')}_20261026.pdf`;
    assert.equal(issuePdfFilename(name, await getDailyPublicationIssue()), expected);
    assert.equal(issuePdfFilename(name, await getDailyPublicationIssue()), expected);
  }
  assert.equal(getCategoryReportPdfFilename('all', '20261026'), 'Nongshim_RMS_Global_Overview_20261026.pdf');
  const pdf = new jsPDF({ format: 'a4' });
  pdf.text('Existing content', 10, 20); pdf.addPage(); pdf.text('Existing content page 2', 10, 20);
  stampPdfIssue(pdf, '20261026');
  const parsed = new PDFParse({ data: new Uint8Array(pdf.output('arraybuffer')) });
  const text = await parsed.getText();
  assert.equal(text.total, 2);
  assert.equal((text.text.match(/Issue #20261026/g) || []).length, 2);
  assert(text.text.includes('Existing content page 2'));
  await parsed.destroy();
  console.log('PASS nine filenames, same-issue repeated export, shared KST publication selection, failed-read retention and two A4 pages with issue labels.');
} finally { globalThis.fetch = originalFetch; }
