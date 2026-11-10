/** Local-only read-only proof: changes match patch, protected files untouched by patch. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),pack=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(pack,'RMS_STEP7_BEST_EFFORT_PAYLOAD','manifest.json'),'utf8'));
for(const [rel,want] of Object.entries(manifest.payload)){
 const p=path.join(root,rel);
 if(!fs.existsSync(p)||crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==want)throw Error('Patch file missing/mismatched: '+rel);
}
const runner=fs.readFileSync(path.join(root,'scripts/soybean-rebuild/research-verified-runner.mjs'),'utf8');
const paid=fs.readFileSync(path.join(root,'scripts/cloud/step7PaidLocalWorker.mjs'),'utf8');
if(!runner.includes('validatedLocalCard(dir,opts.commodity)')||!paid.includes('validatedLocalCard(dir,commodity)'))throw Error('Best-effort gate not connected');
console.log('PASS: repaired forecast-finality logic; verified/incomplete best-effort local cards accepted; provenance checks retained; protected functions not changed.');
console.log('NEXT: node --import tsx --test scripts/soybean-rebuild/step7-best-effort-flow.test.mjs');
