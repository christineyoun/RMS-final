import {PDFParse} from 'pdf-parse';
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
const base=(process.argv[2]||'http://127.0.0.1:8082').replace(/\/$/,''),out=process.argv[3];
if(!out)throw Error('Usage: node scripts/cloud/smoke.mjs BASE_URL NEW_OUTPUT_DIRECTORY');
if(fs.existsSync(out))throw Error('Use a new output directory to avoid confusing prior downloads');
fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),evidence={httpErrors:[],errors:[],api:[],external:[],pages:[],pdf:[]};
const chrome=spawn(process.env.RMS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+fs.mkdtempSync('/tmp/rms-daily-chrome-'),'about:blank'],{stdio:['ignore','ignore','pipe']});let port,ws;
chrome.stderr.on('data',b=>{port=Number(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(b))?.[1])||port;});
try{
 for(let i=0;i<100&&!port;i++)await wait(100);assert(port);const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}else if(m.method==='Network.responseReceived'&&m.params.response.status>=400)evidence.httpErrors.push({url:m.params.response.url,status:m.params.response.status});else if(m.method==='Runtime.exceptionThrown')evidence.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;if(u.startsWith(base+'/api/'))evidence.api.push(u);else if(/^https:/.test(u))evidence.external.push(u);}};
 const browser=async(fn,arg)=>{const r=await send('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg??null)+')',returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});



 const health=await(await fetch(base+'/api/health')).json();assert(health.ready&&health.readOnly);evidence.health=health;
 for(const [url,method] of [['/api/rms/palm/free-refresh','POST'],['/api/rms/control/standalone-analysis','POST'],['/api/gemini/live-market-data','POST'],['/api/gemini/live-market-data','GET'],['/api/history?commodity=corn&timeframe=5Y&force=true','GET']]){const r=await fetch(base+url,{method});assert.equal(r.status,403);}
 const publication=await(await fetch(base+'/api/rms/free-publication')).json();
 const canonicalIssue=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(publication.publishedAt)).replaceAll('-','');
 const exports=[['overview','Global_Overview'],['wheat','Wheat'],['corn','Corn'],['soybean','Soybean'],['soybean-oil','Soybean_Oil'],['palm-oil','Palm_Oil'],['sugar','Sugar'],['potato-starch','Potato_Starch'],['tapioca-starch','Tapioca_Starch'],['overview','Global_Overview']];
 for(let index=0;index<exports.length;index++){
 const [id,name]=exports[index];await send('Page.navigate',{url:base+'/#'+(id==='overview'?'main-dashboard':'commodity-'+id)});await wait(750);await send('Page.reload',{ignoreCache:true});await wait(3000);await browser(async()=>{await document.fonts.ready;window.scrollTo({top:0,behavior:'instant'});});
 const label=await browser(()=>{const e=document.querySelector('[data-daily-issue]');if(e?.children.length!==1||e?.querySelector('.rounded-full'))throw Error('Unexpected issue icon');return e.innerText;});assert.match(label,/^Issue #[0-9]{8}$/);const issue=label.slice(-8);assert.equal(issue,canonicalIssue);
 const noPills=await browser(()=>document.querySelectorAll('[data-weather-pills]').length);assert.equal(noPills,0);
 const filename='Nongshim_RMS_'+name+'_'+issue+'.pdf';
 const folder=(await import('node:path')).resolve(out,'pdf','verified-'+index);fs.mkdirSync(folder,{recursive:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:folder});
 await browser(id=>{const needle=id==='overview'?'리포트 내보내기':'품목 리포트 출력';const b=[...document.querySelectorAll('button')].find(e=>e.innerText.includes(needle));if(!b)throw Error('Export button missing');b.click();},id);
 let downloaded;for(let i=0;i<600;i++){await wait(100);downloaded=fs.readdirSync(folder).find(n=>n.endsWith('.pdf'));if(downloaded)break;}assert.equal(downloaded,filename);
 const file=folder+'/'+downloaded,raw=fs.readFileSync(file);assert.equal((raw.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,2);
 const parser=new PDFParse({data:raw});const text=await parser.getText();assert.equal((text.text.match(new RegExp('Issue #'+issue,'g'))||[]).length,2);assert.equal(text.total,2);
 const info=await parser.getInfo({parsePageInfo:true});for(const p of info.pages){assert(Math.abs(p.width-595.28)<2&&Math.abs(p.height-841.89)<2,'Expected portrait A4');}
 if(index<9){const shots=await parser.getScreenshot({partial:[1,2],scale:1});for(const p of shots.pages)fs.writeFileSync(out+'/'+id+'-page-'+p.pageNumber+'.png',p.data);}
 await parser.destroy();evidence.pdf.push({id,filename,issue,pages:2,file});console.log('PASS '+filename+' · two A4 pages with matching issue labels');
 }
 assert.deepEqual(evidence.httpErrors.filter(e=>e.status===403||e.url.includes('saved-market-data')),[]);assert.equal(evidence.pdf[0].filename,evidence.pdf.at(-1).filename);assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.external.filter(u=>!/(fonts.googleapis.com|fonts.gstatic.com)/.test(u)),[]);assert.equal((await(await fetch(base+'/api/rms/free-publication')).json()).revision,publication.revision,'Run QA against a stable Issue');
 console.log('PASS all nine actual PDF export paths and repeated same-issue Overview export; stable canonical Issue, public mutation protections and zero weather pills.');
}finally{fs.writeFileSync(out+'/browser-verification.json',JSON.stringify(evidence,null,2));ws?.close();chrome.kill('SIGTERM');}
process.exit(0);
