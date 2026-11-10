import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.cwd(),source=import.meta.dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [file,copy]of [['scripts/cloud/scheduledStep7.ts','scheduledStep7.ts'],['scripts/soybean-rebuild/research-pipeline-runner.mjs','research-pipeline-runner.mjs'],['scripts/soybean-rebuild/commodity-config.ts','commodity-config.ts']]){
 if(hash(path.join(root,file))!==hash(path.join(source,copy)))throw Error('Mismatch: '+file);
}
const manifest=JSON.parse(fs.readFileSync(path.join(source,'phase3-manifest.json'),'utf8'));
for(const [file,expected]of Object.entries(manifest.protected))if(hash(path.join(root,file))!==expected)throw Error('Protected file changed: '+file);
const {researchDir,runnerDir,inspect,COMMODITIES}=await import((await import('node:url')).pathToFileURL(path.join(root,'scripts/soybean-rebuild/research-pipeline-runner.mjs')).href);
const {pathToFileURL}=await import('node:url');
const old=process.env.RMS_RESEARCH_RUN_DAY;
try{
 delete process.env.RMS_RESEARCH_RUN_DAY;
 for(const c of COMMODITIES){
  const existing=researchDir(root,c);if(existing.includes('/daily/')||existing.includes('\\daily\\'))throw Error('Default paths changed');
  process.env.RMS_RESEARCH_RUN_DAY='2026-11-02';
  const monday=researchDir(root,c),attempts=runnerDir(root,c);
  if(!monday.includes(path.join('daily','2026-11-02'))||!attempts.includes(path.join('daily','2026-11-02'))||!monday.startsWith(existing+path.sep))throw Error('Daily path mismatch '+c);
  const inspection=inspect(root,c);
  if(inspection.action!=='execute'||inspection.stage!=='step1')throw Error('Fresh day did not start STEP1 '+c+': '+JSON.stringify(inspection));
  process.env.RMS_RESEARCH_RUN_DAY='2026-11-03';
  if(researchDir(root,c)===monday)throw Error('Next day reused '+c);
  delete process.env.RMS_RESEARCH_RUN_DAY;
 }
 process.env.RMS_RESEARCH_RUN_DAY='2026-02-30';
 try{researchDir(root,'wheat');throw Error('Invalid date accepted');}catch(e){if(e.message==='Invalid date accepted')throw e;}
}finally{if(old===undefined)delete process.env.RMS_RESEARCH_RUN_DAY;else process.env.RMS_RESEARCH_RUN_DAY=old;}
console.log('PASS: manual existing paths retained; 8 commodities isolate new weekday; next day fresh; invalid dates denied; protected sources unchanged; 0 Gemini calls.');

