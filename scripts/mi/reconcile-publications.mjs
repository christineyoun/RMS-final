/** Offline, content-addressed MI publication reconciliation. No model, search, or Cloud calls. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {readScheduledContent,publishScheduledContent,acceptedScheduledNews} from '../../src/server/scheduledContent.ts';
import {recoverVerifiedNewsCoverage} from '../../src/server/newsHistoryCoverage.ts';

const mode=process.argv[2]||'preview';
if(!['preview','apply'].includes(mode)){
 console.error('Usage: node --import tsx scripts/mi/reconcile-publications.mjs preview|apply');process.exit(2);
}
const root=process.cwd(),dir=path.join(root,'.rms-stage3');
const manifestFile=path.join(dir,'scheduled-content-current.json');
if(!fs.existsSync(manifestFile))throw Error('No current publication manifest; refusing to invent one');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const keys=Object.keys(manifest.entries||{}).filter(k=>k.startsWith('news-'));
if(!keys.length)throw Error('No existing news publication keys; refusing to invent them');
let changed=0;
for(const key of keys){
 const id=key.slice(5),saved=readScheduledContent(key,root);
 if(!saved){console.log(key,'SKIP: missing/invalid active publication');continue;}
 const original=acceptedScheduledNews(id,saved.payload.articles||[]);
 const proposed=recoverVerifiedNewsCoverage(id,original,root);
 console.log(key,`${original.length} -> ${proposed.length}`,proposed.length>original.length?'RECOVERABLE':'UNCHANGED');
 if(mode!=='apply'||proposed.length<=original.length)continue;
 // Preserve an independent on-disk backup of the full manifest before each
 // attempted publication. The writer itself serializes all manifest updates.
 const backup=path.join(os.homedir(),'Desktop','RMS_MI_backups','mi-reconciliation-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
 fs.mkdirSync(backup,{recursive:true});
 fs.copyFileSync(manifestFile,path.join(backup,'scheduled-content-current.before.json'));
 const outcome=publishScheduledContent({[key]:{...saved.payload,articles:proposed}},'mi-reconciliation-'+randomUUID(),root);
 if(!outcome.accepted.includes(key))throw Error(`${key}: recovery not accepted; inspect backup ${backup}`);
 const actual=readScheduledContent(key,root)?.payload?.articles||[];
 if(actual.length<proposed.length)throw Error(`${key}: post-recovery count decreased; inspect backup ${backup}`);
 changed++;
 console.log(key,'RESTORED',actual.length,'backup:',backup);
}
console.log(mode==='preview'?'READ ONLY — no writes or API calls':`DONE — ${changed} publications reconciled; no API calls`);
