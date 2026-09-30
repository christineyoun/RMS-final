export const LBS_PER_METRIC_TON = 2204.6226;
export const CORN_BUSHELS_PER_MT = 39.368;
export const WHEAT_SOY_BUSHELS_PER_MT = 36.7437;

/**
 * Cents per pound to USD/MT (Used by Sugar SB=F, Soybean Oil ZL=F)
 */
export function centsPerLbToUsdPerMt(centsPerLb: number): number {
  return (centsPerLb / 100) * LBS_PER_METRIC_TON;
}

/**
 * Cents per bushel to USD/MT (Used by Corn ZC=F)
 */
export function cornCentsPerBuToUsdPerMt(centsPerBu: number): number {
  return (centsPerBu / 100) * CORN_BUSHELS_PER_MT;
}

/**
 * Cents per bushel to USD/MT (Used by Wheat ZW=F/W=F, Soybeans ZS=F)
 */
export function grainCentsPerBuToUsdPerMt(centsPerBu: number): number {
  return (centsPerBu / 100) * WHEAT_SOY_BUSHELS_PER_MT;
}
