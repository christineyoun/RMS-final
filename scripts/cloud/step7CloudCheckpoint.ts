/** Private-bucket-only STEP research checkpoint. Never part of the public bundle.
 * A durable in-flight marker before EACH commodity avoids silently billing the
 * same stage again after a killed Cloud Run job. Such a commodity needs manual
 * reconciliation; other commodities continue. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {gcsRead,gcsWrite} from '../../src/server/cloudPublication.ts';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const validDay=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const expectedDirs=(day:string)=>[...ids.map(id=>id==='soybean'?`.rms-soybean-rebuild/daily/${day}`:`.rms-research/${id}/daily/${day}`),...ids.map(id=>`.rms-research-runner/${id}/daily/${day}`)];
const allowedFile=(file:string,day:string)=>expectedDirs(day).some(dir=>file.startsWith(dir+'/'))&&
  !file.includes('\\')&&!file.split('/').includes('..')&&/\.(json|jsonl|txt|html|pdf|md)$/.test(file)&&
  !/(?:secret|credential|\.env|api.key)/i.test(file);
export type Checkpoint={version:1;day:string;inFlight:string|null;files:Record<string,string>};
const pointerName=(day:string)=>`step7-checkpoints/${day}/current.json`;
const bucket=()=>{if(!process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.RMS_CLOUD_FREE_JOB!=='1'||process.env.RMS_STEP7_CLOUD_APPROVED!=='YES'||!process.env.RMS_STATE_BUCKET)throw Error('Private GCS checkpoint is not authorized');return process.env.RMS_STATE_BUCKET;};
export async function readStep7Checkpoint(day:string,root=process.cwd()){
 if(!validDay(day))throw Error('Invalid checkpoint day');
 let response;
 try{response=await gcsRead(bucket(),pointerName(day));}catch(e){if(/HTTP 404/.test(String(e)))return {inFlight:null,generation:'0'};throw e;}
 const ptr=JSON.parse(Buffer.from(response.bytes).toString());
 if(ptr.version!==1||ptr.day!==day||!/^step7-checkpoints\/20\d\d-\d\d-\d\d\/[a-f0-9]{64}\.json\.gz$/.test(ptr.key)||! /^[a-f0-9]{64}$/.test(ptr.sha256)||ptr.key!==`step7-checkpoints/${day}/${ptr.sha256}.json.gz`)throw Error('Invalid daily checkpoint pointer');
 const obj=await gcsRead(bucket(),ptr.key);if(hash(obj.bytes)!==ptr.sha256)throw Error('Private daily checkpoint hash mismatch');
 const data:Checkpoint=JSON.parse(gunzipSync(obj.bytes).toString());
 if(data.version!==1||data.day!==day||!(data.inFlight===null||ids.includes(data.inFlight))||!data.files||Object.entries(data.files).some(([n,v])=>!allowedFile(n,day)||typeof v!=='string'))throw Error('Invalid daily checkpoint payload');
 for(const [n,b] of Object.entries(data.files)){const file=path.join(root,n);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,Buffer.from(b,'base64'));}
 return {inFlight:data.inFlight,generation:response.generation||'0'};
}
export async function saveStep7Checkpoint(day:string,inFlight:string|null,previousGeneration:string,root=process.cwd()){
 if(!validDay(day)||!(inFlight===null||ids.includes(inFlight)))throw Error('Invalid checkpoint identity');
 const files:Record<string,string>={};
 async function walk(dir:string){let entries;try{entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 for(const ent of entries){const rel=dir+'/'+ent.name;if(ent.isDirectory())await walk(rel);else if(ent.isFile()&&allowedFile(rel,day)){const stat=await fs.stat(path.join(root,rel));if(stat.size>45*1024*1024)throw Error('Oversized STEP checkpoint artifact');files[rel]=(await fs.readFile(path.join(root,rel))).toString('base64');}}
 }
 for(const dir of expectedDirs(day))await walk(dir);
 const zipped=gzipSync(JSON.stringify({version:1,day,inFlight,files} satisfies Checkpoint));
 if(zipped.byteLength>130*1024*1024)throw Error('STEP checkpoint too large');
 const sha256=hash(zipped),key=`step7-checkpoints/${day}/${sha256}.json.gz`;
 try{await gcsWrite(bucket(),key,zipped);}catch(e){const existing=await gcsRead(bucket(),key);if(hash(existing.bytes)!==sha256)throw e;}
 const result=await gcsWrite(bucket(),pointerName(day),Buffer.from(JSON.stringify({version:1,day,key,sha256})),previousGeneration);
 if(!result?.generation)throw Error('No checkpoint generation returned');
 return String(result.generation);
}
