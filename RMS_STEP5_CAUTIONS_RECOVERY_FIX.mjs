/** Only repairs STEP5 cautions presentation schema; no API calls, publication, or production edits. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const srcDir=path.dirname(fileURLToPath(import.meta.url));
const root=process.cwd();
const manifest=[
  {
    "file": "scripts/soybean-rebuild/step5-decision-core.ts",
    "payload": "payload/step5-decision-core.ts",
    "old": "bdb0072758350a3997657749b2c283306e8fba855fecd0f85465cd7865c80e80",
    "new": "6757941ef55a7cd2d0f3ec07cc107ceffd50303b636ab57d6606eb1c1fa5158b"
  },
  {
    "file": "scripts/soybean-rebuild/step5-decision-offline-recover.mjs",
    "payload": "payload/step5-decision-offline-recover.mjs",
    "old": "059edc9081c3ca8235785547a6d53c31f787f15d34f7078ddecacd04750cfcfb",
    "new": "929e95f6a5aa562ef3774cb4e20ebcca3bc59a89778911b179a83f4eabfae7a0"
  },
  {
    "file": "scripts/soybean-rebuild/step5-decision-offline-recover.test.mjs",
    "payload": "payload/step5-decision-offline-recover.test.mjs",
    "old": "6521b428a931206c1f2d6a41ba2e117d4f20aa35150a039ea605c78a0d925616",
    "new": "8609ebf5b09be18384fd4e2131156c4e75b6bd9b651d4649a19ec3825724902c"
  },
  {
    "file": "scripts/soybean-rebuild/step5-decision.test.ts",
    "payload": "payload/step5-decision.test.ts",
    "old": "77e372480d6e1dbf8622ee966f74e5bee8291f316e71a606e10542e8ae0461bd",
    "new": "e5823829433c6fd541f426456a213d6a2b2d1aaf4cf00e7be71126882d2cae6a"
  }
];
const checkOnly=process.argv.includes('--check-only');
const known=new Set(['--check-only']);
if(process.argv.slice(2).some(a=>!known.has(a)))throw Error('Use --check-only or no argument.');
if(!fs.existsSync(path.join(root,'package.json'))||!fs.existsSync(path.join(root,'scripts','soybean-rebuild','research-verified-runner.mjs')))
  throw Error('Run from RMS integrated project root (package.json and scripts/soybean-rebuild).');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[];
for(const m of manifest){
  const dest=path.resolve(root,m.file);
  const payload=path.resolve(srcDir,m.payload);
  if(!fs.existsSync(dest)||!fs.existsSync(payload))throw Error(`Missing file: ${m.file} or ${m.payload}`);
  const current=fs.readFileSync(dest),patch=fs.readFileSync(payload);
  if(hash(patch)!==m.new)throw Error(`Damaged patch payload: ${m.file}`);
  const currentHash=hash(current);
  if(currentHash!==m.old&&currentHash!==m.new)throw Error(`Compatibility mismatch: ${m.file}. Nothing changed.`);
  files.push({...m,dest,current,patch,state:currentHash===m.new?'already-patched':'compatible'});
}
for(const f of files)console.log('[STEP5 PATCH]',f.state,f.file);
const pending=files.filter(x=>x.state==='compatible');
if(checkOnly){console.log('[STEP5 PATCH] CHECK ONLY. Updates required:',pending.length);process.exit(0);}
if(!pending.length){console.log('[STEP5 PATCH] Already applied; no changes.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(root,'.rms-research-patches','backup','step5-cautions-'+stamp);
for(const f of pending){
  const target=path.join(backup,f.file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,f.current,{flag:'wx'});
}
for(const f of pending)fs.writeFileSync(f.dest,f.patch);
console.log('[STEP5 PATCH] Applied:',pending.length,'files. Backups:',backup);
console.log('[STEP5 PATCH] No API calls. Original .rms-research data untouched.');
console.log('[STEP5 PATCH] Next: node scripts/soybean-rebuild/step5-decision-offline-recover.mjs --commodity wheat --inspect');
