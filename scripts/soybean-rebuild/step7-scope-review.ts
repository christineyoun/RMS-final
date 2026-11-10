/** Offline review of saved STEP7 report's purchase object; does not edit any file. */
import fs from 'node:fs';
import path from 'node:path';
import {parseFinalResult} from './step7-core.ts';
import {checkProcurementScope} from './step7-scope.ts';

const dir=path.join(process.cwd(),'.rms-soybean-rebuild');
const latest=fs.readdirSync(dir).filter(x=>/^step7-final-[\w.-]+\.json$/.test(x)).sort().at(-1);
const file=process.argv.find(x=>x.startsWith('--file='))?.slice('--file='.length)||latest;
if(!file||!/^step7-final-[\w.-]+\.json$/.test(file))throw Error('No valid STEP7 JSON found in local research folder.');
const stored=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const result=stored.result||parseFinalResult(stored.rawText||'');
if(!result)throw Error('Saved JSON has no parseable final report.');
const flags=checkProcurementScope(result.procurementStrategy,stored.commodity||'');
console.log('[STEP7 SCOPE REVIEW] OFFLINE / Gemini API: 0 / Files changed: 0');
console.log('[STEP7 SCOPE REVIEW] File:',file);
console.log('[STEP7 SCOPE REVIEW] Commodity:',stored.commodity);
console.log('[STEP7 SCOPE REVIEW] Out-of-scope procurement:',flags.length?'REVIEW-NEEDED':'No suspicious explicit action detected');
for(const f of flags){
 console.log(' - Related item:',f.matchedTerm,'(',f.relatedCommodity,') / action:',f.action);
 console.log('   Sentence:',f.fragment);
}
console.log('[STEP7 SCOPE REVIEW] This heuristic is not a substitute for human review.');
