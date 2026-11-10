/** RMS STEP1-7 local integration: four targeted TypeScript lint fixes.
 * No Gemini requests, publication, Cloud Run, GitHub, or env changes.
 * Run at project root: node .\RMS_LINT_4_ERRORS_FIX.mjs [--check-only]
 */
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dryRun=process.argv.includes('--check-only');
const streamReader=(bodyName)=>`  const chunks:Buffer[]=[];let total=0;\n  const reader=${bodyName}.getReader();\n  try {\n    while(true){\n      const {done,value}=await reader.read();\n      if(done)break;\n      const chunk=Buffer.from(value);total+=chunk.length;\n      if(total>MAX_DOCUMENT_BYTES){\n        await reader.cancel().catch(()=>{});\n        throw Error('publisher-body-too-large');\n      }\n      chunks.push(chunk);\n    }\n  } finally {\n    reader.releaseLock();\n  }`;
const edits=[
  {
    file:'scripts/soybean-rebuild/step2-verify.ts',
    from:`  const chunks:Buffer[]=[];let total=0;\n  for await(const part of response.body){\n    const b=Buffer.from(part);total+=b.length;\n    if(total>MAX_DOCUMENT_BYTES){await response.body.cancel().catch(()=>{});throw Error('publisher-body-too-large');}\n    chunks.push(b);\n  }`,
    to:streamReader('response.body')
  },
  {
    file:'scripts/soybean-rebuild/step5-originals.ts',
    from:`  const chunks:Buffer[]=[];let total=0;\n  for await (const part of res.body){\n    const buf=Buffer.from(part);total+=buf.length;\n    if(total>MAX_DOCUMENT_BYTES){await res.body.cancel().catch(()=>{});throw Error('publisher-body-too-large');}\n    chunks.push(buf);\n  }`,
    to:streamReader('res.body')
  },
  {
    file:'scripts/soybean-rebuild/step3-evidence.ts',
    from:`  relevance?: 'strong'|'related'|'none';\n};`,
    to:`  relevance?: 'strong'|'related'|'none';\n  notes?: string; // present in the STEP2 publisher grade record; optional for older fixtures\n};`
  },
  {
    file:'src/server/__tests__/newsFreshnessRepair.test.ts',
    from:` const plan=scheduledPhasePlan('2026-10-27');assert.equal(new Set(plan.slice(0,8).map(p=>p.id)).size,8);assert(plan.slice(0,8).every(p=>p.kind==='news'));assert(plan.slice(8).every(p=>p.kind==='analysis'));assert.notEqual(plan[0].id,scheduledPhasePlan('2026-10-28')[0].id);`,
    to:` const plan=scheduledPhasePlan('2026-10-27');\n assert.equal(plan.length,8,'all eight Market Intelligence news phases remain scheduled');\n assert.equal(new Set(plan.map(p=>p.id)).size,8,'no repeated news phase');\n assert(plan.every(p=>p.kind==='news'),'legacy scheduled Gemini analysis must not run');\n assert.notEqual(plan[0].id,scheduledPhasePlan('2026-10-28')[0].id,'daily phase rotation remains');`
  }
];

const changes=[];const skipped=[];
for(const e of edits){
  const filename=path.resolve(root,e.file);
  if(!filename.startsWith(root+path.sep))throw Error('Unsafe path: '+e.file);
  if(!fs.existsSync(filename))throw Error('File not found; run this script in the actual RMS project folder: '+e.file);
  const raw=fs.readFileSync(filename,'utf8');
  const newline=raw.includes('\r\n')?'\r\n':'\n';
  const normalized=raw.replace(/\r\n/g,'\n');
  if(normalized.includes(e.to)){
    skipped.push(e.file+' (already fixed)');continue;
  }
  if(normalized.split(e.from).length!==2)throw Error('Incompatible source: '+e.file+'; no files modified.');
  changes.push({file:e.file,filename,original:raw,updated:normalized.replace(e.from,e.to).replace(/\n/g,newline)});
}
console.log(`[RMS LINT PATCH] Compatible. Pending: ${changes.length}; already fixed: ${skipped.length}`);
for(const item of [...changes.map(x=>x.file),...skipped])console.log(' - '+item);
if(dryRun){console.log('[RMS LINT PATCH] CHECK ONLY - no changes.');process.exit(0);}
if(!changes.length){console.log('[RMS LINT PATCH] Nothing to do.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.resolve(root,'.rms-research-patches','backup','lint-fix-'+stamp);
for(const e of changes){
  const target=path.join(backup,e.file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,e.original);
}
try{
  for(const e of changes)fs.writeFileSync(e.filename,e.updated);
  console.log(`[RMS LINT PATCH] Updated ${changes.length} files. Backup: ${backup}`);
  console.log('[RMS LINT PATCH] No Gemini calls. No production writes.');
  console.log('NEXT: npm.cmd run lint');
}catch(e){
  for(const item of changes)fs.writeFileSync(item.filename,item.original);
  console.error('[RMS LINT PATCH] Changes restored after error.');
  throw e;
}
