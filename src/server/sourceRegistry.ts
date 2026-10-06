import type { DataSourceDefinition } from '../types.ts';

/**
 * CENTRAL SOURCE REGISTRY
 * Defines all integrated external market data sources, their update frequencies,
 * endpoints, required secrets, categories, and source URLs.
 */
export const CENTRAL_SOURCE_REGISTRY: DataSourceDefinition[] = [
  {
    sourceId: 'frankfurter-fx',
    sourceName: 'Frankfurter Exchange Rates (ECB Live Benchmark)',
    commodity: 'fx',
    dataCategory: 'fx',
    updateFrequency: '1h',
    updateFrequencyMs: 60 * 60 * 1000,
    endpoint: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,MYR',
    authenticationType: 'none',
    unit: 'KRW/USD',
    sourceUrl: 'https://api.frankfurter.dev'
  },
  {
    sourceId: 'open-meteo-corn-belt',
    sourceName: 'Open-Meteo US Corn Belt Radar (Des Moines, IA)',
    commodity: 'corn',
    dataCategory: 'weather',
    updateFrequency: '1h',
    updateFrequencyMs: 60 * 60 * 1000,
    endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=41.59&longitude=-93.62&current=temperature_2m,relative_humidity_2m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FChicago',
    authenticationType: 'none',
    unit: '°C / mm',
    sourceUrl: 'https://open-meteo.com'
  },
  {
    sourceId: 'open-meteo-south-america',
    sourceName: 'Open-Meteo South America Soybean Radar (Mato Grosso, Brazil)',
    commodity: 'soybean',
    dataCategory: 'weather',
    updateFrequency: '1h',
    updateFrequencyMs: 60 * 60 * 1000,
    endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=-12.56&longitude=-55.72&current=temperature_2m,relative_humidity_2m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FCuiaba',
    authenticationType: 'none',
    unit: '°C / mm',
    sourceUrl: 'https://open-meteo.com'
  },
  {
    sourceId: 'open-meteo-eu-crops',
    sourceName: 'Open-Meteo EU Grain Belt Radar (Beauce/Paris, France)',
    commodity: 'wheat',
    dataCategory: 'weather',
    updateFrequency: '1h',
    updateFrequencyMs: 60 * 60 * 1000,
    endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,relative_humidity_2m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FParis',
    authenticationType: 'none',
    unit: '°C / mm',
    sourceUrl: 'https://open-meteo.com'
  },
  {
    sourceId: 'gemini-search-grounding',
    sourceName: 'Google Search Grounding (Live Agricultural Exchange Benchmarks)',
    commodity: 'all',
    dataCategory: 'price',
    updateFrequency: '15m',
    updateFrequencyMs: 15 * 60 * 1000,
    endpoint: 'server:gemini-search-grounding',
    authenticationType: 'api-key',
    secretName: 'GEMINI_API_KEY',
    unit: 'USd/bu, MYR/MT, USc/lb',
    sourceUrl: 'https://ai.google.dev'
  },
  {
    sourceId: 'usda-fas-psd',
    sourceName: 'USDA FAS Production, Supply and Distribution (PSD Online)',
    commodity: 'wheat',
    dataCategory: 'supply-demand',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://api.fas.usda.gov/api/psd/commodity/0410000/world/year/2026',
    authenticationType: 'api-key',
    secretName: 'USDA_FAS_API_KEY',
    unit: 'Million MT',
    sourceUrl: 'https://api.fas.usda.gov'
  },
  {
    sourceId: 'eia-energy-market',
    sourceName: 'U.S. Energy Information Administration (Crude & Natural Gas)',
    commodity: 'energy',
    dataCategory: 'macro',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://api.eia.gov/v2/',
    authenticationType: 'api-key',
    secretName: 'EIA_API_KEY',
    unit: 'USD / bbl',
    sourceUrl: 'https://www.eia.gov/opendata/'
  },
  {
    sourceId: 'world-bank-pink-sheet',
    sourceName: 'World Bank Commodity Markets (Pink Sheet Benchmarks)',
    commodity: 'all',
    dataCategory: 'macro',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json',
    authenticationType: 'none',
    unit: 'Index Points',
    sourceUrl: 'https://www.worldbank.org/en/research/commodity-markets'
  },
  {
    sourceId: 'uswheat-price-report',
    sourceName: 'U.S. Wheat Associates Weekly Price Report',
    commodity: 'wheat',
    dataCategory: 'price',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://uswheat.org/market-information/price-report/',
    authenticationType: 'none',
    unit: 'USD/MT',
    sourceUrl: 'https://uswheat.org/market-information/price-report/'
  },
  {
    sourceId: 'amis-market-monitor',
    sourceName: 'AMIS Market Monitor (FAO / OECD / World Bank / WTO Secretariat)',
    commodity: 'wheat',
    dataCategory: 'macro',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://www.amis-outlook.org/market-monitor',
    authenticationType: 'none',
    unit: 'Market Assessment & Macro Risk',
    sourceUrl: 'https://www.amis-outlook.org/market-monitor'
  },
  {
    sourceId: 'abares-crop-report',
    sourceName: 'ABARES (Australian Bureau of Agricultural and Resource Economics and Sciences)',
    commodity: 'wheat',
    dataCategory: 'supply-demand',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://www.agriculture.gov.au/abares/research-topics/agricultural-outlook/data',
    authenticationType: 'none',
    unit: 'Million MT / KT',
    sourceUrl: 'https://www.agriculture.gov.au/abares/research-topics/agricultural-outlook/data'
  },
  {
    sourceId: 'aafc-field-crops',
    sourceName: 'AAFC (Agriculture and Agri-Food Canada Principal Field Crops Outlook)',
    commodity: 'wheat',
    dataCategory: 'supply-demand',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://agriculture.canada.ca/en/sector/crops/reports-statistics',
    authenticationType: 'none',
    unit: 'Thousand Tonnes / Million MT',
    sourceUrl: 'https://agriculture.canada.ca/en/sector/crops/reports-statistics'
  },
  {
    sourceId: 'sask-wheat-outlook',
    sourceName: 'Sask Wheat (Saskatchewan Wheat Development Commission)',
    commodity: 'wheat',
    dataCategory: 'price',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://saskwheat.ca/wheat-market-outlook-prices/',
    authenticationType: 'none',
    unit: 'Market Commentary & Pricing',
    sourceUrl: 'https://saskwheat.ca/wheat-market-outlook-prices/'
  },
  {
    sourceId: 'eu-agrifood-cereal',
    sourceName: 'European Commission Agri-food Data Portal (Cereals Production API)',
    commodity: 'wheat',
    dataCategory: 'supply-demand',
    updateFrequency: '24h',
    updateFrequencyMs: 24 * 60 * 60 * 1000,
    endpoint: 'https://api.tech.ec.europa.eu/agrifood/api/cereal/production?crops=Soft%20wheat&years=2026',
    authenticationType: 'none',
    unit: '1000 MT / HA',
    sourceUrl: 'https://agridata.ec.europa.eu/extensions/API_Documentation/cereals.html'
  }
];

export function getSourceDefinition(sourceId: string): DataSourceDefinition | undefined {
  return CENTRAL_SOURCE_REGISTRY.find((s) => s.sourceId === sourceId);
}
