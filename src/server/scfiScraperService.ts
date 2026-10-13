import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const SCFI_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_scfi.json');
const SSE_SCFI_URL = 'https://en.sse.net.cn/indices/scfinew.jsp';

export interface ScfiCachePayload {
  scfiPoints: number | null;
  changeStr: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
}

export function getScfiCache(): ScfiCachePayload {
  try {
    if (fs.existsSync(SCFI_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCFI_CACHE_FILE, 'utf-8'));
      if (data) {
        return data as ScfiCachePayload;
      }
    }
  } catch (e) {
    console.warn('[ScfiCache] Disk cache read notice:', e);
  }
  return {
    scfiPoints: null,
    changeStr: '--%',
    updatedAt: new Date().toISOString(),
    source: 'Shanghai Shipping Exchange (SSE)',
    sourceUrl: SSE_SCFI_URL
  };
}

export function updateScfiCache(data: ScfiCachePayload): void {
  try {
    fs.writeFileSync(SCFI_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[ScfiCache] Disk cache write notice:', e);
  }
}

export async function scrapeLiveScfiIndex(forceRefresh: boolean = false): Promise<ScfiCachePayload> {
  const existingCache = getScfiCache();

  try {
    const res = await fetch(SSE_SCFI_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': 'https://en.sse.net.cn/'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      // Implementation details to find the data row and columns
      // This part is highly dependent on the website structure and may require selectors
      // I will assume standard table row/cell structure for now based on common patterns
      const compositeRow = $('table').find('tr').filter((i, el) => $(el).text().includes('Composite Index')).first();
      
      if (compositeRow.length > 0) {
        const cells = compositeRow.find('td');
        const scfiValText = $(cells[1]).text().trim(); // Adjust index based on actual table structure
        const changeText = $(cells[2]).text().trim(); // Adjust index
        
        const scfiPoints = parseFloat(scfiValText.replace(/,/g, ''));
        
        if (!isNaN(scfiPoints)) {
          const updatedPayload: ScfiCachePayload = {
            scfiPoints,
            changeStr: changeText,
            updatedAt: new Date().toISOString(),
            source: 'Shanghai Shipping Exchange (SSE)',
            sourceUrl: SSE_SCFI_URL
          };
          updateScfiCache(updatedPayload);
          return updatedPayload;
        }
      }
    }
  } catch (err) {
    console.warn('[SSE_Scraper] Live fetch notice:', err);
  }

  return existingCache;
}
