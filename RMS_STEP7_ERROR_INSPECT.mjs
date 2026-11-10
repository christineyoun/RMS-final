/** Read-only STEP job status inspector. Never calls providers or changes markers. */
import fs from 'node:fs';
import path from 'node:path';
const argv=process.argv.slice(2);
const k=argv.indexOf('--commodity'),d=argv.indexOf('--day');
const commodity=k<0?null:argv[k+1],day=d<0?null:argv[d+1];
const names=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
if(!names.includes(commodity)||!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day){
 console.error('Usage: node RMS_STEP7_ERROR_INSPECT.mjs --commodity soybean-oil --day 2026-11-02');process.exit(2);
}
const root=process.cwd();
const research=path.join(root,'.rms-research',commodity,'daily',day);
const marks=path.join(root,'.rms-research-runner',commodity,'daily',day);
const ls=(p)=>fs.existsSync(p)?fs.readdirSync(p):[];
const existing=ls(research),paid=ls(marks).filter(x=>/^paid-(step1|step4|step5search|step5decision|step6search|step7)\.json$/.test(x));
const read=(p)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
const stages={step1:'step1-google-',step2:'step2-graded-',step3:'step3-evidence-',step4:'step4-analysis-',step5search:'step5-round1-search-',step5decision:'step5-round1-decision-',step7:'step7-final-',step71:'step7-fact-verified-',step72:'step7-rms-preview-'};
const stageFiles=Object.fromEntries(Object.entries(stages).map(([stage,prefix])=>[stage,existing.filter(f=>f.startsWith(prefix)&&f.endsWith('.json')).length]));
const attemptMarkers=paid.map(file=>{const v=read(path.join(marks,file))||{};return {stage:file.replace(/^paid-|\.json$/g,''),state:v.status||'unknown',recordedAt:v.createdAt||null};});
const stored=read(path.join(marks,'scheduled-worker-diagnostic.json'));
const review=existing.filter(f=>/^step7-fact-verified-.*\.json$/.test(f)).sort().at(-1);
console.log(JSON.stringify({commodity,day,stageFiles,paidAttemptMarkers:attemptMarkers,
  reviewStatus:review?(read(path.join(research,review))?.status||'unknown'):null,
  diagnostic:stored?{recordedAt:stored.recordedAt,stage:stored.stage,runnerExitCode:stored.runnerExitCode,failureCode:stored.failureCode,safeForAutomaticRetry:false}:null,
  historicalErrorKnown:!!stored,
  advice:stored?'Classified failure is recorded; reservation is still protected.':
   'Earlier raw error output was not saved; reserved-before-call does NOT prove success or billing. Do not delete the marker or rerun without reconciling.'
},null,2));
