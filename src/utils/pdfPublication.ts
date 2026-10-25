export function issuePdfFilename(name: string, issue: string): string {
  if (!/^\d{8}$/.test(issue)) throw new Error('Invalid published issue');
  const identifier = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Nongshim_RMS_${identifier}_${issue}.pdf`;
}

export function stampPdfIssue(pdf: {
  getNumberOfPages(): number;
  setPage(page: number): unknown;
  setFontSize(size: number): unknown;
  setTextColor(color: number): unknown;
  text(text: string, x: number, y: number, options: { align: 'right' }): unknown;
}, issue: string): void {
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(107);
    // Existing content ends above this A4 bottom margin; no reflow or scaling.
    pdf.text(`Issue #${issue}`, 200, 292, { align: 'right' });
  }
}
