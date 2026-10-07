export const formatCleanModelName = (rawName?: string) => {
  if (!rawName) return "Gemini 3.5 Flash Lite Grounded";
  let clean = rawName.replace(/^models\//, '').replace(/[-_]/g, ' ');
  clean = clean.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  if (!clean.toLowerCase().includes('gemini')) clean = `Gemini ${clean}`;
  if (!clean.toLowerCase().includes('grounded')) clean = `${clean} Grounded`;
  return clean;
};

export const formatDateStandard = (value?: string) => {
  if (!value) return '';
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized.replace(/-/g, '.');
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(normalized)) return normalized;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }
  return normalized;
};
