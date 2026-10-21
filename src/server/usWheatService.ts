import type {
  NormalizedMarketData,
  UsWheatClassMetric,
  UsWheatHistoryDataPoint,
  UsWheatPriceHistoryResponse,


} from '../types.ts';
import { loadWheatHistory, saveWheatHistory, mergePublishedWheatReport, toChartPoints, buildWheatMetrics, asIsoDate, toMetricTon, WHEAT_PRICE_SOURCE } from './wheatPriceHistoryStore.ts';
import { PDFParse } from 'pdf-parse';
import { usWheatPdfCandidates, parseUsWheatFuturesPdf } from './wheatReportFuturesPdf.ts';
import { getKSTDateString, getKSTFormattedTime } from './marketDataService.ts';
import { getSourceDefinition } from './sourceRegistry.ts';

export interface UsWheatFutureContract {
  exchange: string; // e.g. "CBOT", "KCBT", "MIAX" or "MGE"
  wheatClass: string; // e.g. "SRW", "HRW", "HRS"
  wheatClassName: string; // e.g. "Soft Red Winter", "Hard Red Winter", "Hard Red Spring"
  contractMonth: string; // e.g. "December"
  priceUsdPerBu: number | null; // e.g. 7.14
  priceUsdPerMetricTon?: number | null; // calculated metric ton conversion (bu * 36.7437)
  weeklyChangeText?: string | null; // e.g. "11 cents"
  weeklyChangeDirection?: 'down' | 'up' | 'unchanged';
  weeklyChangeUsdPerBu?: number | null; // e.g. -0.11
  frontMonthClosed?: {
    month: string;
    priceUsdPerBu: number | null;
  } | null;
}

export interface HistoricalReportArchiveItem {
  title: string;
  reportDate: string;
  url: string;
}

export interface UsWheatPriceReportData {
  reportDate: string;
  source: string;
  sourceUrl: string;
  cbotSrw: UsWheatFutureContract;
  kcbtHrw: UsWheatFutureContract;
  miaxHrs: UsWheatFutureContract;
  summaryText?: string;
  historicalReportsCount: number;
  historicalReports: HistoricalReportArchiveItem[];
}

export interface UsWheatScraperResult {
  success: boolean;
  statusCode?: number;
  sourceUrl: string;
  reportDate?: string;
  data?: UsWheatPriceReportData;
  normalizedData?: NormalizedMarketData[];
  errorMessage?: string;
  timestamp: string;
  isCached?: boolean;
}

export class UsWheatPriceReportService {
  private static instance: UsWheatPriceReportService;
  private readonly sourceUrl = 'https://uswheat.org/market-information/price-report/';
  private readonly ajaxUrl = 'https://uswheat.org/wp-admin/admin-ajax.php';
  private cachedResult: UsWheatScraperResult | null = null;
  private cacheExpiresAt: number = 0;
  private cachedHistoryResult: UsWheatPriceHistoryResponse | null = null;
  private historyCacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 6 * 60 * 60 * 1000; // 30-minute cache for weekly reports

  private constructor() {}

  public static getInstance(): UsWheatPriceReportService {
    if (!UsWheatPriceReportService.instance) {
      UsWheatPriceReportService.instance = new UsWheatPriceReportService();
    }
    return UsWheatPriceReportService.instance;
  }

  /**
   * Main fetch method: Scrapes the latest published U.S. Wheat Associates Price Report
   * and queries the English report archive for historical weekly reports.
   * If extraction fails, no mock data is generated.
   */
  public async fetchLatestPriceReport(force: boolean = false): Promise<UsWheatScraperResult> {
    const now = Date.now();
    const timestampKST = getKSTFormattedTime();

    if (!force && this.cachedResult && now < this.cacheExpiresAt && this.cachedResult.success) {
      return {
        ...this.cachedResult,
        timestamp: timestampKST,
        isCached: true
      };
    }

    try {
      console.log(`[UsWheatService] Fetching latest price report from ${this.sourceUrl}...`);

      // 1. Fetch main price report page HTML
      const response = await fetch(this.sourceUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch U.S. Wheat price report page: HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // 2. Parse Report Date
      // Pattern: <div class="right">\s*<p>September 18, 2026</p>
      const tickerPosition = html.indexOf('ticker-reports-data-main');
      const reportRegion = tickerPosition >= 0
        ? html.slice(Math.max(0, tickerPosition - 16000), tickerPosition + 18000)
        : html;
      const dateCandidates = Array.from(reportRegion.matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+([0-9]{1,2})(?:st|nd|rd|th)?,?\s+(20[0-9]{2})/gi))
        .map(m => ({ raw: m[0], iso: asIsoDate(m[0]) }))
        .filter((item): item is {raw: string; iso: string} => !!item.iso && item.iso <= new Date(Date.now() + 86400000).toISOString().slice(0, 10))
        .sort((a,b) => b.iso.localeCompare(a.iso));
      const reportDate = dateCandidates[0]?.raw || null;

      if (!reportDate) {
        throw new Error('Could not find report date in U.S. Wheat Associates page HTML.');
      }

      // 3. Extract Active Tickers from .ticker-reports-data-main
      // Each item contains:
      // <h3 class="ticker-reports-title">December CBOT SRW was</h3>
      // <p class="ticker-reports-countvalue">$7.14 <span class="ticker-mmt">bu</span></p>
      // <img src=".../down_status.svg">
      // <p class="ticker-reports-resultstxt"> 11 cents</p>
      const tickerItems = [
        ...html.matchAll(/<div class="ticker-reports-dataitem[^"]*">([\s\S]*?)<\/div>\s*(?=<div class="ticker-reports-dataitem|<\/div>\s*<\/div>)/gi)
      ];

      const tickersParsed: Record<string, {
        title: string;
        contractMonth: string;
        exchange: string;
        wheatClass: string;
        price: number;
        changeDirection: 'down' | 'up' | 'unchanged';
        changeText: string;
        changeCents: number | null;
      }> = {};

      for (const item of tickerItems) {
        const block = item[1];
        const titleMatch = block.match(/<h3 class="ticker-reports-title">([^<]+)<\/h3>/i);
        const priceMatch = block.match(/<p class="ticker-reports-countvalue">\s*\$([0-9.]+)/i);
        const statusImgMatch = block.match(/src="[^"]*(down|up)_status\.svg"/i);
        const changeTxtMatch = block.match(/<p class="ticker-reports-resultstxt">([^<]+)<\/p>/i);

        if (!titleMatch || !priceMatch) continue;

        const title = titleMatch[1].trim();
        const price = parseFloat(priceMatch[1]);
        const direction: 'down' | 'up' | 'unchanged' = statusImgMatch
          ? (statusImgMatch[1].toLowerCase() as 'down' | 'up')
          : 'unchanged';
        const changeText = changeTxtMatch ? changeTxtMatch[1].trim() : '';

        // Extract "December CBOT SRW"
        const words = title.split(/\s+/);
        const month = words[0] || '';
        const exchange = words[1] || '';
        const wheatClass = words[2] || '';

        let cents: number | null = null;
        const cMatch = changeText.match(/([0-9.]+)\s*cents?/i);
        if (cMatch) {
          cents = parseFloat(cMatch[1]);
        }

        const key = wheatClass.toUpperCase();
        tickersParsed[key] = {
          title,
          contractMonth: month,
          exchange,
          wheatClass,
          price,
          changeDirection: direction,
          changeText,
          changeCents: cents
        };
      }

      // 4. Extract Front Month Closing Prices
      // e.g.
      // <h6 class="elementor-heading-title elementor-size-default">CBOT September SRW closed at</h6> ... <h3 ...>5.62</h3>
      const frontPrices: Record<string, { month: string; price: number }> = {};
      const frontRegex = /<h6 class="elementor-heading-title[^"]*">([^<]+(?:closed at|ended at|traded at)[^<]*)<\/h6>[\s\S]*?<h3 class="elementor-heading-title[^"]*">([0-9.]+)<\/h3>/gi;
      let fMatch;
      while ((fMatch = frontRegex.exec(html)) !== null) {
        const header = fMatch[1].trim();
        const price = parseFloat(fMatch[2]);
        const headerWords = header.split(/\s+/);
        // e.g. ["CBOT", "September", "SRW", "closed", "at"]
        const month = headerWords[1] || '';
        const wClass = (headerWords[2] || '').toUpperCase();
        if (wClass) {
          frontPrices[wClass] = { month, price };
        }
      }

      // Build structured contract objects
      const srwData = tickersParsed['SRW'];
      const hrwData = tickersParsed['HRW'];
      const hrsData = tickersParsed['HRS'];

      if (!srwData && !hrwData && !hrsData) {
        throw new Error('No wheat futures ticker contracts could be parsed from the page HTML.');
      }

      // Standard conversion for wheat futures: USD/bu × 36.7437 = USD/metric ton.
      // Never substitute sample prices for actual published observations.
      const buToMt = (usdPerBu: number | null, _wheatClass?: string) =>
        usdPerBu == null ? null : toMetricTon(usdPerBu);

      const cbotSrw: UsWheatFutureContract = {
        exchange: srwData?.exchange || 'CBOT',
        wheatClass: 'SRW',
        wheatClassName: 'Soft Red Winter (연질적색소맥)',
        contractMonth: srwData?.contractMonth || 'December',
        priceUsdPerBu: srwData?.price ?? null,
        priceUsdPerMetricTon: buToMt(srwData?.price ?? null, 'SRW'),
        weeklyChangeText: srwData ? `${srwData.changeDirection === 'down' ? '-' : '+'}${srwData.changeText}` : null,
        weeklyChangeDirection: srwData?.changeDirection || 'unchanged',
        weeklyChangeUsdPerBu:
          srwData?.changeCents != null
            ? (srwData.changeDirection === 'down' ? -1 : 1) * (srwData.changeCents / 100)
            : null,
        frontMonthClosed: frontPrices['SRW']
          ? {
              month: frontPrices['SRW'].month,
              priceUsdPerBu: frontPrices['SRW'].price
            }
          : null
      };

      const kcbtHrw: UsWheatFutureContract = {
        exchange: hrwData?.exchange || 'KCBT',
        wheatClass: 'HRW',
        wheatClassName: 'Hard Red Winter (경질적색소맥)',
        contractMonth: hrwData?.contractMonth || 'December',
        priceUsdPerBu: hrwData?.price ?? null,
        priceUsdPerMetricTon: buToMt(hrwData?.price ?? null, 'HRW'),
        weeklyChangeText: hrwData ? `${hrwData.changeDirection === 'down' ? '-' : '+'}${hrwData.changeText}` : null,
        weeklyChangeDirection: hrwData?.changeDirection || 'unchanged',
        weeklyChangeUsdPerBu:
          hrwData?.changeCents != null
            ? (hrwData.changeDirection === 'down' ? -1 : 1) * (hrwData.changeCents / 100)
            : null,
        frontMonthClosed: frontPrices['HRW']
          ? {
              month: frontPrices['HRW'].month,
              priceUsdPerBu: frontPrices['HRW'].price
            }
          : null
      };

      const miaxHrs: UsWheatFutureContract = {
        exchange: hrsData?.exchange || 'MIAX',
        wheatClass: 'HRS',
        wheatClassName: 'Hard Red Spring (경질봄소맥)',
        contractMonth: hrsData?.contractMonth || 'December',
        priceUsdPerBu: hrsData?.price ?? null,
        priceUsdPerMetricTon: buToMt(hrsData?.price ?? null, 'HRS'),
        weeklyChangeText: hrsData ? `${hrsData.changeDirection === 'down' ? '-' : '+'}${hrsData.changeText}` : null,
        weeklyChangeDirection: hrsData?.changeDirection || 'unchanged',
        weeklyChangeUsdPerBu:
          hrsData?.changeCents != null
            ? (hrsData.changeDirection === 'down' ? -1 : 1) * (hrsData.changeCents / 100)
            : null,
        frontMonthClosed: frontPrices['HRS']
          ? {
              month: frontPrices['HRS'].month,
              priceUsdPerBu: frontPrices['HRS'].price
            }
          : null
      };

      // 5. Query English Price Report Archive
      const historicalReports = await this.fetchArchiveEnglishReports();

      // 6. Build normalized market data items
      const dateKST = getKSTDateString();
      const normalizedData: NormalizedMarketData[] = [];

      if (cbotSrw.priceUsdPerMetricTon !== null && cbotSrw.priceUsdPerMetricTon !== undefined) {
        normalizedData.push({
          commodity: 'wheat',
          indicator: `CBOT 연질적색소맥(SRW) 선물 (${cbotSrw.contractMonth})`,
          country: 'USA',
          date: dateKST,
          value: cbotSrw.priceUsdPerMetricTon,
          unit: 'USD/MT',
          source: 'U.S. Wheat Associates Price Report',
          sourceUrl: this.sourceUrl,
          lastUpdated: timestampKST,
          status: 'success'
        });
      }

      if (kcbtHrw.priceUsdPerMetricTon !== null && kcbtHrw.priceUsdPerMetricTon !== undefined) {
        normalizedData.push({
          commodity: 'wheat',
          indicator: `KCBT 경질적색소맥(HRW) 선물 (${kcbtHrw.contractMonth})`,
          country: 'USA',
          date: dateKST,
          value: kcbtHrw.priceUsdPerMetricTon,
          unit: 'USD/MT',
          source: 'U.S. Wheat Associates Price Report',
          sourceUrl: this.sourceUrl,
          lastUpdated: timestampKST,
          status: 'success'
        });
      }

      if (miaxHrs.priceUsdPerMetricTon !== null && miaxHrs.priceUsdPerMetricTon !== undefined) {
        normalizedData.push({
          commodity: 'wheat',
          indicator: `MIAX/MGE 경질봄소맥(HRS) 선물 (${miaxHrs.contractMonth})`,
          country: 'USA',
          date: dateKST,
          value: miaxHrs.priceUsdPerMetricTon,
          unit: 'USD/MT',
          source: 'U.S. Wheat Associates Price Report',
          sourceUrl: this.sourceUrl,
          lastUpdated: timestampKST,
          status: 'success'
        });
      }

      // Extract verified HRW FOB export price and South Korea ocean freight

      const structuredResult: UsWheatScraperResult = {
        success: true,
        statusCode: 200,
        sourceUrl: this.sourceUrl,
        reportDate,
        data: {
          reportDate,
          source: 'U.S. Wheat Associates (Price Report)',
          sourceUrl: this.sourceUrl,
          cbotSrw,
          kcbtHrw,
          miaxHrs,
          historicalReportsCount: historicalReports.length,
          historicalReports
        },
        normalizedData,
        timestamp: timestampKST,
        isCached: false
      };

      // Cache successful response
      this.cachedResult = structuredResult;
      this.cacheExpiresAt = now + this.cacheDurationMs;

      return structuredResult;
    } catch (err: any) {
      console.error('[UsWheatService] Scraping failed:', err.message);

      // Graceful fallback: If we had a prior successful scrape, keep it with error notice
      if (this.cachedResult && this.cachedResult.success) {
        return {
          ...this.cachedResult,
          statusCode: 200,
          errorMessage: `Update failed: ${err.message}. Retaining last verified published report.`,
          timestamp: timestampKST,
          isCached: true
        };
      }

      // Do NOT generate mock data if extraction fails
      return {
        success: false,
        statusCode: 502,
        sourceUrl: this.sourceUrl,
        errorMessage: `Scraper error: ${err.message}`,
        timestamp: timestampKST
      };
    }
  }

  /**
   * Fetches the historical English price reports from U.S. Wheat's WordPress AJAX backend
   */
  private async fetchArchiveEnglishReports(): Promise<HistoricalReportArchiveItem[]> {
    try {
      const formData = new URLSearchParams();
      formData.append('action', 'price_report_load_more_posts');
      formData.append('post_type', 'price-report');
      formData.append('page', '1');
      formData.append('posts_per_page', '24');
      formData.append('taxonomy', 'price-report-category');
      formData.append('category_filter', '14'); // English language category ID
      formData.append('year_filter', '');

      const res = await fetch(this.ajaxUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: formData.toString()
      });

      if (!res.ok) {
        console.warn(`[UsWheatService] Archive fetch returned HTTP ${res.status}`);
        return [];
      }

      const json = (await res.json()) as { posts?: string };
      const postsHtml = json.posts || '';

      const archiveReports: HistoricalReportArchiveItem[] = [];
      const regex = /<div class="rvr-post-title"><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/div>/gi;
      let match;
      while ((match = regex.exec(postsHtml)) !== null) {
        const url = match[1];
        const rawTitle = match[2]
          .replace(/&#8211;|&ndash;|-/g, '–')
          .replace(/&amp;/g, '&')
          .trim();

        // Extract date after dash if present, or use raw title
        const dateMatch = rawTitle.match(/–\s*(.*)$/);
        const reportDate = dateMatch ? dateMatch[1].trim() : rawTitle;

        archiveReports.push({
          title: rawTitle,
          reportDate,
          url
        });
      }

      return archiveReports;
    } catch (archiveErr: any) {
      console.warn('[UsWheatService] Archive extraction warning:', archiveErr.message);
      return [];
    }
  }

  /** Retrieve the exact front-month USD/MT column from the dated, publisher-hosted PDF.
   * No synthesized values, Gemini calls, or third-party scraping services.
   */
  private async fetchExactFrontMonthSettlements(
    reportDate: string,
    contractMonth: string,
    roundedBu: [number, number, number],
    archive: HistoricalReportArchiveItem[]
  ) {
    const iso = asIsoDate(reportDate);
    if (!iso) throw new Error('Publisher date cannot be validated for PDF settlement lookup');
    const candidates = usWheatPdfCandidates(iso, '', archive.map(item => item.url));
    for (const url of candidates) {
      try {
        const result = await fetch(url, { method: 'GET', headers: { Accept: 'application/pdf' }, signal: AbortSignal.timeout(12000) });
        if (!result.ok || !/^https:\/\/(?:www\.)?uswheat\.org\//i.test(result.url)) continue;
        const contentLength = Number(result.headers.get('content-length') || 0);
        if (contentLength > 5_000_000) continue;
        const bytes = new Uint8Array(await result.arrayBuffer());
        if (bytes.length < 2000 || bytes.length > 5_000_000 || String.fromCharCode(...bytes.slice(0,4)) !== '%PDF') continue;
        const parser = new PDFParse({ data: bytes });
        const extracted = await parser.getText();
        const exact = parseUsWheatFuturesPdf(extracted?.text || '', iso, contractMonth);
        if (!exact) continue;
        if ([exact.srwBu,exact.hrwBu,exact.hrsBu].some((v,i) => Math.abs(v - roundedBu[i]) > 0.06)) continue;
        return { ...exact, pdfUrl: url };
      } catch (e) {
        console.warn('[WheatHistory] Publisher PDF unavailable:', url, e instanceof Error ? e.message : String(e));
      }
    }
    throw new Error(`Official settlement PDF could not be verified for ${iso} (${contractMonth}); previous price history retained`);
  }

  /**
   * Retrieves verified historical time-series wheat futures price data published by U.S. Wheat Associates.
   * Merges the latest published report dynamically with historical weekly reports.
   * Computes USD/MT (primary) and USD/bu, plus WoW and MoM metrics for SRW, HRW, and HRS.
   */
  /** Updates the durable price history at most every six hours unless explicitly forced.
   * The source publishes weekly: opening the graph never generates artificial daily prices.
   */
  public async getPriceHistory(force: boolean = false): Promise<UsWheatPriceHistoryResponse> {
    const now = Date.now();
    const timestampKST = getKSTFormattedTime();
    let stored = loadWheatHistory();
    const lastCheckMs = Date.parse(stored.lastCheckedAt || '');
    const due = force || !Number.isFinite(lastCheckMs) || (now - lastCheckMs) >= 6 * 60 * 60 * 1000;
    let updated = false;
    let sourceError = stored.lastError || '';
    if (due) {
      try {
        const source = await this.fetchLatestPriceReport(force);
        const latest = source.success ? source.data : null;
        if (!latest || !latest.cbotSrw?.priceUsdPerBu || !latest.kcbtHrw?.priceUsdPerBu || !latest.miaxHrs?.priceUsdPerBu) {
          throw new Error(source.errorMessage || 'Official report did not contain all three wheat futures prices');
        }
        const months = [latest.cbotSrw.contractMonth, latest.kcbtHrw.contractMonth, latest.miaxHrs.contractMonth];
        if (!months[0] || months.some(month => month !== months[0])) {
          throw new Error('SRW, HRW, and HRS futures use different contract months; report cannot be merged safely');
        }
        const exact = await this.fetchExactFrontMonthSettlements(
          latest.reportDate,
          months[0],
          [latest.cbotSrw.priceUsdPerBu, latest.kcbtHrw.priceUsdPerBu, latest.miaxHrs.priceUsdPerBu],
          latest.historicalReports
        );
        const merge = mergePublishedWheatReport(stored, {
          date: exact.reportDate,
          srwBu: exact.srwBu, hrwBu: exact.hrwBu, hrsBu: exact.hrsBu,
          srwMt: exact.srwMt, hrwMt: exact.hrwMt, hrsMt: exact.hrsMt,
          contractMonth: exact.contractMonth,
          sourceUrl: exact.pdfUrl
        });
        stored = merge.history;
        updated = merge.changed;
        sourceError = '';
      } catch (error) {
        // Preserve all saved observations; an unavailable publisher never becomes a new data point.
        sourceError = error instanceof Error ? error.message : String(error);
        console.warn('[WheatHistory] No verified update:', sourceError);
      }
      stored.lastCheckedAt = new Date().toISOString();
      stored.lastError = sourceError || undefined;
      saveWheatHistory(stored);
    }
    const points = toChartPoints(stored.points);
    const metrics = buildWheatMetrics(stored.points);
    if (!metrics || !points.length) {
      return {
        success: false, statusCode: 503, source: 'U.S. Wheat Associates', sourceUrl: WHEAT_PRICE_SOURCE,
        reportDate: '', lastRetrievalTime: timestampKST, primaryUnit: 'USD/MT', secondaryUnit: 'USD/bu',
        count: 0, data: [], metrics: {} as any, errorMessage: sourceError || 'No saved Wheat price history'
      };
    }
    const latestSaved = stored.points[stored.points.length - 1];
    return {
      success: true, statusCode: 200, source: 'U.S. Wheat Associates', sourceUrl: WHEAT_PRICE_SOURCE,
      reportDate: points[points.length - 1].reportDate,
      lastRetrievalTime: timestampKST, primaryUnit: 'USD/MT', secondaryUnit: 'USD/bu',
      count: points.length, data: points, metrics,
      isCached: !updated,
      // The source date is distinct from the check date, and baseline observations are not passed off as verified.
      latestSourceType: latestSaved.provenance, sourceStatus: sourceError ? 'unavailable' : latestSaved.provenance === 'source-verified' ? 'verified' : 'baseline',
      sourceLastCheckedAt: stored.lastCheckedAt || null, sourceLastVerifiedAt: stored.lastVerifiedAt || null,
      sourceError: sourceError || null
    };
  }

  /** Read-only health check. This never accesses external sources or Gemini. */
  public getPriceHistoryStatus() {
    const saved = loadWheatHistory();
    const latest = saved.points[saved.points.length - 1];
    return {
      storedPoints: saved.points.length,
      latestReportDate: latest?.date || null,
      latestSourceType: latest?.provenance || null,
      lastCheckedAt: saved.lastCheckedAt || null,
      lastVerifiedAt: saved.lastVerifiedAt || null,
      lastError: saved.lastError || null,
      store: '.rms-price-history/wheat.json',
      officialSource: WHEAT_PRICE_SOURCE,
      geminiCalls: 0
    };
  }
}

export const usWheatPriceReportService = UsWheatPriceReportService.getInstance();
