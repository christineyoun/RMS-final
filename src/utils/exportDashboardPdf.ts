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

  clonedDoc.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent && (styleEl.textContent.includes('oklch') || styleEl.textContent.includes('oklab'))) {
      styleEl.textContent = convertColor(styleEl.textContent);
    }
  });

  clonedDoc.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;
    const styleAttr = el.getAttribute('style');
    if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab'))) {
      el.setAttribute('style', convertColor(styleAttr));
    }
  });
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

export const exportGlobalDashboardToPdf = async (): Promise<void> => {
  const page1El = document.querySelector('.overview-page-1') as HTMLElement | null;
  const page2El = document.querySelector('.overview-page-2') as HTMLElement | null;

  if (!page1El || !page2El) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const marginX = 10;
  const marginY = 10;
  const contentWidth = pageWidth - marginX * 2; // 190mm

  const canvasOpts = {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#f8f9fa',
    width: 1200,
    windowWidth: 1200,
  };

  // 1. Capture Page 1
  const canvas1 = await html2canvas(page1El, {
    ...canvasOpts,
    onclone: (clonedDoc) => {
      const el = clonedDoc.querySelector('.overview-page-1') as HTMLElement;
      if (el) {
        el.style.width = '1200px';
        el.style.minWidth = '1200px';
        el.style.padding = '20px';
        el.style.backgroundColor = '#f8f9fa';
        el.style.fontFamily = "'Noto Sans KR', sans-serif";
      }
      clonedDoc.querySelectorAll('button, header, aside, .export-report-btn, .export-btn-wrapper, .pdf-hide').forEach((node) => {
        (node as HTMLElement).style.setProperty('display', 'none', 'important');
      });
      sanitizeOklchColorsForCanvas(clonedDoc);
    },
  });

  const imgData1 = canvas1.toDataURL('image/png');
  const imgHeight1 = (canvas1.height * contentWidth) / canvas1.width;
  pdf.addImage(imgData1, 'PNG', marginX, marginY, contentWidth, imgHeight1, undefined, 'FAST');

  // 2. Capture Page 2
  const canvas2 = await html2canvas(page2El, {
    ...canvasOpts,
    onclone: (clonedDoc) => {
      const el = clonedDoc.querySelector('.overview-page-2') as HTMLElement;
      if (el) {
        el.style.width = '1200px';
        el.style.minWidth = '1200px';
        el.style.padding = '20px';
        el.style.backgroundColor = '#f8f9fa';
        el.style.fontFamily = "'Noto Sans KR', sans-serif";
      }
      clonedDoc.querySelectorAll('button, header, aside, .export-report-btn, .export-btn-wrapper, .pdf-hide').forEach((node) => {
        (node as HTMLElement).style.setProperty('display', 'none', 'important');
      });
      sanitizeOklchColorsForCanvas(clonedDoc);
    },
  });

  const imgData2 = canvas2.toDataURL('image/png');
  const imgHeight2 = (canvas2.height * contentWidth) / canvas2.width;
  pdf.addPage();
  pdf.addImage(imgData2, 'PNG', marginX, marginY, contentWidth, imgHeight2, undefined, 'FAST');

  const { yyyymmdd, hhmm } = getTimestamp();
  pdf.save(`Nongshim_RMS_Global_Overview_${yyyymmdd}_${hhmm}.pdf`);
};
