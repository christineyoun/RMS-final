// Exact saved-only routes. Public serving never delegates to collector middleware.
export const PUBLIC_COMMODITIES = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
export const PUBLIC_TIMEFRAMES = ['1M','3M','6M','1Y','3Y','5Y','10Y','ALL'];
export function publicRouteKey(raw) {
  let u; try { u = new URL(raw, 'http://localhost'); } catch { return null; }
  if (/%|\\/.test(raw.split('?')[0])) return null;
  const p=u.pathname, entries=[...u.searchParams];
  if (new Set(entries.map(([k])=>k)).size!==entries.length) return null;
  const keys=entries.map(([k])=>k), id=u.searchParams.get('commodity');
  let allowed=[];
  if (['/api/health','/api/rms/free-publication','/api/rms/free-fx','/api/rms/saved-market-data','/api/rms/refresh-status','/api/overview/comparison','/api/market-data/normalized','/api/scm/live-policy','/api/uswheat/price-history','/api/soybean/price-snapshot','/api/soybean-oil/price-snapshot','/api/sugar/price-snapshot','/api/starch/potato-export-quote','/api/starch/potato-stats','/api/starch/tapioca-quote','/api/potato-starch/production','/api/potato-starch/production-regions','/api/corn/procurement-analysis','/api/amis/wheat','/api/wheat/origin-radar','/api/corn/origin-radar','/api/soybean/origin-radar'].includes(p)) allowed=[];
  else if (p==='/api/history') { if(!PUBLIC_COMMODITIES.includes(id)||!PUBLIC_TIMEFRAMES.includes(u.searchParams.get('timeframe')))return null;allowed=['commodity','timeframe']; }
  else if (['/api/market-intelligence','/api/rms/origin-radar-all'].includes(p)) {if(!PUBLIC_COMMODITIES.includes(id))return null;allowed=['commodity'];}
  else if (p==='/api/pipeline/telemetry') {if(id&&!PUBLIC_COMMODITIES.includes(id))return null;allowed=['commodity'];}
  else if (p.startsWith('/api/ai-analysis/')) {if(!PUBLIC_COMMODITIES.includes(p.slice(17)))return null;}
  else if(p.startsWith('/api/usda/')) {if(!PUBLIC_COMMODITIES.includes(p.slice(10)))return null;const year=u.searchParams.get('marketYear');if(year&&!/^20\d{2}$/.test(year))return null;allowed=['marketYear'];}
  else return null;
  if(keys.some(k=>!allowed.includes(k)))return null;
  u.searchParams.sort();return p+(u.searchParams.size?'?'+u.searchParams:'');
}
export function publicCaptureRoutes() {
 const routes=['/api/rms/free-publication','/api/rms/free-fx','/api/rms/saved-market-data','/api/overview/comparison','/api/market-data/normalized','/api/scm/live-policy','/api/pipeline/telemetry','/api/corn/procurement-analysis','/api/uswheat/price-history','/api/soybean/price-snapshot','/api/soybean-oil/price-snapshot','/api/sugar/price-snapshot','/api/starch/potato-export-quote','/api/starch/potato-stats','/api/starch/tapioca-quote','/api/potato-starch/production','/api/potato-starch/production-regions','/api/amis/wheat','/api/wheat/origin-radar','/api/corn/origin-radar','/api/soybean/origin-radar'];
 for(const id of PUBLIC_COMMODITIES){routes.push('/api/ai-analysis/'+id,'/api/market-intelligence?commodity='+id,'/api/rms/origin-radar-all?commodity='+id,'/api/pipeline/telemetry?commodity='+id,'/api/usda/'+id);for(const timeframe of PUBLIC_TIMEFRAMES)routes.push('/api/history?commodity='+id+'&timeframe='+timeframe);}
 return [...new Set(routes)];
}
