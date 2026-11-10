/** Any RMS commodity may be recovered ONLY when its own saved STEP7 risk is absent. */
export const TARGETS=Object.freeze(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
export function kstDay(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function parseArgs(argv){
  if(!argv.length)return {mode:'status',commodity:null,approved:false};
  const allowed=['status','free','paid-one','review-once','map'];
  const [mode,...rest]=argv;
  if(!allowed.includes(mode))throw Error('Mode must be status, free, paid-one, review-once, or map');
  let commodity=null,approved=false;
  for(const arg of rest){
    if(arg.startsWith('--commodity=')){if(commodity)throw Error('Duplicate commodity');commodity=arg.slice(12);}
    else if(arg==='--approve-paid=YES'){if(approved)throw Error('Duplicate approval');approved=true;}
    else throw Error('Unknown flag (no implicit paid permission): '+arg);
  }
  if(mode==='status'){
    if(commodity||approved)throw Error('status takes no flags');
  }else if(!TARGETS.includes(commodity))throw Error('Only known RMS commodities may be recovered');
  if(['paid-one','review-once'].includes(mode)!==approved)throw Error('Paid mode requires --approve-paid=YES; nonpaid modes reject approval');
  return {mode,commodity,approved};
}
export function ensureCurrentDay(env,now=new Date()){
  const day=kstDay(now);
  if(env.RMS_RESEARCH_RUN_DAY&&env.RMS_RESEARCH_RUN_DAY!==day)
    throw Error('Existing RMS_RESEARCH_RUN_DAY differs from current KST day; stop rather than mix checkpoints');
  if(env.CLOUD_RUN_JOB||env.K_SERVICE||env.NODE_ENV==='production'||env.RMS_PUBLIC_READONLY==='1')
    throw Error('Local owner-side research only; Cloud/read-only execution denied');
  return day;
}
export function unreviewedAttemptFiles(files){
  return files.filter(name=>/^paid-(?:step1|step4|step5search|step5decision|step6search|step7)\.json$/.test(name)||
    /^step7-fact-attempt-[a-f0-9]{20}(?:-retry-v1)?\.json$/.test(name));
}
