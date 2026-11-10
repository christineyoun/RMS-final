/** Cross-process lock for the shared scheduled publication manifest.
 * Fail closed if another writer holds the lock; never steal a live writer's work.
 */
import fs from 'node:fs';
import path from 'node:path';

export function withScheduledPublicationLock<T>(stage3Directory:string,work:()=>T):T{
 const lock=path.join(stage3Directory,'scheduled-content-current.lock');
 fs.mkdirSync(stage3Directory,{recursive:true});
 try{fs.mkdirSync(lock);}catch(error:any){
  if(error?.code==='EEXIST')throw Error('Scheduled publication is locked by another process; no changes made');
  throw error;
 }
 try{
  fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{mode:0o600});
  return work();
 }finally{
  try{fs.rmSync(lock,{recursive:true,force:true});}catch{/* A later attempt will fail closed. */}
 }
}
