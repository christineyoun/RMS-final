/** One-file consistency fix after legacy RMS AI cleanup. No APIs/network/Cloud Run. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'scripts', 'soybean-rebuild', 'step7-rms-preview.test.ts');
const removedHelper = path.join(root, 'scripts', 'soybean-rebuild', 'step7-enable-rms-preview.ts');
const mustExist = [
  'package.json',
  'scripts/soybean-rebuild/step7-rms-adapter.ts',
  'scripts/soybean-rebuild/step7-core.ts',
  'scripts/soybean-rebuild/step7-rms-preview.test.ts',
  'src/server/step7LocalPreview.ts',
];
const dry = process.argv.includes('--check-only');
for (const name of mustExist) {
  if (!fs.existsSync(path.join(root, name))) throw Error('Not RMS STEP7 integration root (missing ' + name + ')');
}
if (fs.existsSync(removedHelper)) throw Error('Old integration installer still exists; this fix targets the post-cleanup project only');
const oldText = fs.readFileSync(target, 'utf8');
const oldImport = "import {patchGeminiApi} from './step7-enable-rms-preview.ts';";
const start = "test('surgical API installer is idempotent and refuses unknown source code',()=>{";
const count = (text, needle) => text.split(needle).length - 1;
const already = !oldText.includes(oldImport) && !oldText.includes(start);
if (already) {
  console.log('[CLEANUP LINT FIX] Already applied. STEP7 adapter and preview tests retained.');
  process.exit(0);
}
if (count(oldText,oldImport)!==1 || count(oldText,start)!==1) throw Error('Unexpected test content; no changes made');
const startAt=oldText.indexOf(start);
const tail=oldText.slice(startAt);
const expectedEnding=/^test\('surgical API installer is idempotent and refuses unknown source code',\(\)=>\{\r?\n[\s\S]*?\r?\n\}\);\s*$/;
if (!expectedEnding.test(tail)) throw Error('Old installer test not at end or changed; no changes made');
if (!tail.includes('patchGeminiApi(original)') || !tail.includes('patchGeminiApi(patch)') || !tail.includes('patchGeminiApi(\'new changed version\')')) throw Error('Unexpected old installer test body');
let revised=oldText.replace(oldImport+'\r\n','').replace(oldImport+'\n','');
const newStartAt=revised.indexOf(start);
revised=revised.slice(0,newStartAt).trimEnd()+'\n';
if (revised.includes('patchGeminiApi') || revised.includes('step7-enable-rms-preview')) throw Error('Old helper still referenced after patch; no changes made');
for (const essential of ["adaptStep7ToRms", "readStep7LocalPreview", "only loopback, explicit opt-in", "source IDs cannot be invented"])
  if (!revised.includes(essential)) throw Error('Safety check failed, expected STEP7 test missing: '+essential);
console.log('[CLEANUP LINT FIX] Compatible:', path.relative(root,target));
console.log('[CLEANUP LINT FIX] Remove only old integration-installer import and its obsolete test.');
console.log('[CLEANUP LINT FIX] Keep STEP7 adapter/source/preview safety tests and all application code.');
if(dry){console.log('[CLEANUP LINT FIX] CHECK ONLY. No changes.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(root,'.rms-research-patches','backup','cleanup-lint-consistency-'+stamp);
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'step7-rms-preview.test.ts'),oldText,{flag:'wx'});
const tmp=target+'.cleanup-lint.tmp';
try {fs.writeFileSync(tmp,revised,{flag:'wx'});fs.renameSync(tmp,target);}
catch(err){try{fs.rmSync(tmp,{force:true});}catch{}throw err;}
console.log('[CLEANUP LINT FIX] Fixed one test file. Backup:',backup);
console.log('[CLEANUP LINT FIX] No Gemini calls, no .rms-research changes, no production changes.');
console.log('[CLEANUP LINT FIX] Next: npm.cmd run lint ; npm.cmd run build ; node .\\scripts\\step7-integration\\integration-check.mjs');
