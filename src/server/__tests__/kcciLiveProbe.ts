/** Read-only KOBC source acceptance check; NO RMS data writes. */
import {parseKcciTimeseries,KOBC_KCCI_URL} from '../kcciTimeseriesParser.ts';

async function main():Promise<void> {
 const r=await fetch(KOBC_KCCI_URL,{headers:{accept:'text/html'},signal:AbortSignal.timeout(15000)});
 console.log('KOBC HTTP:',r.status,'CONTENT_TYPE:',r.headers.get('content-type'));
 if(!r.ok)throw Error('KOBC returned HTTP '+r.status);
 const html=await r.text();
 console.log('HTML_BYTES:',Buffer.byteLength(html));
 const p=parseKcciTimeseries(html);
 console.log('IDENTITY:',p.indexIdentity);
 console.log('LATEST PUBLISHER DATE:',p.observationDate);
 console.log('LATEST VALUE:',p.kcciPoints);
 console.log('PRIOR DATE:',p.previousObservationDate);
 console.log('PRIOR VALUE:',p.previousPoints);
 console.log('DATED ROWS:',p.history.length);
 console.log('READ-ONLY ACCEPTANCE PASS: KOBC KCCI can be parsed safely. No records written.');
}
void main().catch(error=>{
 console.error('READ-ONLY ACCEPTANCE FAILED:',error instanceof Error?error.message:String(error));
 process.exitCode=1;
});
