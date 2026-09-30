export function isInvalidOrSearchUrl(url?: string): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return true;
  if (
    trimmed.includes('news.google.com/search') ||
    trimmed.includes('google.com/search') ||
    trimmed.includes('google.com/url?')
  ) {
    return true;
  }
  return false;
}

export function getPublisherPortalUrl(sourceName?: string, rawUrl?: string): string {
  const lowerSource = (sourceName || '').toLowerCase();
  const lowerUrl = (rawUrl || '').toLowerCase();

  if (lowerSource.includes('reuters') || lowerUrl.includes('reuters.com')) {
    return 'https://www.reuters.com/markets/commodities/';
  }
  if (lowerSource.includes('bloomberg') || lowerUrl.includes('bloomberg.com')) {
    return 'https://www.bloomberg.com/markets';
  }
  if (
    lowerSource.includes('s&p') ||
    lowerSource.includes('platts') ||
    lowerSource.includes('sp global') ||
    lowerUrl.includes('spglobal.com')
  ) {
    return 'https://www.spglobal.com/commodityinsights/en';
  }
  if (
    lowerSource.includes('ap news') ||
    lowerSource.includes('associated press') ||
    lowerUrl.includes('apnews.com')
  ) {
    return 'https://apnews.com/hub/agriculture';
  }
  if (
    lowerSource.includes('usda') ||
    lowerUrl.includes('fas.usda.gov') ||
    lowerUrl.includes('usda.gov')
  ) {
    return 'https://apps.fas.usda.gov/psdonline/app/index.html';
  }
  if (lowerSource.includes('conab') || lowerUrl.includes('conab.gov.br')) {
    return 'https://www.conab.gov.br/info-agro/safras/graos';
  }
  if (
    lowerSource.includes('noaa') ||
    lowerSource.includes('bom') ||
    lowerUrl.includes('cpc.ncep.noaa.gov') ||
    lowerUrl.includes('noaa.gov')
  ) {
    return 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/';
  }
  if (lowerSource.includes('eia') || lowerUrl.includes('eia.gov')) {
    return 'https://www.eia.gov/petroleum/supply/weekly/';
  }
  if (
    lowerSource.includes('ttsa') ||
    lowerSource.includes('thai tapioca') ||
    lowerUrl.includes('thaitapiocastarch.org')
  ) {
    return 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price';
  }
  if (lowerSource.includes('mpob') || lowerUrl.includes('mpob.gov.my')) {
    return 'https://bepi.mpob.gov.my/index.php/en/statistics/production';
  }
  if (lowerSource.includes('gapki') || lowerUrl.includes('gapki.id')) {
    return 'https://gapki.id/en/news/';
  }
  if (lowerSource.includes('unica') || lowerUrl.includes('unica.com.br')) {
    return 'https://unica.com.br/en/unicadata/';
  }
  if (lowerSource.includes('kmc') || lowerUrl.includes('kmc.dk')) {
    return 'https://www.kmc.dk/en/news';
  }
  if (lowerSource.includes('agricensus') || lowerUrl.includes('agricensus.com')) {
    return 'https://www.agricensus.com';
  }
  if (
    lowerSource.includes('bursa malaysia') ||
    lowerSource.includes('bursa') ||
    lowerUrl.includes('bursamalaysia.com')
  ) {
    return 'https://www.bursamalaysia.com/market_information/derivatives_prices';
  }
  if (
    lowerSource.includes('u.s. wheat') ||
    lowerSource.includes('us wheat') ||
    lowerUrl.includes('uswheat.org')
  ) {
    return 'https://uswheat.org/market-information/price-report/';
  }
  if (
    lowerSource.includes('amis') ||
    lowerUrl.includes('amis-outlook.org')
  ) {
    return 'https://www.amis-outlook.org/market-monitor';
  }

  // If rawUrl is provided and valid (not a search engine URL), return rawUrl
  if (rawUrl && !isInvalidOrSearchUrl(rawUrl)) {
    return rawUrl;
  }

  // Default Fallback
  return 'https://www.reuters.com/markets/commodities/';
}
