import { getDailyPublicationIssue } from './dailyPublicationIssue';
import { issuePdfFilename, stampPdfIssue } from './pdfPublication';

export const getCategoryReportPdfFilename = (category: string, issue: string): string => {
  const cat = (category || '').toLowerCase().trim();
  let categoryName = 'Global_Overview';
  if (cat === 'grains' || cat === 'grain') categoryName = 'Grains_Report';
  else if (cat === 'oils' || cat === 'oil') categoryName = 'Oils_Report';
  else if (cat === 'starches' || cat === 'starch' || cat.includes('sweetener')) categoryName = 'Starches_Report';
  return issuePdfFilename(categoryName, issue);
};

// Inlines parent document style rules into clonedDoc to guarantee published production build rendering
const inlineStylesForClone = (clonedDoc: Document) => {
  const head = clonedDoc.head || clonedDoc.querySelector('head');
  if (!head) return;

  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (rules && rules.length > 0) {
        const styleEl = clonedDoc.createElement('style');
        styleEl.textContent = Array.from(rules)
          .map((r) => r.cssText)
          .join('\n');
        head.appendChild(styleEl);
      }
    } catch {
      // Ignore cross-origin stylesheet access restrictions if any
    }
  });
};

export const sanitizeOklchColorsForCanvas = (_clonedDoc: Document): void => {};

// Preserve the existing A4 body margins. The issue baseline is at 292 mm.
const OVERVIEW_PDF_MARGIN_MM = 10;

export function fitOverviewPdfPage(canvasWidth: number, canvasHeight: number, pageWidth: number, pageHeight: number) {
  const margin = OVERVIEW_PDF_MARGIN_MM;
  const scale = Math.min((pageWidth - 2 * margin) / canvasWidth, (pageHeight - 2 * margin) / canvasHeight);
  const width = canvasWidth * scale;
  return { x: (pageWidth - width) / 2, y: margin, width, height: canvasHeight * scale };
}

// html2canvas approximates text baselines. Paint just the overview pill labels
// with their actual font metrics so the ink (and any arrow) is centered.
export function centerOverviewPdfPills(root: HTMLElement) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return;

  // Use the existing overview markup. The local and deployed versions may
  // use different padding or alignment classes on these same pills.
  root.querySelectorAll<HTMLElement>('span[class*="rounded"][class*="px-"]').forEach(pill => {
    const pillStyle = view.getComputedStyle(pill);
    if (pillStyle.backgroundColor === 'transparent' || pillStyle.backgroundColor === 'rgba(0, 0, 0, 0)') return;
    const bounds = pill.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const canvas = doc.createElement('canvas');
    canvas.width = Math.ceil(bounds.width * 2);
    canvas.height = Math.ceil(bounds.height * 2);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(canvas.width / bounds.width, canvas.height / bounds.height);

    const gap = parseFloat(pillStyle.columnGap) || 0;
    const runs = Array.from(pill.childNodes).flatMap(node => {
      const text = node.textContent?.trim();
      if (!text) return [];
      const style = node.nodeType === 1 ? view.getComputedStyle(node as Element) : pillStyle;
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.font = font;
      const metrics = context.measureText(text);
      return [{ text, font, color: style.color, metrics }];
    });
    if (!runs.length) return;

    let advance = 0;
    let left = Infinity;
    let right = -Infinity;
    const positioned = runs.map(run => {
      const x = advance;
      left = Math.min(left, x - run.metrics.actualBoundingBoxLeft);
      right = Math.max(right, x + run.metrics.actualBoundingBoxRight);
      advance += run.metrics.width + gap;
      return { ...run, x };
    });
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return;

    for (const { text, font, color, metrics, x } of positioned) {
      context.font = font;
      context.fillStyle = color;
      context.fillText(text, x + (bounds.width - left - right) / 2,
        (bounds.height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
    }

    // html2canvas draws this canvas directly, keeping the measured baseline.
    // Preserve the original nodes in flow so pill sizing does not change.
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;max-width:none;pointer-events:none;';
    if (pillStyle.position === 'static') pill.style.position = 'relative';
    // Positioned children start at the padding edge, not the border edge.
    canvas.style.top = '-' + pillStyle.borderTopWidth;
    canvas.style.left = '-' + pillStyle.borderLeftWidth;
    canvas.style.width = bounds.width + 'px';
    canvas.style.height = bounds.height + 'px';
    pill.style.setProperty('color', 'transparent', 'important');
    for (const child of Array.from(pill.children)) {
      (child as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
    }
    pill.appendChild(canvas);
  });
}

export const exportCategoryFilteredPdf = async (category: string = 'all'): Promise<void> => {
  const page1El = document.querySelector<HTMLElement>('.overview-page-1');
  const page2El = document.querySelector<HTMLElement>('.overview-page-2');
  if (!page1El || !page2El) return;
  const issue = await getDailyPublicationIssue();

  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 200));

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pages = [page1El, page2El];

  for (const [index, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#f8fafc',
      width: 1200,
      windowWidth: 1200,
      onclone: async (clonedDoc, clonedPage) => {
        inlineStylesForClone(clonedDoc);
        clonedDoc.querySelector<HTMLElement>(`.overview-page-${index === 0 ? 2 : 1}`)
          ?.style.setProperty('display', 'none', 'important');

        clonedPage.style.width = '1200px';
        clonedPage.style.minWidth = '1200px';
        clonedPage.style.padding = '20px';
        clonedPage.style.backgroundColor = '#f8fafc';
        clonedPage.style.fontFamily = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";

        clonedDoc.querySelectorAll<HTMLElement>('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside')
          .forEach(node => node.style.setProperty('display', 'none', 'important'));
        if (clonedDoc.fonts?.ready) await clonedDoc.fonts.ready;
        centerOverviewPdfPills(clonedPage);
      },
    });

    if (index > 0) pdf.addPage();
    const { x, y, width, height } = fitOverviewPdfPage(canvas.width, canvas.height, pageWidth, pageHeight);
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, width, height, undefined, 'FAST');
  }

  stampPdfIssue(pdf, issue);
  const filename = getCategoryReportPdfFilename(category, issue);
  try {
    pdf.save(filename);
  } catch {
    window.open(pdf.output('bloburl'), '_blank');
  }
};

export const exportGlobalDashboardToPdf = async (): Promise<void> => {
  return exportCategoryFilteredPdf('all');
};
