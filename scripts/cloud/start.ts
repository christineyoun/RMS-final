// Keep local startup behavior; the public image never imports collector/AI code.
if(process.env.RMS_PUBLIC_READONLY==='1'){
 const {startPublicViewer}=await import('../../src/server/publicViewer.ts');await startPublicViewer();
}else{await import('../../server.ts');}
