import { PDFParse } from 'pdf-parse';
import type { AmisWheatIntelligence, AmisWheatResponse } from '../types.ts';
import { getKSTFormattedTime } from './marketDataService.ts';

export class AmisService {
  private static instance: AmisService;
  private readonly sourcePageUrl = 'https://www.amis-outlook.org/market-monitor';
  private readonly gcsBucketPrefixUrl = 'https://storage.googleapis.com/amis-9189b-strapi?prefix=AMIS_Market_Monitor';
  private cachedIntelligence: AmisWheatResponse | null = null;
  private lastVerifiedData: AmisWheatIntelligence | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 60 * 60 * 1000; // 1-hour cache

  private constructor() {}

  public static getInstance(): AmisService {
    if (!AmisService.instance) {
      AmisService.instance = new AmisService();
    }
    return AmisService.instance;
  }

  /**
   * Detects the latest official AMIS Market Monitor issue from the official storage index
   */
  private async detectLatestMarketMonitor(): Promise<{
    issueNumber: number;
    pdfUrl: string;
    lastModified?: string;
  }> {
    try {
      const response = await fetch(this.gcsBucketPrefixUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nongshim-SCM-Wheat-Monitor/1.0',
          'Accept': 'application/xml,text/xml,*/*'
        }
      });

      if (!response.ok) {
        throw new Error(`GCS bucket listing returned HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      const keys = [...xmlText.matchAll(/<Key>([^<]+)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>/g)]
        .map((m) => ({ key: m[1], lastModified: m[2] }))
        .filter(
          (item) =>
            item.key.endsWith('.pdf') &&
            !item.key.toLowerCase().includes('draft') &&
            !item.key.toLowerCase().includes('image')
        );

      keys.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

      // Look for latest numbered issue
      for (const item of keys) {
        const issueMatch = item.key.match(/Issue_(\d+)/i);
        if (issueMatch) {
          const num = parseInt(issueMatch[1], 10);
          return {
            issueNumber: num,
            pdfUrl: `https://storage.googleapis.com/amis-9189b-strapi/${item.key}`,
            lastModified: item.lastModified
          };
        }
      }

      // Fallback to current pointer if available
      const currentItem = keys.find((k) => k.key.includes('current'));
      if (currentItem) {
        return {
          issueNumber: 141,
          pdfUrl: `https://storage.googleapis.com/amis-9189b-strapi/${currentItem.key}`,
          lastModified: currentItem.lastModified
        };
      }
    } catch (err) {
      console.warn('[AmisService] Failed to dynamically query bucket index, using verified release reference:', err);
    }

    // Default verified latest release URL
    return {
      issueNumber: 141,
      pdfUrl:
        'https://storage.googleapis.com/amis-9189b-strapi/AMIS_Market_Monitor_Issue_141_ebfa77881c/AMIS_Market_Monitor_Issue_141_ebfa77881c.pdf'
    };
  }

  /**
   * Retrieves and parses the latest AMIS Market Monitor PDF, extracting Wheat procurement intelligence.
   */
  public async fetchWheatIntelligence(force: boolean = false): Promise<AmisWheatResponse> {
    const now = Date.now();
    const retrievalTimestamp = getKSTFormattedTime();

    if (!force && this.cachedIntelligence && now < this.cacheExpiresAt && this.cachedIntelligence.success) {
      return {
        ...this.cachedIntelligence,
        isCached: true
      };
    }

    try {
      console.log('[AmisService] Detecting latest Market Monitor issue...');
      const target = await this.detectLatestMarketMonitor();
      console.log(`[AmisService] Downloading official PDF: ${target.pdfUrl}`);

      const pdfResp = await fetch(target.pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nongshim-SCM-Intelligence/1.0',
          'Accept': 'application/pdf,*/*'
        }
      });

      if (!pdfResp.ok) {
        throw new Error(`Failed to download PDF: HTTP ${pdfResp.status} ${pdfResp.statusText}`);
      }

      const arrayBuffer = await pdfResp.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      console.log(`[AmisService] Parsing PDF with pdf-parse (${pdfBuffer.length} bytes)...`);
      const parser = new PDFParse({ data: pdfBuffer });
      const parseResult = await parser.getText();
      const text = typeof parseResult === 'string' ? parseResult : (parseResult as any).text || '';
      await parser.destroy();

      if (!text || text.length < 500) {
        throw new Error('PDF parsing resulted in empty or incomplete text stream.');
      }

      // 1. Publication Date & Issue Number Extraction
      const headerMatch = text.match(/Market\s*Monitor\s*No\.?\s*(\d+)\s+([A-Za-z]+\s+\d{4})/i);
      const parsedIssueNo = headerMatch ? parseInt(headerMatch[1], 10) : target.issueNumber;
      if(!headerMatch)throw Error('AMIS publication identity unavailable');
      const publicationDate = headerMatch[2].trim();

      // 2. Production Outlook Extraction for Wheat
      // Pattern: WHEAT Production forecast for 2026 raised compared to July...
      const wheatProdMatch = text.match(/WHEAT\s+Production forecast for[^.]+\.(?:[^.]+\.)?/i);
      const productionOutlook = wheatProdMatch
        ? wheatProdMatch[0].replace(/\s+/g, ' ').trim()
        : '자료 미확보';

      // 3. Crop Conditions for United States, Australia, Canada
      const usCropMatch = text.match(/In the US,\s*the winter wheat harvest[^.]+\.[^.]+\./i);
      const usCrop = usCropMatch
        ? usCropMatch[0].replace(/\s+/g, ' ').trim()
        : '자료 미확보';

      const ausCropMatch = text.match(/In Australia,\s*condi-?\s*tions are exceptional[^.]+\.[^.]+\./i);
      const ausCrop = ausCropMatch
        ? ausCropMatch[0].replace(/\s+/g, ' ').trim()
        : '자료 미확보';

      const canCropMatch = text.match(/In Canada,\s*winter wheat harvesting[^.]+\.[^.]+\./i);
      const canCrop = canCropMatch
        ? canCropMatch[0].replace(/\s+/g, ' ').trim()
        : '자료 미확보';

      // 4. Trade & Black Sea / Ukraine / Russia Logistics
      const tradeMatch = text.match(/Trade in 2026\/27[^.]*Black Sea region continue to face logistical constraints[^.]*\./i);
      const tradeLogistics = tradeMatch
        ? tradeMatch[0].replace(/\s+/g, ' ').trim()
        : '자료 미확보';

      // 5. Weather / El Niño / IOD Risks
      const weatherRisks =
        '자료 미확보';

      // 6. International Wheat Price Direction
      const priceDirection =
        '자료 미확보';

      // 7. Verified Korean Macro Risk Summary Sentence (Single concise sentence matching user preferred style)
      const macroRiskSentenceKo = '자료 미확보';

      // 8. Quantified Risk Assessment Score
      // Production raised & North America yields good, but Black Sea logistics and El Niño weather risks warrant moderate monitoring
      const macroRiskScore = NaN; // The source does not publish an RMS risk score.
      const macroRiskLevel = '자료 미확보' as const;

      const intelligenceData: AmisWheatIntelligence = {
        issueNumber: parsedIssueNo,
        publicationDate,
        pdfUrl: target.pdfUrl,
        sourcePageUrl: this.sourcePageUrl,
        retrievalTimestamp,
        macroRiskSentenceKo,
        macroRiskScore,
        macroRiskLevel,
        findings: {
          priceDirection,
          productionOutlook,
          cropConditions: {
            us: usCrop,
            australia: ausCrop,
            canada: canCrop
          },
          tradeAndLogistics: tradeLogistics,
          weatherRisks,
          majorMacroFactors: '자료 미확보'
        },
        rawExcerpt: productionOutlook
      };

      this.lastVerifiedData = intelligenceData;

      const result: AmisWheatResponse = {
        success: true,
        statusCode: 200,
        source: 'AMIS Market Monitor (FAO / OECD / World Bank / WTO Secretariat)',
        sourceUrl: this.sourcePageUrl,
        data: intelligenceData,
        isCached: false,
        isStale: Date.now()-Date.parse(publicationDate)>45*86400000
      };

      this.cachedIntelligence = result;
      this.cacheExpiresAt = now + this.cacheDurationMs;
      return result;
    } catch (err: any) {
      console.error('[AmisService] Error retrieving or parsing AMIS Market Monitor:', err);

      // Rule 7: If external source temporarily fails, preserve last successfully verified data
      if (this.lastVerifiedData) {
        return {
          success: true,
          statusCode: 200,
          source: 'AMIS Market Monitor (FAO / OECD / World Bank / WTO Secretariat)',
          sourceUrl: this.sourcePageUrl,
          data: this.lastVerifiedData,
          errorMessage: `최신 AMIS 데이터 갱신 일시 실패: ${err.message}. 이전 검증 데이터 보존 중.`,
          isCached: true,
          isStale: true
        };
      }

      return {
        success: false,
        statusCode: 502,
        source: 'AMIS Market Monitor',
        sourceUrl: this.sourcePageUrl,
        errorMessage: `AMIS Market Monitor 데이터 추출 실패: ${err.message}`
      };
    }
  }

  public async fetchMaizeIntelligence(force: boolean = false): Promise<any> {throw Error('Commodity-specific verified AMIS findings unavailable');}

  public async fetchSoybeanIntelligence(force: boolean = false): Promise<any> {throw Error('Commodity-specific verified AMIS findings unavailable');}

  public async fetchSoybeanOilIntelligence(force: boolean = false): Promise<any> {throw Error('Commodity-specific verified AMIS findings unavailable');}
}

export const amisService = AmisService.getInstance();
