import type {SoybeanPriceSnapshot} from './soybeanPriceSnapshot';
import type {observedPriceChanges} from './observedPriceChanges';
/** ICE No.11 raw-sugar futures, never a physical refined-sugar offer. */
export type SugarPriceSnapshot=Omit<SoybeanPriceSnapshot,'procurementAnalysis'> & {
 priceInputs:{benchmark:'ICE:SB=F';observationDate:string;rawPrice:number;rawUnit:'US¢/lb';usdPerMT:number;comparisons:ReturnType<typeof observedPriceChanges>};
};
