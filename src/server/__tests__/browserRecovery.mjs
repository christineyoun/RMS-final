/** Uses the existing Chrome installation and Node's built-in WebSocket; no packages. */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rms-chrome-'));
const output=path.join(process.cwd(),'.rms-recovery-browser');fs.mkdirSync(output,{recursive:true});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let port;let stderr='';chrome.stderr.on('data',chunk=>{stderr+=String(chunk);const match=/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(stderr);if(match)port=Number(match[1]);});
let socket;
try{
  for(let i=0;i<100&&!port;i++)await delay(100);
  if(!port)throw Error('Chrome debugging endpoint unavailable: '+stderr.slice(-400));
  const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let seq=0;const pending=new Map();let requests=[];let errors=[];
  socket.onmessage=e=>{const m=JSON.parse(String(e.data));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
    if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){const t=m.params.args.map(a=>a.value||a.description||'').join(' ');if(/NaN|Infinity|uncaught|TypeError/i.test(t))errors.push(t);}
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  const results=[];
  for(const id of (process.env.RMS_BROWSER_IDS||process.argv[2]||'corn,wheat,soybean,soybean-oil,palm-oil,sugar,potato-starch,tapioca-starch').split(',')){
    console.log('Checking browser page:',id);
    requests=[];errors=[];
    await send('Page.navigate',{url:`http://127.0.0.1:3000/?browser-audit=${id}#commodity-${id}`});
    let state;
    for(let i=0;i<180;i++){
      await delay(200);
      state=await evaluate(`(()=>({ready:!!document.getElementById('commodity-pdf-page-1'),origins:document.querySelectorAll('.origin-card').length,loading:document.querySelectorAll('.animate-pulse').length}))()`);
      if(state.ready&&state.origins>0&&state.loading===0){await delay(1000);break;}
    }
    const actual=await evaluate(`(()=>{const section=[...document.querySelectorAll('section')].find(s=>s.textContent.includes('Price Trend Analysis')||s.textContent.includes('Raw Potato Production Trend'));return {title:document.querySelector('h1')?.textContent,origins:document.querySelectorAll('.origin-card').length,news:document.querySelectorAll('.news-card-item').length,chartPaths:section?[...section.querySelectorAll('path')].filter(p=>(p.getAttribute('d')||'').trim().startsWith('M')).length:0,invalidText:document.body.innerText.includes('NaN')||document.body.innerText.includes('Infinity'),invalidPaths:[...document.querySelectorAll('path')].filter(p=>/NaN|Infinity/.test(p.getAttribute('d')||'')).length,pdfPages:['commodity-pdf-page-1','commodity-pdf-page-2'].filter(id=>document.getElementById(id)).length,ruleText:document.body.innerText.includes('규칙 기반'),proxyLabel:document.body.innerText.includes('원료감자 생산량 대리지표 · 전분 가격 아님'),emptyRadar:document.body.innerText.includes('산지 자료를 불러오는 중입니다.')};})()`);
    console.log('Browser inspected:',id,JSON.stringify(actual));

    actual.originRequested=requests.some(url=>url.includes('origin-radar'));actual.errors=errors;
    assert.ok(actual.title,id+' page mounted');assert.ok(actual.origins>=4,id+' browser effect fetched actual origins');assert.ok(actual.originRequested,id+' origin request fired');
    assert.equal(actual.pdfPages,2);assert.equal(actual.invalidPaths,0);assert.equal(actual.invalidText,false);assert.equal(actual.ruleText,false);assert.equal(actual.emptyRadar,false);assert.equal(errors.length,0,errors.join('\n'));
    if(id==='potato-starch'){assert.equal(actual.proxyLabel,true);assert.ok(actual.chartPaths>0,'original potato graph actually rendered');}
    if(['palm-oil','tapioca-starch'].includes(id))assert.ok(actual.chartPaths>0,id+' price chart actually rendered');
    if(['wheat','palm-oil'].includes(id)){
      const checkLabels=async()=>{
        await delay(200);
        const state=await evaluate(`(()=>{
          const layer=document.querySelector('[data-chart-endpoint-layer]');const r=layer.getBoundingClientRect();
          const rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};
          const labels=[...layer.querySelectorAll('[data-chart-endpoint-label]')].map(e=>({id:e.dataset.chartEndpointLabel,text:e.textContent,...rect(e)}));
          const dots=[...layer.querySelectorAll('[data-chart-endpoint-dot]')].map(e=>({id:e.dataset.chartEndpointDot,...rect(e)}));
          const connectors=[...layer.querySelectorAll('[data-chart-endpoint-connector]')].map(e=>({x1:Number(e.getAttribute('x1')),x2:Number(e.getAttribute('x2')),length:Math.abs(Number(e.getAttribute('y1'))-Number(e.getAttribute('y2'))),dotted:e.getAttribute('stroke-dasharray')==='2 2'}));
          const ticks=[...layer.parentElement.querySelectorAll('[data-chart-axis-label]')].map(rect);
          const points=[];
          layer.parentElement.querySelector('svg').querySelectorAll('path[stroke]').forEach(p=>{const length=p.getTotalLength(),m=p.getScreenCTM();for(let i=0;i<=500;i++){const v=p.getPointAtLength(length*i/500);points.push(new DOMPoint(v.x,v.y).matrixTransform(m));}});
          const overlaps=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
          return {labels,dots,connectors,dotCovered:labels.some(a=>dots.some(b=>overlaps(a,b))),endpointAligned:labels.every(a=>{const dot=dots.find(d=>d.id===a.id);return Math.abs(a.right-(dot.left+dot.right)/2)<2}),bounds:rect(layer),width:innerWidth,curveOverlap:labels.some(a=>points.some(p=>p.x>a.left&&p.x<a.right&&p.y>a.top-2&&p.y<a.bottom+2)),overlaps:labels.some((a,i)=>labels.slice(i+1).some(b=>overlaps(a,b))),axisOverlap:labels.some(a=>ticks.some(b=>overlaps(a,b))),outside:labels.some(a=>a.left<r.left-.5||a.right>r.right+.5||a.top<r.top-.5||a.bottom>r.bottom+.5)};
        })()`);
        assert.equal(state.labels.length,id==='wheat'?3:2);assert.equal(state.overlaps,false,JSON.stringify(state));assert.equal(state.dotCovered,false,JSON.stringify(state));assert.equal(state.endpointAligned,true,JSON.stringify(state));assert.ok(state.connectors.every(c=>c.x1===c.x2&&c.dotted&&c.length<90),JSON.stringify(state));assert.equal(state.outside,false,JSON.stringify(state));return state;
      };
      actual.endpointLabels=await checkLabels();
      if(id==='palm-oil'){
        actual.palmDates=await evaluate(`(()=>({cpo:document.querySelector('[data-palm-observation="cpo"]')?.textContent,olein:document.querySelector('[data-palm-observation="olein"]')?.textContent,fpOL:document.body.innerText.includes('Bursa Malaysia FPOL'),quoteDateDisclosed:document.body.innerText.includes('시세 표시일 2026-10-15')}))()`);
        assert.equal(actual.palmDates.cpo,'2026-10-19');assert.equal(actual.palmDates.olein,'2026-10-19');assert.equal(actual.palmDates.fpOL,true);assert.equal(actual.palmDates.quoteDateDisclosed,true);
      }
      for(const width of [900,1280]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await checkLabels();
      }
      await send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25});await checkLabels();
      await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
      for(const currency of ['USD ($)','EUR (€)','KRW (₩)']){
        await evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(currency)})?.click()})()`);await checkLabels();
      }
      for(const tf of ['1M','3M','6M']){
        await evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(tf)}))?.click()})()`);await checkLabels();
      }
    }
    if(id==='potato-starch'){
      assert.equal(await evaluate("document.body.innerText.includes('2021 Actual') && document.body.innerText.includes('2026 Estimate')"),true,'full annual history is visible without a timeframe click');
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('6M'))?.click()");await delay(400);
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('5Y'))?.click()");await delay(400);
      actual.fullHistoryVisible=await evaluate("document.body.innerText.includes('2021 Actual') && document.body.innerText.includes('2026 Estimate')");
      assert.equal(actual.fullHistoryVisible,true,'5Y control displays the original annual range');
    }
    console.log('Browser DOM verified:',id,JSON.stringify(actual));
    if(['corn','wheat','palm-oil','potato-starch','tapioca-starch'].includes(id)){ 
      try {
        await evaluate(id==='corn'?"document.querySelector('.wasde-origin-radar-section')?.scrollIntoView({block:'start'})":"[...document.querySelectorAll('section')].find(s=>s.textContent.includes('Price Trend Analysis')||s.textContent.includes('Raw Potato Production Trend'))?.scrollIntoView({block:'start'})");
        const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(output,id+'.png'),Buffer.from(shot.data,'base64'));
      }catch(e){console.log('Screenshot unavailable:',e.message);}
    }
    results.push({id,...actual});console.log(JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(output,(process.env.RMS_BROWSER_IDS||process.argv[2])?'results-selected.json':'results.json'),JSON.stringify(results,null,2));
  console.log('PASS: '+results.length+' pages in real Chrome, actual Origin requests, charts, clean AI states, two PDF containers.');
}finally{socket?.close();chrome.kill('SIGTERM');}
