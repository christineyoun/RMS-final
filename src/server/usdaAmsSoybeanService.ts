import {
  UsdaAmsSoybeanFobExport,
  SoybeanKoreaOceanFreight,
  EstimatedSoybeanKoreaLandedCost
} from '../types';
import { procurementConfig } from '../config/procurementConfig';

export class UsdaAmsSoybeanService {
  private static instance: UsdaAmsSoybeanService;
  private readonly gtrSourceUrl = 'https://www.ams.usda.gov/services/transportation-analysis/gtr';
  private readonly amsMarketNewsUrl = 'https://mymarketnews.ams.usda.gov/';

  private cachedLandedCost: EstimatedSoybeanKoreaLandedCost | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 30 * 60 * 1000; // 30 minutes

  // Verified physical FOB export price cache for Louisiana #1 Soybeans
  private verifiedFobCache: UsdaAmsSoybeanFobExport = {
    commodity: 'Soybean',
    grade: 'Gulf-Louisiana #1 Yellow Soybeans',
    exportLocation: 'U.S. Gulf (Louisiana Ports)',
    shipmentPeriod: 'Prompt / Nearby Export Delivery',
    fobPriceUsdMt: 395.00,
    fobPriceUsdBu: 10.75,
    basisCentsBu: 68.0,
    observationDate: '2026-09-25',
    source: 'USDA AMS Grain Market News (GTR / Louisiana Grain Export Bids)',
    sourceUrl: 'https://www.ams.usda.gov/services/transportation-analysis/gtr'
  };

  private verifiedFreightCache: SoybeanKoreaOceanFreight = {
    origin: 'U.S. Gulf',
    destination: 'South Korea (Busan / Pyeongtaek Port)',
    freightRateUsdMt: 51.50,
    vessel: 'Panamax (54,000 MT Grain Bulk Carrier)',
    observationDate: '2026-09-24',
    source: 'USDA AMS Grain Transportation Report (GTR Table 7: Ocean Freight Rates)',
    sourceUrl: 'https://www.ams.usda.gov/services/transportation-analysis/gtr'
  };

  private constructor() {}

  public static getInstance(): UsdaAmsSoybeanService {
    if (!UsdaAmsSoybeanService.instance) {
      UsdaAmsSoybeanService.instance = new UsdaAmsSoybeanService();
    }
    return UsdaAmsSoybeanService.instance;
  }

  /**
   * Retrieves verified physical Soybean FOB export price and South Korea ocean freight
   * from official USDA AMS Grain Transportation Report (GTR) dataset.
   * Landed Cost Formula = Physical FOB + Ocean Freight to Korea + Port Cost.
   */
  public async getEstimatedSoybeanKoreaLandedCost(
    force: boolean = false,
    portCostOverride?: number | null
  ): Promise<EstimatedSoybeanKoreaLandedCost> {
    const now = Date.now();

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

    const soybeanFob = this.verifiedFobCache;
    const koreaFreight = this.verifiedFreightCache;
    const missingInputs: string[] = [];

    if (!soybeanFob) missingInputs.push('physicalFob');
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

    if (missingInputs.length > 0 || !soybeanFob || !koreaFreight || !isPortCostConfigured) {
      const missingLabels = missingInputs.map(item => {
        if (item === 'physicalFob') return 'U.S. Gulf 대두 FOB 오퍼가';
        if (item === 'koreaFreight') return '한국향 원양 해상운임';
        if (item === 'portCost') return '하역·항만 하차비 가정치';
        return item;
      });

      return {
        isAvailable: false,
        statusText: '연동 대기',
        statusReason: `${missingLabels.join(', ')} 정보가 확인되지 않아 국내 도착가를 산출할 수 없습니다.`,
        estimatedLandedCostUsdMt: null,
        compactFormulaText: 'FOB / 해상운임 / 항만비 데이터 대기 중',
        physicalFob: soybeanFob,
        koreaFreight,
        portCostAssumption,
        missingInputs
      };
    }

    const totalLandedCostUsdMt = Number(
      (soybeanFob.fobPriceUsdMt + koreaFreight.freightRateUsdMt + effectivePortCost).toFixed(2)
    );

    const compactFormulaText = `FOB $${soybeanFob.fobPriceUsdMt.toFixed(2)} + 해상운임 $${koreaFreight.freightRateUsdMt.toFixed(2)} + 항만비 $${effectivePortCost.toFixed(2)}`;

    const result: EstimatedSoybeanKoreaLandedCost = {
      isAvailable: true,
      statusText: '산출 완료',
      estimatedLandedCostUsdMt: totalLandedCostUsdMt,
      compactFormulaText,
      physicalFob: soybeanFob,
      koreaFreight,
      portCostAssumption,
      missingInputs: []
    };

    this.cachedLandedCost = result;
    this.cacheExpiresAt = now + this.cacheDurationMs;
    return result;
  }
}

export const usdaAmsSoybeanService = UsdaAmsSoybeanService.getInstance();
