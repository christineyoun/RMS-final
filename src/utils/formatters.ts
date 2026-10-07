export const formatCleanModelName = (rawName?: string) => {
  if (!rawName) return "Gemini 3.5 Flash Lite Grounded";
  let clean = rawName.replace(/^models\//, '').replace(/[-_]/g, ' ');
  clean = clean.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  if (!clean.toLowerCase().includes('gemini')) clean = `Gemini ${clean}`;
  if (!clean.toLowerCase().includes('grounded')) clean = `${clean} Grounded`;
  return clean;
};

export const formatDateStandard = (dateInput: string) => {
  if (!dateInput) return '2026.09.20';
  const trimmed = String(dateInput).trim();

  // Match "09월 19일" or "9월 19일"
  const krMatch = trimmed.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (krMatch) {
    const m = krMatch[1].padStart(2, '0');
    const d = krMatch[2].padStart(2, '0');
    return `2026.${m}.${d}`;
  }

  // Match "2026-09-19" or "2026.09.19"
  if (/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(trimmed)) {
    return trimmed.replace(/-/g, '.');
  }

  // Match "09-19" or "09.19"
  const shortMatch = trimmed.match(/^(\d{2})[.-](\d{2})$/);
  if (shortMatch) {
    return `2026.${shortMatch[1]}.${shortMatch[2]}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  return trimmed;
};
