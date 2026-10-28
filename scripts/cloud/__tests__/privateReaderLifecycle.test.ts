import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrivateReaderStartupError,waitForPrivateReaderReady,stopPrivateReader,privateReaderStartupHint} from '../privateReaderLifecycle.ts';
import {privateServer} from '../publication.ts';

assert.equal(privateReaderStartupHint('Error [ERR_MODULE_NOT_FOUND]: missing'), 'module-not-found');
assert.equal(privateReaderStartupHint('Error: listen EADDRINUSE 127.0.0.1:18081'),'port-in-use');
assert.equal(privateReaderStartupHint('API_KEY=DO_NOT_LOG'), 'unclassified');

async function launched(script:string){
 const child=spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','pipe']});
 let output='',spawnError:unknown=null,seen=false;
 child.stdout!.on('data',(data:Buffer)=>{output+=data.toString();if(output.includes('Server running on port 18081'))seen=true;});
 child.stderr!.on('data',(data:Buffer)=>{output+=data.toString();});
 child.on('error',error=>{spawnError=error;});
 return {child,ready:()=>seen,error:()=>spawnError,output:()=>output};
}
{
 const c=await launched("setTimeout(()=>console.log('Server running on port 18081'),10500); setInterval(()=>{},1000)");
 try{await waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:15000,probe:async()=>true,output:c.output});}
 finally{await stopPrivateReader(c.child);}
 assert(c.child.exitCode!==null||c.child.signalCode!==null,'Test server must be stopped');
}
{
 const c=await launched('process.exit(12)');
 try{await assert.rejects(waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:3000,probe:async()=>true,output:c.output}),
  error=>error instanceof PrivateReaderStartupError&&error.code==='early-exit'&&error.exitCode===12);}
 finally{await stopPrivateReader(c.child);}
}
{
 const c=await launched('setInterval(()=>{},1000)');
 try{await assert.rejects(waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:250,probe:async()=>true,output:c.output}),
  error=>error instanceof PrivateReaderStartupError&&error.code==='startup-timeout');}
 finally{await stopPrivateReader(c.child);}
}
// A log line is insufficient; repeatedly failing or hung probes stay bounded.
for(const probe of [async()=>false,async()=>new Promise<boolean>(()=>{})]){
 const c=await launched("console.log('Server running on port 18081');setInterval(()=>{},1000)");
 try{await assert.rejects(waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:250,probe}),e=>e instanceof PrivateReaderStartupError&&e.code==='startup-timeout');}
 finally{await stopPrivateReader(c.child,100);}
 assert(c.child.exitCode!==null||c.child.signalCode!==null);
}
// Spawn failures are distinct and do not leave an unhandled error listener.
{
 const child=spawn('/no-such-rms-test-executable',[],{stdio:'pipe'});let error:unknown=null;child.on('error',e=>{error=e;});
 try{await assert.rejects(waitForPrivateReaderReady(child,()=>false,()=>error,18081,{timeoutMs:500}),e=>e instanceof PrivateReaderStartupError&&e.code==='spawn-error');}finally{await stopPrivateReader(child,100);}
}
// Only this test's own child is signalled. A SIGTERM-resistant child gets SIGKILL.
{
 const c=await launched("process.on('SIGTERM',()=>{});console.log('Server running on port 18081');setInterval(()=>{},1000)");
 await waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:2000,probe:async()=>true});await stopPrivateReader(c.child,100);assert.equal(c.child.signalCode,'SIGKILL');
}
// Exercise default readiness: HTTP 200 HTML/wrong JSON is not an RMS reader.
{
 const original=globalThis.fetch;const c=await launched("console.log('Server running on port 18081');setInterval(()=>{},1000)");let count=0;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'http://127.0.0.1:18081/api/rms/refresh-status');assert(init?.signal);count++;return count===1?new Response('<html>not RMS</html>'):Response.json({stage:'weekday-snapshots',autoEnabled:false,timezone:'Asia/Seoul',paidGeminiCalls:'BLOCKED_ON_PAGE_VIEW'});};
 try{await waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:2000});assert(count>=2);}finally{globalThis.fetch=original;await stopPrivateReader(c.child,100);}
}
// Actual privateServer finally block cleans up when final capture/action fails;
// child log payload is never included in startup diagnostics.
{
 let child:ReturnType<typeof spawn>|undefined,action=false;
 await assert.rejects(privateServer(process.cwd(),async()=>{action=true;throw Error('synthetic final capture failure');},{spawnReader:env=>{assert.equal(env.GEMINI_API_KEY,undefined);assert.equal(env.GOOGLE_API_KEY,undefined);assert.equal(env.RMS_GEMINI_API_KEY_FILE,undefined);child=spawn(process.execPath,['-e',`console.log('Server running on port ${env.PORT}');setInterval(()=>{},1000)`],{stdio:['ignore','pipe','pipe']});return child;},probe:async()=>true,timeoutMs:2000,shutdownGraceMs:100}),/synthetic final capture failure/);
 assert(action);assert(child&&(child.exitCode!==null||child.signalCode!==null));
 const c=await launched("console.error('ERR_MODULE_NOT_FOUND API_KEY=SECRET_DO_NOT_LOG');process.exit(3)");
 try{await assert.rejects(waitForPrivateReaderReady(c.child,c.ready,c.error,18081,{timeoutMs:2000,output:c.output}),e=>{assert(e instanceof PrivateReaderStartupError);assert.equal(e.hint,'module-not-found');assert(!e.message.includes('SECRET_DO_NOT_LOG'));return true;});}finally{await stopPrivateReader(c.child,100);}
}
console.log('PASS private reader startup readiness, early exit, bounded timeout, shutdown and sanitized failure classifications');
