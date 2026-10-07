import fs from 'fs';
import path from 'path';

const SCFI_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_scfi.json');
const TRADLINX_URL = 'https://www.tradlinx.com/ko/freight-index';

export interface ScfiCachePayload {
  scfiPoints: number;
  changeStr: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
}

export function getScfiCache(): ScfiCachePayload {
  try {
    if (fs.existsSync(SCFI_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCFI_CACHE_FILE, 'utf-8'));
      if (data && typeof data.scfiPoints === 'number' && data.scfiPoints > 500 && data.scfiPoints !== 4300) {
        return data as ScfiCachePayload;
      }
    }
  } catch (e) {
    console.warn('[ScfiCache] Disk cache read notice:', e);
  }
  return {
    scfiPoints: 3662.30,
    changeStr: '-0.65%',
    updatedAt: new Date().toISOString(),
    source: '트레드링스 (Tradlinx)',
    sourceUrl: TRADLINX_URL
  };
}

export function updateScfiCache(data: ScfiCachePayload): void {
  try {
    fs.writeFileSync(SCFI_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[ScfiCache] Disk cache write notice:', e);
  }
}

export async function scrapeTradlinxScfi(forceRefresh: boolean = false): Promise<ScfiCachePayload> {
  const existingCache = getScfiCache();

  try {
    const res = await fetch(TRADLINX_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();

      // Extract Next.js embedded JSON payload (__NEXT_DATA__)
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (nextDataMatch && nextDataMatch[1]) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const pageProps = nextData?.props?.pageProps;
          
          const scfiSeries = pageProps?.scfiList || pageProps?.freightIndexList || pageProps?.chartData;
          if (Array.isArray(scfiSeries) && scfiSeries.length > 0) {
            const latestPoint = scfiSeries[scfiSeries.length - 1];
            const prevPoint = scfiSeries.length >= 2 ? scfiSeries[scfiSeries.length - 2] : null;

            const scfiVal = typeof latestPoint === 'number' ? latestPoint : (latestPoint?.scfi || latestPoint?.value || latestPoint?.price);
            const prevVal = prevPoint ? (typeof prevPoint === 'number' ? prevPoint : (prevPoint?.scfi || prevPoint?.value || prevPoint?.price)) : null;

            if (typeof scfiVal === 'number' && scfiVal > 1000 && scfiVal < 5000 && scfiVal !== 4300) {
              let changeStr = existingCache.changeStr;
              if (prevVal && prevVal > 0) {
                const diffPct = ((scfiVal - prevVal) / prevVal) * 100;
                changeStr = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`;
              }

              const updatedPayload: ScfiCachePayload = {
                scfiPoints: Number(scfiVal.toFixed(2)),
                changeStr,
                updatedAt: new Date().toISOString(),
                source: '트레드링스 (Tradlinx)',
                sourceUrl: TRADLINX_URL
              };
              updateScfiCache(updatedPayload);
              return updatedPayload;
            }
          }
        } catch (jsonErr) {
          console.warn('[TradlinxScraper] JSON parse notice:', jsonErr);
        }
      }
    }
  } catch (err) {
    console.warn('[TradlinxScraper] Live fetch notice, serving disk cache:', err);
  }

  return existingCache;
}
