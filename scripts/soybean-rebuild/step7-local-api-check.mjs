/** Offline-owned local HTTP check. GET only; NEVER requests force refresh. */
const args=process.argv.slice(2);
const i=args.indexOf('--commodity');
const commodity=i>=0?args[i+1]:undefined;
const allowed=new Set(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
if(!allowed.has(commodity)||args.length!==2){console.error('Usage: node scripts/soybean-rebuild/step7-local-api-check.mjs --commodity potato-starch');process.exit(2);}
const url=`http://localhost:3000/api/ai-analysis/${commodity}`;
try{
 const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
 const j=await r.json();const d=j?.data;
 console.log('[RMS LOCAL PREVIEW] Commodity:',commodity);
 console.log('[RMS LOCAL PREVIEW] HTTP:',r.status);
 console.log('[RMS LOCAL PREVIEW] Is the STEP7 preview:',d?.rmsStep7Preview===true?'YES':'NO');
 console.log('[RMS LOCAL PREVIEW] Desk:',d?.deskRecommendation||'(none)');
 console.log('[RMS LOCAL PREVIEW] Sources:',Array.isArray(d?.sources)?d.sources.length:0);
 if(!r.ok||d?.rmsStep7Preview!==true){console.error('[RMS LOCAL PREVIEW] Local STEP7 preview is not active. Check terminal environment, gateway fix and receipt.');process.exitCode=2;}
}catch(e){console.error('[RMS LOCAL PREVIEW] localhost server unavailable:',e.message);process.exitCode=2;}
