/**
 * RMS_final_main: soybean-oil STEP 5 decision, 2026-11-02, second recovery attempt.
 *
 * The first recovery attempt was reserved but exited BEFORE the Gemini call because
 * it passed a positional commodity argument. The source expects --commodity.
 *
 * --check-only: read-only preflight. Never makes an API call or writes files.
 * --retry-once --approve-paid: one potentially billable attempt, separately
 * reserved as retry2. Original and retry1 markers are NEVER changed/deleted.
 * Do not repeat --retry-once after either success or failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const commodity='soybean-oil';
const day='2026-11-02';
const research=path.join(root,'.rms-research',commodity,'daily',day);
const markerDir=path.join(root,'.rms-research-runner',commodity,'daily',day);
const decisionScript=path.join(root,'scripts','soybean-rebuild','step5-decision-run.ts');
const original=path.join(markerDir,'paid-step5decision.json');
const retry1=path.join(markerDir,'paid-step5decision-retry1.json');
const diagnostic1=path.join(markerDir,'step5decision-retry1-diagnostic.json');
const retry2=path.join(markerDir,'paid-step5decision-retry2.json');
const diagnostic2=path.join(markerDir,'step5decision-retry2-diagnostic.json');
const args=process.argv.slice(2);
const check=args.length===0||(args.length===1&&args[0]==='--check-only');
const retry=args.length===2&&args.includes('--retry-once')&&args.includes('--approve-paid');
const log=s=>console.log('[STEP5 DECISION RECOVERY V2] '+s);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const requireFile=file=>{if(!fs.existsSync(file))throw Error('Missing: '+path.relative(root,file));};
const names=regex=>fs.readdirSync(research).filter(n=>regex.test(n)).sort();
function preflight(){
  requireFile(path.join(root,'package.json'));
  requireFile(decisionScript);
  requireFile(original);requireFile(retry1);requireFile(diagnostic1);
  if(!fs.existsSync(path.join(root,'node_modules','tsx')))
    throw Error('tsx dependency unavailable. Install project dependencies first.');
  const old=read(original), prior=read(retry1), report=read(diagnostic1);
  if(old.stage!=='step5decision'||old.commodity!==commodity||old.status!=='reserved-before-call')
    throw Error('Original reservation differs from expected. Stop and inspect.');
  if(prior.stage!=='step5decision'||prior.commodity!==commodity||prior.status!=='reserved-before-call')
    throw Error('Retry1 reservation differs from expected. Stop and inspect.');
  // The user supplied the stack trace showing retry1 failed inside loadDecisionContext,
  // before the model request. This diagnostic must agree with that recorded failure.
  if(report.stage!=='step5decision'||report.commodity!==commodity||report.exitCode!==1||
     !Array.isArray(report.decisionFiles)||report.decisionFiles.length!==0)
    throw Error('Retry1 diagnostic is not the expected pre-call failure. Stop and inspect.');
  if(fs.existsSync(retry2)||fs.existsSync(diagnostic2))
    throw Error('Retry2 reservation/diagnostic already exists. Never repeat a paid attempt.');
  const step4=names(/^step4-analysis-.*\.json$/);
  const step5=names(/^step5-round1-graded-.*\.json$/);
  const output=names(/^step5-round1-decision-.*\.json$/);
  if(!step4.length||!step5.length||output.length)
    throw Error('STEP4/STEP5 input missing or decision already saved; do not retry.');
  const grade=read(path.join(research,step5.at(-1)));
  if(grade.commodity!==commodity||grade.stage!=='additional-google-original-verification-round1'||
     grade.round!==1||!Array.isArray(grade.review))
    throw Error('Graded research does not match the soybean-oil STEP5 checkpoint.');
  if(!fs.existsSync(path.join(root,'.env')) && !process.env.GEMINI_API_KEY)
    throw Error('No .env or environment-provided API key detected.');
  log('Original reservation: preserved. Retry1 reservation and failed diagnostic: verified.');
  log('STEP4: '+step4.at(-1));
  log('STEP5 graded: '+step5.at(-1));
  log('No saved decision exists. Correct invocation: --commodity soybean-oil.');
  log('Research day: 2026-11-02 (KST).');
}
if(!check&&!retry){
  console.error('Usage: node RMS_STEP5_DECISION_RECOVERY_V2.mjs --check-only');
  console.error('Paid (only if explicitly approved): --retry-once --approve-paid');
  process.exitCode=2;
}else{
  try{
    preflight();
    if(check){
      log('CHECK ONLY: no files modified; no Gemini API calls.');
    }else{
      // Write-once marker BEFORE any call. This is an intentionally new retry2 record.
      fs.writeFileSync(retry2,JSON.stringify({
        stage:'step5decision',commodity,day,status:'reserved-before-call',
        createdAt:new Date().toISOString(),priorReservations:[path.basename(original),path.basename(retry1)],
        purpose:'explicit one-time retry after retry1 failed before the model call',
        note:'Do not delete or repeat; a failed request may still be billed.'
      },null,2),{flag:'wx',mode:0o600});
      log('One-time potentially paid attempt reserved as retry2. Starting existing decision script.');
      const start=Date.now();
      // IMPORTANT: use --commodity, not a bare positional argument.
      const child=spawnSync(process.execPath,
        ['--import','tsx',decisionScript,'--commodity',commodity],
        {cwd:root,env:{...process.env,RMS_RESEARCH_RUN_DAY:day},stdio:'inherit',shell:false});
      const outputs=names(/^step5-round1-decision-.*\.json$/);
      const result={stage:'step5decision',commodity,day,finishedAt:new Date().toISOString(),
        exitCode:child.status,signal:child.signal??null,
        spawnError:child.error?{name:child.error.name,code:child.error.code??null,message:child.error.message}:null,
        elapsedSeconds:Math.round((Date.now()-start)/1000),decisionFiles:outputs,
        originalMarkerPreserved:fs.existsSync(original),retry1MarkerPreserved:fs.existsSync(retry1),
        noAutomaticPaidRetry:true};
      fs.writeFileSync(diagnostic2,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
      log('Diagnostic: '+path.relative(root,diagnostic2));
      log('Decision files: '+(outputs.join(', ')||'NONE'));
      if(child.error||child.status!==0||outputs.length!==1){
        console.error('[STEP5 DECISION RECOVERY V2] STOP: Do not run this paid command again.');
        process.exitCode=2;
      }else{
        const resultFile=read(path.join(research,outputs[0]));
        log('Saved decision status: '+String(resultFile.status));
        log('Decision: '+String(resultFile.decision?.decision??'unknown'));
        log('Next: use the normal research pipeline --preview; do not repeat this script.');
        if(resultFile.status!=='decision-recorded')process.exitCode=2;
      }
    }
  }catch(e){
    console.error('[STEP5 DECISION RECOVERY V2] REFUSED: '+(e instanceof Error?e.message:String(e)));
    process.exitCode=2;
  }
}
