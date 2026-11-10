/**
 * Backward compatibility ONLY for old recovered soybean STEP4 snapshots.
 * Legacy recovery saved analysis arrays but did not save a top-level commodity.
 * New snapshots and all other commodities MUST contain matching commodity.
 * This does not mutate, migrate or re-write any saved evidence.
 */
import path from 'node:path';
import {assertSnapshotCommodity,type Commodity} from './commodity-config.ts';

export function assertStep4SnapshotCommodity(
  snapshot:unknown,
  commodity:Commodity,
  filename:string,
  directory:string,
):'explicit'|'legacy-soybean' {
  const actual=(snapshot as {commodity?:unknown}|null)?.commodity;
  if(actual!==undefined){
    assertSnapshotCommodity(snapshot,commodity,'4');
    return 'explicit';
  }
  const analysis=(snapshot as {analysis?:Record<string,unknown>}|null)?.analysis;
  const knownLegacyFile=/^step4-recovered-[\w-]+\.json$/.test(filename);
  const legacyFolder=path.basename(path.resolve(directory))==='.rms-soybean-rebuild';
  const plausibleRecovery=analysis && Array.isArray(analysis.originalInventory)
    && analysis.originalInventory.length>0
    && Array.isArray(analysis.candidateAssessments)
    && Array.isArray(analysis.findings)
    && Array.isArray(analysis.researchGaps);
  if(commodity==='soybean' && knownLegacyFile && legacyFolder && plausibleRecovery){
    return 'legacy-soybean';
  }
  throw Error(`STEP 4 commodity mismatch: selected ${commodity}, input undefined. No writes or paid calls.`);
}
