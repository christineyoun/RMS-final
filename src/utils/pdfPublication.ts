import { pdfIssueFont } from './pdfIssueFont';

export function issuePdfFilename(name: string, issue: string): string {
  if (!/^\d{8}$/.test(issue)) throw new Error('Invalid published issue');
  const identifier = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Nongshim_RMS_${identifier}_${issue}.pdf`;
}

export function stampPdfIssue(pdf: {
  getNumberOfPages(): number;
  setPage(page: number): unknown;
  addFileToVFS(file: string, content: string): unknown;
  addFont(file: string, family: string, style: 'normal'): unknown;
  getFontList(): Record<string, string[]>;
  getFont(): { fontName: string; fontStyle: string };
  setFont(family: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(color: number): unknown;
  text(text: string, x: number, y: number, options: { align: 'right' }): unknown;
}, issue: string): void {
  if (!/^\d{8}$/.test(issue)) throw new Error('Invalid published issue');

  if (!pdf.getFontList()[pdfIssueFont.family]?.includes('normal')) {
    pdf.addFileToVFS(pdfIssueFont.file, pdfIssueFont.base64);
    pdf.addFont(pdfIssueFont.file, pdfIssueFont.family, 'normal');
  }
  const previousFont = pdf.getFont();
  pdf.setFont(pdfIssueFont.family, 'normal');
  try {
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(107);
      // Existing content ends above this A4 bottom margin; no reflow or scaling.
      pdf.text(`Issue #${issue}`, 200, 292, { align: 'right' });
    }
  } finally {
    pdf.setFont(previousFont.fontName, previousFont.fontStyle);
  }
}
