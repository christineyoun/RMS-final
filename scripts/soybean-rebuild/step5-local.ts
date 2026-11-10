/** Offline I/O helper, used by preview and paid-search entry points. */
import fs from 'node:fs';
import path from 'node:path';
import {makePlan,buildStep5Prompt,chooseStep4Snapshot,getKstDate,type Step4Snapshot} from './step5-plan.ts';
import {commodityFromArgv,resultFolder,type Commodity} from './commodity-config.ts';
import {assertStep4SnapshotCommodity} from './step4-legacy-compat.ts';
export function loadStep5Context(cwd=process.cwd(),commodity:Commodity=commodityFromArgv()) {
  const dir=resultFolder(commodity,cwd);
  if(!fs.existsSync(dir))throw Error('STEP 1–4 output folder does not exist: .rms-soybean-rebuild');
  const file=chooseStep4Snapshot(fs.readdirSync(dir));
  if(!file)throw Error('No STEP 4 saved JSON found. Run offline recovery first.');
  const raw=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')) as Step4Snapshot;
  assertStep4SnapshotCommodity(raw,commodity,file,dir);
  if(file.startsWith('step4-analysis-')&&raw.status!=='review-generated')throw Error('Latest STEP4 analysis is incomplete. First run free step4-diagnose.ts to create step4-recovered JSON.');
  const plan=makePlan(raw);
  if(!plan.existingFindings.length&&!plan.gapLeads.length)throw Error('No usable STEP4 research context. Avoid paid call.');
  const prompt=buildStep5Prompt(
  plan,
  process.env.RMS_RESEARCH_RUN_DAY ?? getKstDate(new Date())
 );
  return {dir,file,snapshot:raw,plan,prompt};
}
