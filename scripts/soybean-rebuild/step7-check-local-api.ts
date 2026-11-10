/** One GET to localhost only: verify what the browser actually receives. No Gemini calls. */
const url='http://localhost:3000/api/ai-analysis/soybean';
async function main(){
  const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
  const result=await response.json();
  const a=result?.data;
  const isPreview=a?.rmsStep7Preview===true;
  console.log('[STEP7 HTTP CHECK] HTTP:',response.status);
  console.log('[STEP7 HTTP CHECK] Data status:',response.headers.get('x-rms-data-status')||'(none)');
  console.log('[STEP7 HTTP CHECK] Is STEP7 local preview:',isPreview?'YES':'NO');
  console.log('[STEP7 HTTP CHECK] Desk recommendation:',a?.deskRecommendation||'(missing)');
  console.log('[STEP7 HTTP CHECK] Source links:',a?.sources?.length??0);
  if(!response.ok||!isPreview){
    console.error('[STEP7 HTTP CHECK] This server is still not serving the new STEP7 preview.');
    console.error('Verify the SAME terminal starts localhost:3000 with RMS_STEP7_LOCAL_PREVIEW=1 and NODE_ENV not production.');
    process.exitCode=1;
  } else {
    console.log('[STEP7 HTTP CHECK] OK. Refresh the local RMS soybean page (Ctrl+F5).');
  }
}
main().catch(e=>{console.error('[STEP7 HTTP CHECK] Could not reach localhost:3000:',e.message);process.exitCode=1;});
