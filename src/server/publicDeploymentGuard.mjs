/**
 * Strict, fail-closed public viewer policy for RMS.
 * Only used when RMS_PUBLIC_READONLY=1; never enabled for ordinary local development.
 * Deliberately exposes a small subset of audited, saved-snapshot endpoints.
 * Every additional API route requires an individual review before allowlisting.
 */

const COMMODITIES = new Set([
  'wheat', 'corn', 'soybean', 'soybean-oil', 'palm-oil', 'sugar',
  'potato-starch', 'tapioca-starch',
]);

const SAFE_EXACT_GET = new Set([
  '/api/health',
  '/api/market-intelligence', // intercepted by Stage3 saved-news gateway
  '/api/rms/refresh-status',  // status read only
  '/api/overview/comparison', // saved inputs/history only
]);

/** Returns null when permitted, otherwise a stable deny reason. */
export function denyPublicRequest(method, rawUrl) {
  let url;
  try { url = new URL(rawUrl || '/', 'http://localhost'); }
  catch { return 'malformed-url'; }
  const p = url.pathname;
  if (p !== '/api' && !p.startsWith('/api/')) return null;
  if (method !== 'GET' && method !== 'HEAD') return 'public-viewer-read-only';
  // Reject refresh/sync variants, regardless of boolean value or capitalization.
  for (const name of url.searchParams.keys()) {
    if (/(force|refresh|sync|update|rebuild|invalidate|trigger|admin|paid|execute|run)/i.test(name))
      return 'refresh-parameter-not-public';
  }
  // No percent-encoded API paths: avoid path normalization or routing ambiguity.
  if (/%/.test(rawUrl.split('?')[0])) return 'encoded-api-path-not-public';
  if (SAFE_EXACT_GET.has(p)) return null;
  if (p.startsWith('/api/ai-analysis/')) {
    const id = p.slice('/api/ai-analysis/'.length);
    if (COMMODITIES.has(id)) return null; // Stage3 saved snapshot, no paid run
  }
  return 'api-not-reviewed-for-public-access';
}

/** @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function publicDeploymentGuard(req, res, next) {
  const denied = denyPublicRequest(req.method, req.originalUrl || req.url || '/');
  if (!denied) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(403).json({success:false,error:'Public RMS is read-only',reason:denied});
}
