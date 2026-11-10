/** Add-only, hash-guarded installer. No existing STEP1-7 source file is modified. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=process.cwd(),base=path.dirname(fileURLToPath(import.meta.url));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const prerequisite={
 'scripts/soybean-rebuild/step7-core.ts':['6d9cf794d69a7d97d993f6ec755ec16dc657d3ea0aa78bc49afed9920663df01'],
 'scripts/soybean-rebuild/step7-rms-adapter.ts':['f9c696d4e46a714197d243504377785a0482f4a97caf34062e49424e4713f38d','7556659071410e95c32a5e0a50dc74c971bff8a35d537120d98fd076ffa76a04'],
 'scripts/soybean-rebuild/research-pipeline-runner.mjs':['0cca95655846759e40f9db9eef187f5a8f7a568b300b9bd6df2fdf020f856b71'],
};
const names=['step7-fact-core.ts','step7-fact-review.ts','step7-fact-to-rms.ts','research-verified-runner.mjs','step7-fact-review.test.mjs'];
const staged=path.join(root,'.rms-step7-fact-patch');
const manifest=JSON.parse(fs.readFileSync(path.join(staged,'manifest.json'),'utf8'));
for(const [name,allow] of Object.entries(prerequisite)){
 const target=path.join(root,name);
 if(!fs.existsSync(target)||!allow.includes(hash(target)))throw Error(`Unexpected installed code: ${name}. No changes made; send check-only output.`);
}
for(const name of names){const target=path.join(root,'scripts','soybean-rebuild',name),expected=manifest[name];
 if(hash(path.join(staged,'files',name))!==expected)throw Error(`Bundled file altered: ${name}; refusing installation.`);
 if(fs.existsSync(target)&&hash(target)!==expected)throw Error(`Target file modified or conflicting: ${name}; refusing overwrite.`);
}
const needed=names.filter(n=>!fs.existsSync(path.join(root,'scripts','soybean-rebuild',n)));
console.log('[STEP7 FACT PATCH] Compatible. New files:',needed.length,'/ existing source changes: ZERO');
console.log('[STEP7 FACT PATCH] Prior STEP7-2/7-3 patch excluded. Cloud Run/publication untouched.');
if(process.argv.includes('--check-only')){console.log('[STEP7 FACT PATCH] CHECK ONLY: no writes.');process.exit(0);}
if(process.env.NODE_ENV==='production'||process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)throw Error('Local-only installation');
for(const name of needed){const source=path.join(staged,'files',name),target=path.join(root,'scripts','soybean-rebuild',name);
 if(hash(source)!==manifest[name])throw Error(`Bundled file changed: ${name}`);
 fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
}
console.log('[STEP7 FACT PATCH] Installed new files:',needed.join(', ')||'already installed');
console.log('[STEP7 FACT PATCH] No research JSON, no STEP7 core, no cloud or RMS state changed.');
