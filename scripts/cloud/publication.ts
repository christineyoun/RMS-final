import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawn,type ChildProcess} from 'node:child_process';
import {PrivateReaderStartupError,waitForPrivateReaderReady,stopPrivateReader} from './privateReaderLifecycle.ts';
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
export async function privateServer(workspace:string,action:(base:string)=>Promise<void>,options:{spawnReader?:(env:NodeJS.ProcessEnv)=>ChildProcess;timeoutMs?:number;probe?:(port:number,signal:AbortSignal)=>Promise<boolean>;shutdownGraceMs?:number}={}){
 const appRoot=path.resolve(import.meta.dirname,'../..'),port=Number(process.env.RMS_CAPTURE_PORT??18081);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid private saved-reader port');
 const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'production',PORT:String(port),RMS_APP_ROOT:appRoot,RMS_PUBLIC_READONLY:'0',RMS_DISABLE_SCHEDULERS:'1'};
 delete env.GEMINI_API_KEY;delete env.GOOGLE_API_KEY;delete env.RMS_GEMINI_API_KEY_FILE;
 let child:ChildProcess;
 try{child=options.spawnReader?options.spawnReader(env):spawn(process.execPath,['--import',path.join(appRoot,'node_modules/tsx/dist/loader.mjs'),path.join(appRoot,'server.ts')],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});}
 catch{throw new PrivateReaderStartupError('spawn-error',0,null,null,'unclassified');}
 let output='',ready=false,spawnFailure:unknown=null;
 const append=(value:Buffer)=>{output=(output+String(value)).slice(-4096);if(new RegExp(`Server running on port ${port}(?:\\r?\\n|$)`).test(output))ready=true;};
 child.stdout?.on('data',append);child.stderr?.on('data',append);
 child.on('error',e=>{spawnFailure=e;});
 try{
  await waitForPrivateReaderReady(child,()=>ready,()=>spawnFailure,port,{timeoutMs:options.timeoutMs,probe:options.probe,output:()=>output});
  await action('http://127.0.0.1:'+port);
 }finally{await stopPrivateReader(child,options.shutdownGraceMs);}
}
/** The same saved-only news readers used by the dashboard, without starting a
 * server or invoking collectors. One broken reader cannot suppress other crops. */
export async function savedPriorNews(workspace=process.cwd(),options:{readApproved?:(id:string,workspace:string)=>any[];readVerified?:(id:string)=>any[];select?:(id:string,articles:any[])=>any[]}={}):Promise<Record<string,any[]>>{
 if(await fs.realpath(workspace)!==await fs.realpath(process.cwd()))throw Error('Saved prior-news workspace must be the restored current directory');
 const [{COMMODITY_IDS},{readScheduledContent},{savedVerifiedCommodityNews},{selectProcurementNews}]=await Promise.all([
  import('../../src/services/commodityQuoteSource.ts'),import('../../src/server/scheduledContent.ts'),import('../../src/server/stage3DailyUpdates.ts'),import('../../src/server/newsProcurementSelection.ts')
 ]);
 const warn=(id:string,reader:string)=>{try{console.warn('Saved prior-news unavailable',JSON.stringify({commodity:id,reader}));}catch{}};
 return Object.fromEntries(COMMODITY_IDS.map(id=>{
  let approved:any[]=[],verified:any[]=[];
  try{approved=options.readApproved?options.readApproved(id,workspace):readScheduledContent('news-'+id,workspace)?.payload?.articles||[];}catch{warn(id,'approved');}
  try{verified=(options.readVerified||savedVerifiedCommodityNews)(id);}catch{warn(id,'verified');}
  try{return [id,(options.select||selectProcurementNews)(id,[...approved,...verified])];}catch{warn(id,'selection');return [id,approved];}
 }));
}
const safeFailureCode=(error:unknown)=>{
 try{
 if(error instanceof PrivateReaderStartupError)return error.code;
 if(error instanceof SyntaxError)return 'invalid-saved-json';
 // Inspect only an own string value, never invoke an arbitrary getter/toString.
 const message=error instanceof Error?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 if(typeof message==='string'){
  if(/^Publication changed during capture/.test(message))return 'publication-revision-race';
  if(/^(?:Saved publication identity|Public bundle and private state publication mismatch|Required saved response missing|Saved benchmark missing|Unreviewed or invalid saved response)/.test(message))return 'saved-publication-validation';
  if(/^Cloud publication (?:read|write) failed/.test(message))return 'cloud-storage-operation';
  if(/^Private state integrity mismatch/.test(message))return 'private-state-integrity';
 }
 }catch{/* Diagnostic inspection must never block free publication. */}
 return 'unexpected-error';
};
/** Keep source collection and paid generation outcomes independent. Dependencies
 * are injectable for offline integration checks against the real workflow. */
export async function runRefreshWorkflow(paidPolicy:import('../../src/server/scheduledAi.ts').ScheduledAiPolicy|null,store?:import('../../src/server/scheduledAi.ts').ScheduledJournalStore,options:{
 runner?:Pick<ReturnType<typeof import('../../src/server/freeSourceRefresh.ts').createFreeSourceRunner>,'check'|'retryFailed'>;
 now?:()=>Date;priorNews?:Record<string,any[]>;loadPriorNews?:(workspace:string)=>Promise<Record<string,any[]>>;runAi?:typeof import('../../src/server/scheduledAi.ts').runScheduledAi;publishOverview?:typeof import('../../src/server/freeDailyJobs.ts').publishDailyOverview;
}={}){
 const {recordPaidRequestEvent}=await import('../../src/server/paidRequestTransport.ts');
 // Workflow telemetry is best effort; storage/console failures must not block publication.
 const recordEvent=(event:Record<string,unknown>)=>{try{recordPaidRequestEvent(event);}catch{}};
 const {freeRefreshDay,createFreeSourceRunner}=await import('../../src/server/freeSourceRefresh.ts');
 const now=options.now||(()=>new Date()),t=freeRefreshDay(now());
 if(!t.weekday||t.hour<9){console.log('Outside weekday publication window');return;}
 const cfg=JSON.parse(await fs.readFile('.rms-stage3/settings.json','utf8'));if(cfg.autoEnabled!==false||cfg.freeAutoEnabled!==true)throw Error('Saved free/paid scheduling settings not approved');
 const runner=options.runner||createFreeSourceRunner();let run:any,sourceError=false,aiError=false,aiResult;
 try{
  run=await runner.check();
  run=run||JSON.parse(await fs.readFile('.rms-stage3/free-source-refresh.json','utf8'));
  if(run.day!==t.day)throw Error('Current weekday source run unavailable');
  if(run.status==='partial')run=await runner.retryFailed()||run;
  sourceError=run.status==='partial'||!!run.publicationError;
 }catch{
  sourceError=true;
  // Retained readers still provide valid inputs when source collection fails.
  run={id:'weekday-retained-'+now().toISOString(),day:t.day,status:'partial',finishedAt:now().toISOString()};
 }
 if(sourceError)recordEvent({phase:'free-refresh-failed',reason:'source-or-publication-failed',day:t.day});
 if(paidPolicy){
  let aiStage:'prior-news-capture'|'scheduled-ai'='prior-news-capture';
  try{
   let priorNews=options.priorNews;
   if(!priorNews){
    try{priorNews=await(options.loadPriorNews||savedPriorNews)(process.cwd());}
    catch(error){priorNews={};recordEvent({phase:'prior-news-unavailable',day:t.day,reason:safeFailureCode(error)});
     try{console.warn('Previous saved news unavailable; independent AI and free publication continue');}catch{}
    }
   }
   aiStage='scheduled-ai';
   const runAi=options.runAi||(await import('../../src/server/scheduledAi.ts')).runScheduledAi;
   aiResult=await runAi(paidPolicy,store!,{priorNews});
   try{console.log('Scheduled AI result:',JSON.stringify({attempts:aiResult.attempts,accepted:aiResult.accepted,estimatedUsd:aiResult.estimatedUsd,estimatedKrw:aiResult.estimatedKrw,fx:aiResult.budget}));}catch{}
  }catch(error){
   aiError=true;
   // Never log arbitrary messages/stacks/custom fields; only fixed codes from
   // safeFailureCode may supplement the stage/type diagnostics.
   const diagnostic={phase:'scheduled-ai-failed',day:t.day,reason:'generation-evidence-or-journal-failed',stage:aiStage,errorType:typeof error,errorCode:safeFailureCode(error)};
   recordEvent(diagnostic);
   try{console.error('Scheduled Gemini failed; free updates and previous accepted AI retained',JSON.stringify(diagnostic));}catch{}
  }
 }
 // Always attempt the shared saved-input aggregator. It can publish new free
 // observations and independently accepted AI, including after partial failures.
 try{await(options.publishOverview||(await import('../../src/server/freeDailyJobs.ts')).publishDailyOverview)({...run,finishedAt:now().toISOString()});}
 catch{recordEvent({phase:'overview-retained',day:t.day,reason:'saved-aggregation-failed'});}
 return {sourceRun:run,sourceError,aiError,aiResult};
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
 if(process.env.GOOGLE_API_KEY)throw Error('Use only the explicitly authorized private Gemini secret');

 await withCloudPublicationLease(async()=>{
 const {pointer,generation}=await readCloudPointer(),state=await gcsRead(process.env.RMS_STATE_BUCKET!,pointer.state.key);if(sha256(state.bytes)!==pointer.state.sha256)throw Error('Private state integrity mismatch');
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'rms-cloud-refresh-'));await restoreState(state.bytes,workspace);process.chdir(workspace);
 const {configuredScheduledPolicy,cloudScheduledJournal}=await import('../../src/server/scheduledAi.ts');
 let paidPolicy:ReturnType<typeof configuredScheduledPolicy>=null;
 try{paidPolicy=configuredScheduledPolicy();}catch{console.error('Scheduled paid policy not approved/valid; free data continues, AI retained');}
 const result=await runRefreshWorkflow(paidPolicy,paidPolicy?cloudScheduledJournal((await import('../../src/server/freeSourceRefresh.ts')).freeRefreshDay().day):undefined);if(!result)return;
 try{await privateServer(workspace,async base=>{const bundle=await capturePublicBundle(base);await publish(bundle,await archiveState(workspace),generation||'0');});}
 catch(error){
  try{console.error('Final saved publication failed',JSON.stringify({stage:'final-publication-capture',errorCode:safeFailureCode(error),...(error instanceof PrivateReaderStartupError?{elapsedMs:error.elapsedMs,exitCode:error.exitCode,signalCode:error.signalCode,hint:error.hint}:{})}));}catch{}
  throw new Error('Final saved publication failed: '+safeFailureCode(error));
 }
 });
}else throw Error('Commands: prepare, check-state, seed, refresh');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
