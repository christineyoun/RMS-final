export interface JrcCountryReport {
  yieldForecast: number; // in MT/HA
  yieldChange: number;    // % change vs 5-year average (e.g. -2.5)
  weather: string;
  cropCondition: string;
}

export interface JrcMarsBulletinData {
  reportDate: string;
  reportUrl: string;
  Germany: JrcCountryReport;
  Denmark: JrcCountryReport;
  Netherlands: JrcCountryReport;
  France: JrcCountryReport;
}

/** Legacy example report retired. Verified reports use potatoJrcOutlook.ts. */
export class JrcService {
 private static instance:JrcService;
 public static getInstance(){return this.instance||(this.instance=new JrcService());}
 public async getLatestJrcMarsBulletin(_force=false):Promise<JrcMarsBulletinData>{throw Error('Verified JRC report unavailable through the legacy example adapter');}
}
export const jrcService=JrcService.getInstance();
