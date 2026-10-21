import type {SoybeanOilSupplyResult} from '../lib/soybeanOilSupply';
import type {SoybeanPriceSnapshot} from './soybeanPriceSnapshot';
import type {SoybeanOilProcurementAnalysisData} from '../types';
export type SoybeanOilPriceSnapshot=Omit<SoybeanPriceSnapshot,'procurementAnalysis'> & {procurementAnalysis:SoybeanOilProcurementAnalysisData;supplyEvidence?:SoybeanOilSupplyResult};
