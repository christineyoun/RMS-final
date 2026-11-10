/**
 * Install the local STEP7 preview at the FIRST /api/ai-analysis gate.
 * No paid calls and no published snapshot modifications. Idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const IMPORT_AFTER="import {rmsAiEditorial} from '../utils/rmsAiEditorial.ts';";
const ADD_IMPORT="import {readStep7LocalPreview} from './step7LocalPreview.ts';";
const GATE_ANCHOR="    const u=new URL(req.url||'/', 'http://localhost');";
const MARKER='// STEP7 LOCAL PREVIEW BEFORE SAVED STAGE3 SNAPSHOT ROUTING';

export function patchStage3Gateway(source:string):string {
  if (source.includes(MARKER)) {
    if(!source.includes(ADD_IMPORT)||!source.includes('readStep7LocalPreview(commodity,req.socket.remoteAddress)')) {
      throw Error('Partial STEP7 gateway patch found; refusing to modify file.');
    }
    return source;
  }
  if(source.includes(ADD_IMPORT))throw Error('Unexpected existing STEP7 import. No changes made.');
  for(const anchor of [IMPORT_AFTER,GATE_ANCHOR]) {
    if(source.split(anchor).length!==2) throw Error(`Expected a single gateway anchor, found a different version: ${anchor}`);
  }
  const block=`\n    ${MARKER}\n    // Only an explicitly opted-in local dev browser may see the unapproved test.\n    // /api/ai-analysis is normally consumed here before geminiApi.ts middleware.\n    if(req.method==='GET' && !u.searchParams.has('force') && !u.searchParams.has('forceRefresh')\n      && /^\\/api\\/ai-analysis\\/[a-z-]+$/.test(u.pathname)\n      && /^(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?$/.test(String(req.headers.host||''))) {\n      const commodity=u.pathname.slice('/api/ai-analysis/'.length);\n      const preview=readStep7LocalPreview(commodity,req.socket.remoteAddress);\n      if(preview) {\n        res.setHeader('X-RMS-Data-Status','step7-local-preview');\n        return respond(res,200,{\n          success:true,data:preview,timestamp:new Date().toISOString(),\n          status:preview.status,generatedAt:preview.generatedAt,\n          sourceCount:preview.sources.length\n        });\n      }\n    }\n`;
  return source.replace(IMPORT_AFTER,IMPORT_AFTER+'\n'+ADD_IMPORT)
    .replace(GATE_ANCHOR,GATE_ANCHOR+block);
}

export function installGatewayFix(root=process.cwd()):void {
  const target=path.join(root,'src','server','stage3DailyUpdates.ts');
  const helper=path.join(root,'src','server','step7LocalPreview.ts');
  if(!fs.existsSync(target)||!fs.existsSync(helper))
    throw Error('Missing RMS gateway or STEP7 helper. Run from RMS_V7_5_COMPLETE after applying the previous STEP7 patch.');
  const old=fs.readFileSync(target,'utf8');
  const updated=patchStage3Gateway(old);
  if(old===updated){
    console.log('[STEP7 GATEWAY FIX] Already installed. No files changed.');return;
  }
  const backupDir=path.join(root,'.rms-soybean-rebuild','backup');
  fs.mkdirSync(backupDir,{recursive:true});
  const backup=path.join(backupDir,'stage3DailyUpdates.ts.before-step7-local-preview.bak');
  // Do not overwrite the first clean backup; never continue if a collision occurs.
  fs.writeFileSync(backup,old,{flag:'wx'});
  const temp=target+'.step7-gateway-temp';
  try {fs.writeFileSync(temp,updated,{flag:'wx'});fs.renameSync(temp,target);}
  catch(e){try{fs.rmSync(temp,{force:true});}catch{}throw e;}
  console.log('[STEP7 GATEWAY FIX] Local preview added before saved snapshot routing.');
  console.log('[STEP7 GATEWAY FIX] Backup:',backup);
  console.log('[STEP7 GATEWAY FIX] No original snapshots or STEP7 result files were modified.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  installGatewayFix();
