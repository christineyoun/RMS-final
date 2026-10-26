import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {capturePublicBundle,sha256,gcsRead,gcsWrite,readCloudPointer,type PublicBundle,type PublicationPointer,withCloudPublicationLease} from '../../src/server/cloudPublication.ts';
const roots=['.rms-stage3','.rms-price-history','.rms-origin-verified','src/data'];
const safePath=(p:string)=>!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').includes('..')&&(roots.some(r=>p.startsWith(r+'/'))||p.startsWith('.rms-research/'))&&/\.(json|jsonl|html|pdf|txt)$/.test(p)&&!/(?:admin-token|credential|secret|\.env|\.lock)/i.test(p);
export async function archiveState(root:string){
 const files:Record<string,string>={};
 async function walk(relative:string){let entries;try{entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}for(const entry of entries){const p=relative+'/'+entry.name;if(entry.isDirectory())await walk(p);else if(entry.isFile()&&safePath(p))files[p]=(await fs.readFile(path.join(root,p))).toString('base64');}}
 for(const r of roots)await walk(r);
 // Retain only receipt files explicitly referenced by saved records, never the
 // research directory, screenshots, reports, credentials or backup trees.
 const pending=Object.keys(files);const dependencies=new Set<string>();
 const visit=(v:any)=>{if(typeof v==='string'&&v.startsWith('.rms-research/')&&safePath(v))dependencies.add(v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);};
 for(let i=0;i<pending.length;i++){const p=pending[i];if(!p.endsWith('.json'))continue;try{visit(JSON.parse(Buffer.from(files[p],'base64').toString()));}catch{}for(const dep of dependencies){if(files[dep])continue;try{files[dep]=(await fs.readFile(path.join(root,dep))).toString('base64');pending.push(dep);}catch{}}}
 for(const p of ['.rms-research/potato-exact-parity-2026-10-23/fx-received.json','.rms-research/potato-exact-parity-2026-10-23/visual-parity.json']){try{files[p]=(await fs.readFile(path.join(root,p))).toString('base64');}catch{}}

 // No credentials, shell environment, admin token, local locks or source code.
 return gzipSync(JSON.stringify({version:1,files}));
}
export async function restoreState(bytes:Uint8Array,root:string){
 const state=JSON.parse(gunzipSync(bytes).toString());if(state.version!==1)throw Error('Unsupported saved state');
 for(const [p,body]of Object.entries(state.files)){if(!safePath(p)||typeof body!=='string')throw Error('Unsafe saved-state entry');const file=path.join(root,p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,Buffer.from(body,'base64'));}
}
export async function publish(bundle:PublicBundle,state:Uint8Array,previousGeneration:string){
 const {validatePublicBundle}=await import('../../src/server/cloudPublication.ts');validatePublicBundle(bundle);
 const archived=JSON.parse(gunzipSync(state).toString());
 if(archived.version!==1||!archived.files||Object.entries(archived.files).some(([p,b])=>!safePath(p)||typeof b!=='string'))throw Error('Invalid private saved state');
 const identity=JSON.parse(Buffer.from(archived.files['.rms-stage3/free-daily-publication.json']||'','base64').toString());
 if(identity.revision!==bundle.revision||identity.publishedAt!==bundle.publishedAt)throw Error('Public bundle and private state publication mismatch');
 const bucket=process.env.RMS_PUBLICATION_BUCKET,stateBucket=process.env.RMS_STATE_BUCKET;if(!bucket||!stateBucket)throw Error('Both publication and private state buckets are required');
 const bytes=Buffer.from(JSON.stringify(bundle)),hash=sha256(bytes),stateHash=sha256(state),key='public/'+hash+'.json',stateKey='state/'+stateHash+'.json.gz';
 // Content-addressed objects are immutable. Only the final pointer is promoted.
 for(const [b,k,v]of [[bucket,key,bytes],[stateBucket,stateKey,state]] as const){try{await gcsWrite(b,k,v);}catch(e){const existing=await gcsRead(b,k);if(sha256(existing.bytes)!==sha256(v))throw e;}}
 const pointer:PublicationPointer={version:1,bundle:{key,sha256:hash},state:{key:stateKey,sha256:stateHash},revision:bundle.revision,publishedAt:bundle.publishedAt};
 await gcsWrite(bucket,'current.json',Buffer.from(JSON.stringify(pointer)),previousGeneration);
 console.log('Promoted saved publication',bundle.revision,bundle.publishedAt);
}
async function privateServer(workspace:string,action:(base:string)=>Promise<void>){
 const appRoot=path.resolve(import.meta.dirname,'../..'),port=Number(process.env.RMS_CAPTURE_PORT)||18081;
 const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'production',PORT:String(port),RMS_APP_ROOT:appRoot,RMS_PUBLIC_READONLY:'0',RMS_DISABLE_SCHEDULERS:'1'};
 delete env.GEMINI_API_KEY;delete env.GOOGLE_API_KEY;
 const child=spawn(process.execPath,['--import',path.join(appRoot,'node_modules/tsx/dist/loader.mjs'),path.join(appRoot,'server.ts')],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',v=>{log+=v;});child.stderr.on('data',v=>{log+=v;});
 try{let ready=false;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(log.includes('Server running on port')){ready=true;break;}if(child.exitCode!==null)break;}if(!ready)throw Error('Private saved-reader server did not start: '+log.slice(-1000));await action('http://127.0.0.1:'+port);}finally{if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped;}}
}
export async function main([command,destination]=process.argv.slice(2)){
if(command==='prepare'){
 if(!destination)throw Error('Usage: publication.ts prepare OUTPUT_DIRECTORY');
 const output=path.resolve(destination);
 const originalPublication=await fs.readFile('.rms-stage3/free-daily-publication.json','utf8');
 try{await fs.access('.rms-stage3/free-source-refresh.lock');throw Error('A local free refresh is running; prepare the seed after it finishes');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const state=await archiveState(process.cwd());
 if(await fs.readFile('.rms-stage3/free-daily-publication.json','utf8')!==originalPublication)throw Error('Saved publication changed during state capture');
 try{await fs.access('.rms-stage3/free-source-refresh.lock');throw Error('A local refresh started during seed capture; retry after it finishes');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'rms-cloud-prepare-'));await restoreState(state,workspace);
 await privateServer(workspace,async reader=>{const bundle=await capturePublicBundle(reader);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'public.json'),JSON.stringify(bundle));await fs.writeFile(path.join(output,'state.json.gz'),state);console.log('Prepared existing saved publication:',bundle.revision);});
}else if(command==='seed'){
 if(!destination)throw Error('Usage: publication.ts seed PREPARED_DIRECTORY');
 const bundle=JSON.parse(await fs.readFile(path.join(destination,'public.json'),'utf8'));const {validatePublicBundle}=await import('../../src/server/cloudPublication.ts');validatePublicBundle(bundle);
 // First seed must not replace an existing publication silently.
 await publish(bundle,await fs.readFile(path.join(destination,'state.json.gz')),'0');
}else if(command==='check-state'){
 if(!destination)throw Error('Usage: publication.ts check-state PREPARED_DIRECTORY');
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'rms-cloud-state-'));await restoreState(await fs.readFile(path.join(destination,'state.json.gz')),workspace);
 await privateServer(workspace,async base=>{const bundle=await capturePublicBundle(base);console.log('Restored saved-state API check passed:',bundle.revision);});
}else if(command==='refresh'){
 if(!process.env.CLOUD_RUN_JOB||process.env.RMS_CLOUD_FREE_JOB!=='1')throw Error('Free job requires the private Cloud Run job environment');
 if(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)throw Error('Paid AI credentials prohibited in the free job');
 await withCloudPublicationLease(async()=>{
 const {pointer,generation}=await readCloudPointer(),state=await gcsRead(process.env.RMS_STATE_BUCKET!,pointer.state.key);if(sha256(state.bytes)!==pointer.state.sha256)throw Error('Private state integrity mismatch');
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'rms-cloud-refresh-'));await restoreState(state.bytes,workspace);process.chdir(workspace);
 const cfg=JSON.parse(await fs.readFile('.rms-stage3/settings.json','utf8'));if(cfg.autoEnabled!==false||cfg.freeAutoEnabled!==true)throw Error('Saved free/paid scheduling settings not approved');
 const {createFreeSourceRunner}=await import('../../src/server/freeSourceRefresh.ts');
 // Existing shared runner owns source cadence, same-day checks and calculations.
 const run=await createFreeSourceRunner().check();if(!run){console.log('No due weekday refresh; nothing published');return;}if(run.publicationError)throw Error('Saved publishing failed; cloud pointer retained');
 await privateServer(workspace,async base=>{const bundle=await capturePublicBundle(base);await publish(bundle,await archiveState(workspace),generation||'0');});
 });
}else throw Error('Commands: prepare, check-state, seed, refresh');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
