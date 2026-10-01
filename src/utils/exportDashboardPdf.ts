import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

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

export const sanitizeOklchColorsForCanvas = (_clonedDoc: Document): void => {};

export const exportCategoryFilteredPdf = async (category: string = 'all'): Promise<void> => {
  const page1El = document.querySelector('.overview-page-1') as HTMLElement | null;
  const page2El = document.querySelector('.overview-page-2') as HTMLElement | null;

  if (page1El && page2El) {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

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
      backgroundColor: '#f8fafc',
      width: 1200,
      windowWidth: 1200,
    };

    // Capture Page 1 (Hide Page 2 so Page 1 sits at y = 0)
    const canvas1 = await html2canvas(page1El, {
      ...canvasOpts,
      onclone: (clonedDoc) => {
        const p2 = clonedDoc.querySelector('.overview-page-2') as HTMLElement | null;
        if (p2) p2.style.setProperty('display', 'none', 'important');

        const el = clonedDoc.querySelector('.overview-page-1') as HTMLElement | null;
        if (el) {
          el.style.width = '1200px';
          el.style.minWidth = '1200px';
          el.style.padding = '20px';
          el.style.backgroundColor = '#f8fafc';
          el.style.fontFamily = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";
        }
        clonedDoc.querySelectorAll('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside, .print\\:hidden').forEach((node) => {
          (node as HTMLElement).style.setProperty('display', 'none', 'important');
        });
      },
    });

    const imgData1 = canvas1.toDataURL('image/png');
    const imgHeight1 = (canvas1.height * contentWidth) / canvas1.width;
    pdf.addImage(imgData1, 'PNG', marginX, marginY, contentWidth, imgHeight1, undefined, 'FAST');

    // Capture Page 2 (Hide Page 1 so Page 2 shifts up to y = 0)
    const canvas2 = await html2canvas(page2El, {
      ...canvasOpts,
      onclone: (clonedDoc) => {
        const p1 = clonedDoc.querySelector('.overview-page-1') as HTMLElement | null;
        if (p1) p1.style.setProperty('display', 'none', 'important');

        const el = clonedDoc.querySelector('.overview-page-2') as HTMLElement | null;
        if (el) {
          el.style.width = '1200px';
          el.style.minWidth = '1200px';
          el.style.padding = '20px';
          el.style.backgroundColor = '#f8fafc';
          el.style.fontFamily = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";
        }
        clonedDoc.querySelectorAll('.pdf-hide, .print-hide, .export-report-btn, .export-btn-wrapper, button, header, aside, .print\\:hidden').forEach((node) => {
          (node as HTMLElement).style.setProperty('display', 'none', 'important');
        });
      },
    });

    const imgData2 = canvas2.toDataURL('image/png');
    const imgHeight2 = (canvas2.height * contentWidth) / canvas2.width;
    pdf.addPage();
    pdf.addImage(imgData2, 'PNG', marginX, marginY, contentWidth, imgHeight2, undefined, 'FAST');

    const filename = getCategoryReportPdfFilename(category);
    try {
      pdf.save(filename);
    } catch {
      const blobUrl = pdf.output('bloburl');
      window.open(blobUrl, '_blank');
    }
    return;
  }
};

export const exportGlobalDashboardToPdf = async (): Promise<void> => {
  return exportCategoryFilteredPdf('all');
};
