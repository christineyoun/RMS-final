export const formatCleanModelName = (rawName?: string) => {
  if (!rawName) return "Gemini 3.5 Flash Lite Grounded";
  let clean = rawName.replace(/^models\//, '').replace(/[-_]/g, ' ');
  clean = clean.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  if (!clean.toLowerCase().includes('gemini')) clean = `Gemini ${clean}`;
  if (!clean.toLowerCase().includes('grounded')) clean = `${clean} Grounded`;
  return clean;
};
