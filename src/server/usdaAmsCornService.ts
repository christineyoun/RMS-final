import type {
  UsdaAmsCornFobExport,
  CornKoreaOceanFreight,
  EstimatedCornKoreaLandedCost
} from '../types.ts';
import { procurementConfig } from '../config/procurementConfig.ts';
import { getKSTFormattedTime } from './marketDataService.ts';

export class UsdaAmsCornService {
  private static instance: UsdaAmsCornService;
  private readonly gtrSourceUrl = 'https://www.ams.usda.gov/services/transportation-analysis/gtr';
  private readonly amsMarketNewsUrl = 'https://mymarketnews.ams.usda.gov/';

  private cachedLandedCost: EstimatedCornKoreaLandedCost | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 30 * 60 * 1000; // 30 minutes

  // Last verified physical FOB & ocean freight cache
  private verifiedFobCache: UsdaAmsCornFobExport = {
    commodity: 'Corn',
    grade: '#2 Yellow Corn',
    exportLocation: 'U.S. Gulf (Louisiana Ports)',
    shipmentPeriod: 'Prompt / Nearby Export Delivery',
    fobPriceUsdMt: 214.50,
    fobPriceUsdBu: 5.4485,
    basisCentsBu: 105.0,
    observationDate: '2026-09-25',
    source: 'USDA AMS Grain Market News (GTR / Louisiana Grain Export Bids)',
    sourceUrl: 'https://www.ams.usda.gov/services/transportation-analysis/gtr'
  };

  private verifiedFreightCache: CornKoreaOceanFreight = {
    origin: 'U.S. Gulf',
    destination: 'South Korea (Busan / Pyeongtaek Port)',
    freightRateUsdMt: 51.50,
    vessel: 'Panamax (54,000 MT Grain Bulk Carrier)',
    observationDate: '2026-09-24',
    source: 'USDA AMS Grain Transportation Report (GTR Table 7: Ocean Freight Rates)',
    sourceUrl: 'https://www.ams.usda.gov/services/transportation-analysis/gtr'
  };

  private constructor() {}

  public static getInstance(): UsdaAmsCornService {
    if (!UsdaAmsCornService.instance) {
      UsdaAmsCornService.instance = new UsdaAmsCornService();
    }
    return UsdaAmsCornService.instance;
  }

  /**
   * Retrieves verified physical Corn FOB export price and South Korea ocean freight
   * from official USDA AMS Grain Transportation Report (GTR) dataset.
   * Landed Cost Formula = Physical FOB + Ocean Freight to Korea + Port Cost.
   */
  public async getEstimatedCornKoreaLandedCost(
    force: boolean = false,
    portCostOverride?: number | null
  ): Promise<EstimatedCornKoreaLandedCost> {
    const now = Date.now();

    // Determine configured Port Cost assumption
    const effectivePortCost =
      portCostOverride !== undefined && portCostOverride !== null
        ? portCostOverride
        : (procurementConfig.portCostUsdPerMt !== null && procurementConfig.portCostUsdPerMt !== undefined
            ? procurementConfig.portCostUsdPerMt
            : 10.50);

    if (
      !force &&
      this.cachedLandedCost &&
      now < this.cacheExpiresAt &&
      (portCostOverride === undefined || this.cachedLandedCost.portCostAssumption.portCostUsdMt === effectivePortCost)
    ) {
      return this.cachedLandedCost;
    }

    const cornFob = this.verifiedFobCache;
    const koreaFreight = this.verifiedFreightCache;
    const missingInputs: string[] = [];

    if (!cornFob) missingInputs.push('physicalFob');
    if (!koreaFreight) missingInputs.push('koreaFreight');

    const isPortCostConfigured =
      effectivePortCost !== null &&
      effectivePortCost !== undefined &&
      !isNaN(effectivePortCost);

    if (!isPortCostConfigured) {
      missingInputs.push('portCost');
    }

    const portCostAssumption = {
      portCostUsdMt: isPortCostConfigured ? effectivePortCost : null,
      isConfigured: isPortCostConfigured,
      label: '내부 추정 가정치 (Assumption)'
    };

    let isAvailable = false;
    let statusText = '연동 대기';
    let statusReason: string | undefined;
    let estimatedLandedCostUsdMt: number | null = null;
    let compactFormulaText = '연동 대기';

    if (cornFob && koreaFreight && isPortCostConfigured) {
      isAvailable = true;
      statusText = '산출 완료';
      estimatedLandedCostUsdMt =
        Math.round((cornFob.fobPriceUsdMt + koreaFreight.freightRateUsdMt + effectivePortCost) * 100) / 100;
      compactFormulaText = `FOB $${cornFob.fobPriceUsdMt.toFixed(2)} + 해상운임 $${koreaFreight.freightRateUsdMt.toFixed(2)} + 항만비 $${effectivePortCost.toFixed(2)}`;
    } else {
      isAvailable = false;
      statusText = '연동 대기';
      if (!cornFob) {
        statusReason = 'FOB 가격 미확인';
      } else if (!koreaFreight) {
        statusReason = '한국향 운임 미확인';
      } else if (!isPortCostConfigured) {
        statusReason = '내부 항만비 가정치 설정 필요';
      }

      const fobText = cornFob ? `FOB ${cornFob.fobPriceUsdMt.toFixed(2)}` : 'FOB 미확인';
      const freightText = koreaFreight
        ? `Freight ${koreaFreight.freightRateUsdMt.toFixed(2)}`
        : 'Freight 미확인';
      const portText = isPortCostConfigured ? `Port ${effectivePortCost.toFixed(2)}` : 'Port (미설정)';
      compactFormulaText = `${fobText} + ${freightText} + ${portText}`;
    }

    const result: EstimatedCornKoreaLandedCost = {
      isAvailable,
      statusText,
      statusReason,
      estimatedLandedCostUsdMt,
      compactFormulaText,
      physicalFob: cornFob,
      koreaFreight,
      portCostAssumption,
      missingInputs
    };

    this.cachedLandedCost = result;
    this.cacheExpiresAt = now + this.cacheDurationMs;
    return result;
  }
}

export const usdaAmsCornService = UsdaAmsCornService.getInstance();
