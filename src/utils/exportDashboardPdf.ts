import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export const sanitizeOklchColorsForCanvas = (clonedDoc: Document): void => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const convertColor = (colorStr: string): string => {
    if (!colorStr || (!colorStr.includes('oklch') && !colorStr.includes('oklab'))) {
      return colorStr;
    }
    return colorStr.replace(/(?:oklch|oklab)\([^\)]+\)/gi, (match) => {
      try {
        if (ctx) {
          ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.fillStyle = match;
          if (ctx.fillStyle && ctx.fillStyle !== 'rgba(0,0,0,0)') {
            return ctx.fillStyle;
          }
        }
      } catch {
        // ignore
      }
      return '#64748b';
    });
  };

  // 1. Convert all <style> text content
  clonedDoc.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent && (styleEl.textContent.includes('oklch') || styleEl.textContent.includes('oklab'))) {
      styleEl.textContent = convertColor(styleEl.textContent);
    }
  });

  // 2. Convert all inline style attributes and element styles
  clonedDoc.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;
    const styleAttr = el.getAttribute('style');
    if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab'))) {
      el.setAttribute('style', convertColor(styleAttr));
    }
    if (el.style && el.style.length > 0) {
      for (let i = 0; i < el.style.length; i++) {
        const prop = el.style[i];
        const val = el.style.getPropertyValue(prop);
        if (val && (val.includes('oklch') || val.includes('oklab'))) {
          el.style.setProperty(prop, convertColor(val));
        }
      }
    }
  });

  // 3. Convert rules in stylesheets
  try {
    Array.from(clonedDoc.styleSheets).forEach((sheet) => {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) return;
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i] as CSSStyleRule;
          if (rule.cssText && (rule.cssText.includes('oklch') || rule.cssText.includes('oklab'))) {
            if (rule.style) {
              for (let j = 0; j < rule.style.length; j++) {
                const prop = rule.style[j];
                const val = rule.style.getPropertyValue(prop);
                if (val && (val.includes('oklch') || val.includes('oklab'))) {
                  rule.style.setProperty(prop, convertColor(val));
                }
              }
            }
          }
        }
      } catch {
        // Ignore CORS security restrictions
      }
    });
  } catch {
    // Ignore stylesheet errors
  }
};

export const getTimestamp = (): { yyyymmdd: string; hhmm: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return {
    yyyymmdd: `${year}${month}${day}`,
    hhmm: `${hours}${minutes}`,
  };
};

export const getGlobalOverviewPdfFilename = (): string => {
  const { yyyymmdd, hhmm } = getTimestamp();
  return `Nongshim_RMS_Global_Overview_${yyyymmdd}_${hhmm}.pdf`;
};

export const getCategoryReportPdfFilename = (category: string): string => {
  const { yyyymmdd, hhmm } = getTimestamp();
  const cat = (category || '').toLowerCase().trim();

  let categoryName = 'Global_Overview';
  if (cat === 'grains' || cat === 'grain') {
    categoryName = 'Grains_Report';
  } else if (cat === 'oils' || cat === 'oil') {
    categoryName = 'Oils_Report';
  } else if (cat === 'starches' || cat === 'starch' || cat.includes('sweetener')) {
    categoryName = 'Starches_Report';
  } else if (cat === 'all' || cat === 'global_overview' || !cat) {
    categoryName = 'Global_Overview';
  } else {
    categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  }

  return `Nongshim_RMS_${categoryName}_${yyyymmdd}_${hhmm}.pdf`;
};

/**
 * Captures #main-dashboard-view and downloads a dynamic PDF report
 * named Nongshim_RMS_[CategoryName]_[YYYYMMDD]_[HHMM].pdf based on the active category filter.
 */
export const exportCategoryFilteredPdf = async (category: string = 'all'): Promise<void> => {
  const page1El = document.querySelector('.overview-page-1') as HTMLElement | null;
  const page2El = document.querySelector('.overview-page-2') as HTMLElement | null;

  if (page1El && page2El) {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
    const marginX = 10;
    const marginY = 10;
    const contentWidth = pageWidth - marginX * 2; // 190mm
    const contentHeight = pageHeight - marginY * 2; // 277mm

    // Capture Page 1
    const canvas1 = await html2canvas(page1El, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#f8f9fa',
      windowWidth: 1400,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside, .print\\:hidden').forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });
        clonedDoc.querySelectorAll('.hidden.print\\:block, .print\\:block').forEach((el) => {
          (el as HTMLElement).style.display = 'block';
        });
        sanitizeOklchColorsForCanvas(clonedDoc);
      },
    });

    const imgData1 = canvas1.toDataURL('image/png');
    const imgHeight1 = Math.min((canvas1.height * contentWidth) / canvas1.width, contentHeight);
    pdf.addImage(imgData1, 'PNG', marginX, marginY, contentWidth, imgHeight1, undefined, 'FAST');

    // Capture Page 2
    const canvas2 = await html2canvas(page2El, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#f8f9fa',
      windowWidth: 1400,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside, .print\\:hidden').forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });
        clonedDoc.querySelectorAll('.hidden.print\\:block, .print\\:block').forEach((el) => {
          (el as HTMLElement).style.display = 'block';
        });
        sanitizeOklchColorsForCanvas(clonedDoc);
      },
    });

    const imgData2 = canvas2.toDataURL('image/png');
    const imgHeight2 = Math.min((canvas2.height * contentWidth) / canvas2.width, contentHeight);
    pdf.addPage();
    pdf.addImage(imgData2, 'PNG', marginX, marginY, contentWidth, imgHeight2, undefined, 'FAST');

    const filename = getCategoryReportPdfFilename(category);
    pdf.save(filename);
    return;
  }

  const targetElement =
    (document.getElementById('main-dashboard-view') as HTMLElement | null) ||
    (document.querySelector('.OverviewTerminal') as HTMLElement | null) ||
    document.body;

  if (!targetElement) return;

  const canvas = await html2canvas(targetElement, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#f8f9fa',
    windowWidth: targetElement.scrollWidth || 1400,
    onclone: (clonedDoc) => {
      // 1. Explicitly hide all export buttons, UI controls, and print-hidden elements
      clonedDoc.querySelectorAll('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      sanitizeOklchColorsForCanvas(clonedDoc);
    },
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
  } else {
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }
  }

  const filename = getCategoryReportPdfFilename(category);
  pdf.save(filename);
};

export const exportGlobalDashboardToPdf = async (): Promise<void> => {
  return exportCategoryFilteredPdf('all');
};
