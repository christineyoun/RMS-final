/** Approved manual history restored from the pre-stabilization CommodityDetail
 * backup. Scope: DE, FR, NL, DK raw potatoes; MMT, annual harvest year.
 * Preserve the original Estimate flag; these are not starch-price observations. */
export const POTATO_PRODUCTION_SOURCE='https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en';
export const IMPORTED_POTATO_PRODUCTION = [
  {year:'2021',productionMMT:28.50,status:'Actual'},
  {year:'2022',productionMMT:27.53,status:'Actual'},
  {year:'2023',productionMMT:29.16,status:'Actual'},
  {year:'2024',productionMMT:31.42,status:'Actual'},
  {year:'2025',productionMMT:30.00,status:'Actual'},
  {year:'2026',productionMMT:27.60,status:'Estimate'},
].map(p=>({...p,sourceUrl:POTATO_PRODUCTION_SOURCE,unit:'MMT',coverage:['DE','FR','NL','DK'],provenance:'manual-import'}));
