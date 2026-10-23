import {startPublicationHistory,comparisonFor} from './src/server/overviewMarketHistory.ts';
import {captureOverviewPublication} from './src/server/overviewPublishedInputs.ts';
import {refreshSoybeanOilNews} from './src/server/soybeanOilVerifiedNews.ts';
import {startFreeSourceScheduler,refreshPalmPageSources} from './src/server/freeSourceRefresh.ts';
import express from 'express';
import { publicDeploymentGuard } from './src/server/publicDeploymentGuard.mjs';
import {refreshSoybeanNews} from './src/server/soybeanNewsPersistence.ts';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createGeminiApiMiddleware } from './src/server/geminiApi.ts';
import { createStage3Gateway, startStage3Scheduler } from './src/server/stage3DailyUpdates.ts';
import { loadAll8OriginRadar, ORIGIN_MVP } from './src/server/all8OriginRadarService.ts';

async function startServer() {
  const app = express();
  // Public hosting is fail-closed until saved-data and refresh architecture are verified.
  if (process.env.RMS_PUBLIC_READONLY === '1') {
    if (process.env.RMS_PUBLIC_DATA_READY !== '1') {
      throw new Error('RMS public deployment blocked: persistent snapshots and updater are not yet certified.');
    }
    if (process.env.GEMINI_API_KEY) {
      throw new Error('RMS public deployment blocked: Gemini credentials must never be present in the public viewer.');
    }
    app.use(publicDeploymentGuard);
  }
  const PORT = Number(process.env.PORT) || 3000;

  app.post('/api/rms/palm/free-refresh',async(_req,res)=>{try{res.json(await refreshPalmPageSources());}catch{res.status(503).json({success:false,error:'Free Palm source refresh failed; saved data retained'});}});

  app.post('/api/rms/soybean-oil/news-refresh',async(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')){res.status(403).json({success:false,error:'Local free refresh only'});return;}
    try{res.setHeader('Cache-Control','no-store');res.json({success:true,...await refreshSoybeanOilNews()});}
    catch{res.status(503).json({success:false,error:'Free Soybean Oil news refresh failed; verified receipts retained'});}
  });

  app.post('/api/rms/soybean/news-refresh',async(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')){res.status(403).json({success:false,error:'Local free refresh only'});return;}
    try{res.setHeader('Cache-Control','no-store');res.json({success:true,...await refreshSoybeanNews()});}
    catch{res.status(503).json({success:false,error:'Free Soybean news refresh failed; verified receipts retained'});}
  });

  // Free, evidence-only Origin Radar for remaining commodities; never uses Gemini.
  app.get('/api/rms/origin-radar-all', async (req, res) => {
    const id = typeof req.query.commodity === 'string' ? req.query.commodity : '';
    if (!Object.prototype.hasOwnProperty.call(ORIGIN_MVP, id)) { res.status(400).json({success:false,error:'Unsupported commodity'}); return; }
    try { res.setHeader('Cache-Control','no-store'); res.json(await loadAll8OriginRadar(id,req.query.force==='true')); }
    catch { res.status(503).json({success:false,error:'Verified origin data unavailable'}); }
  });

  // Mount Gemini API and other custom backend routes
  const savedGateway=createStage3Gateway();
  const capture=()=>captureOverviewPublication(savedGateway);
  app.get('/api/overview/comparison',(_req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(comparisonFor(capture()));}catch{res.status(503).json({message:'전일 비교 데이터 없음'});}});
  app.use(savedGateway);
  if (process.env.RMS_PUBLIC_READONLY !== '1') startPublicationHistory(capture);
  app.use(createGeminiApiMiddleware());

  // Vite middleware for development vs static assets for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Dev: Mounted Vite middleware.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Application build not found (dist/index.html missing). Please run npm run build.');
      }
    });
    console.log('Production: Serving static assets from dist/.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    if(process.env.RMS_DISABLE_SCHEDULERS==='1'||process.env.RMS_PUBLIC_READONLY==='1'){
      console.log('[RMS] Scheduled refresh startup disabled for this session; saved settings unchanged.');
    }else{
      startStage3Scheduler();
      startFreeSourceScheduler();
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
