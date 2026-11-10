/** Local read-only loading. Validates both previous analysis and actual Google round-1 verification. */
import fs from 'node:fs';
import path from 'node:path';
import {buildDecisionInput,buildDecisionPrompt,getKstDate,type Step4,type Graded} from './step5-decision-core.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity,type Commodity} from './commodity-config.ts';
import {assertStep4SnapshotCommodity} from './step4-legacy-compat.ts';
import {chooseStep4Snapshot} from './step5-plan.ts';
export function loadDecisionContext(
  cwd=process.cwd(),
  day=process.env.RMS_RESEARCH_RUN_DAY ?? getKstDate(new Date()),
  commodity:Commodity=commodityFromArgv()
){
  const dir=resultFolder(commodity,cwd);
  if(!fs.existsSync(dir))throw Error('Missing .rms-soybean-rebuild. Run previous STEP1–5 first.');
  const files=fs.readdirSync(dir);
  const graded=files.filter(f=>/^step5-round1-graded-.*\.json$/.test(f)).sort().at(-1);
  const priorFallback=chooseStep4Snapshot(files);
  if(!priorFallback||!graded)throw Error('Missing STEP4 snapshot or STEP5 round1 graded JSON. No paid call.');
  const verification=JSON.parse(fs.readFileSync(path.join(dir,graded),'utf8')) as Graded & {inputSearchFile?:string};
  assertSnapshotCommodity(verification,commodity,'5-graded');
  let prior=priorFallback;
  if(verification.inputSearchFile){
    if(!/^step5-round1-search-[\w-]+\.json$/.test(verification.inputSearchFile))throw Error('Invalid STEP5 search file name');
    const search=JSON.parse(fs.readFileSync(path.join(dir,verification.inputSearchFile),'utf8')) as {commodity?:string;step4InputFile?:string};
    assertSnapshotCommodity(search,commodity,'5-search');
    if(!search.step4InputFile||!/^(?:step4-recovered|step4-analysis)-[\w-]+\.json$/.test(search.step4InputFile))throw Error('Invalid STEP4 input reference');
    prior=search.step4InputFile;
  }
  const step4=JSON.parse(fs.readFileSync(path.join(dir,prior),'utf8')) as Step4 & {status?:string};
  assertStep4SnapshotCommodity(step4,commodity,prior,dir);
  if(prior.startsWith('step4-analysis-')&&step4.status!=='review-generated')throw Error('STEP4 analysis incomplete. Recover it offline before paid decision.');
  const input=buildDecisionInput(step4,verification,day);
  return {dir,prior,graded,input,prompt:buildDecisionPrompt(input)};
}
