import express from 'express';
import path from 'node:path';
import {publicDeploymentGuard} from './publicDeploymentGuard.mjs';
import {publicRouteKey} from './publicDeploymentRoutes.mjs';
import {loadPublicBundle} from './cloudPublication.ts';
export async function startPublicViewer(){
 if(process.env.RMS_PUBLIC_READONLY!=='1'||process.env.RMS_DISABLE_SCHEDULERS!=='1')throw Error('Public viewer requires read-only mode and disabled local schedulers');
 if(process.env.RMS_PUBLIC_DATA_READY!=='1')throw Error('Public deployment blocked: saved publications and storage are not certified (RMS_PUBLIC_DATA_READY)');
 if(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)throw Error('Paid AI credentials must not be present in the public viewer');
 // No listener is opened unless a complete, integrity-checked publication loads.
 let bundle=await loadPublicBundle(),nextCheck=Date.now()+60000;
 let loading:Promise<void>|null=null;
 const refresh=()=>{
  if(loading)return loading;if(Date.now()<nextCheck)return Promise.resolve();nextCheck=Date.now()+60000;
  loading=loadPublicBundle().then(value=>{bundle=value;}).catch(e=>console.error('[RMS public] Retaining verified publication:',(e as Error).message)).finally(()=>{loading=null;});return loading;
 };
 // Also check on requests: request-based Cloud Run need not allocate idle CPU.
 const timer=setInterval(()=>{void refresh();},60000);timer.unref();
 const app=express();app.use(publicDeploymentGuard);
 app.get('/api/health',(_req,res)=>res.json({ready:true,revision:bundle.revision,publishedAt:bundle.publishedAt,readOnly:true}));
 app.use('/api',async(req,res)=>{await refresh();const key=publicRouteKey(req.originalUrl),saved=key&&bundle.responses[key];res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(!saved)return res.status(503).json({success:false,error:'Saved observation unavailable'});return res.status(saved.status).json(saved.payload);});
 const root=path.resolve(process.env.RMS_APP_ROOT||process.cwd(),'dist');app.use(express.static(root));app.get('*',(_req,res)=>res.sendFile(path.join(root,'index.html')));
 const port=Number(process.env.PORT)||8080;const server=app.listen(port,'0.0.0.0',()=>console.log(`[RMS public] Listening on 0.0.0.0:${port}; saved publication ${bundle.revision}; schedulers OFF; paid AI OFF`));
 return {server,stop:()=>{clearInterval(timer);server.close();}};
}
