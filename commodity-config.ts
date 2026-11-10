/** Shared selection and storage policy. Soybean legacy snapshots stay exactly where they are. */
import path from 'node:path';
export const COMMODITIES = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'] as const;
export type Commodity = typeof COMMODITIES[number];
export const COMMODITY_NAMES:Record<Commodity,string> = {
  wheat:'wheat',corn:'corn',soybean:'soybean','soybean-oil':'soybean oil','palm-oil':'palm oil',
  sugar:'sugar','potato-starch':'potato starch','tapioca-starch':'tapioca starch',
};
export const COMMODITY_KO:Record<Commodity,string> = {
  wheat:'밀',corn:'옥수수',soybean:'대두','soybean-oil':'대두유','palm-oil':'팜유',sugar:'설탕',
  'potato-starch':'감자전분','tapioca-starch':'타피오카전분',
};
export function isCommodity(v:unknown):v is Commodity {
  return typeof v==='string' && (COMMODITIES as readonly string[]).includes(v);
}
export function commodityFromArgv(argv:string[]=process.argv.slice(2),env:NodeJS.ProcessEnv=process.env):Commodity {
  const choices:string[]=[];
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--commodity'){
      if(!argv[i+1] || argv[i+1].startsWith('--'))throw Error('--commodity requires a value');
      choices.push(argv[++i]);
    }else if(argv[i].startsWith('--commodity='))choices.push(argv[i].slice('--commodity='.length));
  }
  const envChoice=env.RMS_RESEARCH_COMMODITY?.trim();
  if(!choices.length&&envChoice)choices.push(envChoice);
  if(choices.length>1 && new Set(choices).size>1)throw Error('Conflicting --commodity inputs.');
  const raw=choices[0]||'soybean';
  if(!isCommodity(raw))throw Error(`Unknown commodity "${raw}"; expected: ${COMMODITIES.join(', ')}`);
  return raw;
}
export function resultFolder(commodity:Commodity,root:string=process.cwd()):string {
  // Unset: keep every manual STEP1-7 snapshot path exactly as before.
  const base=commodity==='soybean'?path.join(root,'.rms-soybean-rebuild'):
    path.join(root,'.rms-research',commodity);
  // Scheduled worker opts into fresh day-scoped snapshots. Never delete/reuse
  // earlier completed research, and never share yesterday's paid attempt locks.
  const day=process.env.RMS_RESEARCH_RUN_DAY;
  if(day===undefined)return base;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
    throw Error('Invalid RMS_RESEARCH_RUN_DAY; refusing research path selection');
  return path.join(base,'daily',day);
}
export function assertSnapshotCommodity(snapshot:unknown,commodity:Commodity,stage:string):void {
  const actual=(snapshot as {commodity?:unknown})?.commodity;
  if(actual!==commodity)throw Error(`STEP ${stage} commodity mismatch: selected ${commodity}, input ${String(actual)}. No writes or paid calls.`);
}
