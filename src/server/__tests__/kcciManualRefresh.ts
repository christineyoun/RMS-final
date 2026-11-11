/** Explicit KCCI-only manual bootstrap after successful install. No paid APIs or SCFI requests. */
import {refreshVerifiedKcci,readVerifiedKcci} from '../kcciScraperService.ts';

async function main():Promise<void> {
 const result=await refreshVerifiedKcci(true);
 const saved=readVerifiedKcci();
 if(!saved||saved.observationDate!==result.observationDate)throw Error('KCCI receipt not durably verified');
 if(result.lastError)throw Error('KOBC request failed; preserved prior observation: '+result.lastError);
 console.log('KCCI VERIFIED AND SAVED:',JSON.stringify({benchmark:'KOBC KCCI',observationDate:saved.observationDate,value:saved.kcciPoints,previousObservationDate:saved.previousObservationDate,previousValue:saved.previousPoints,changePct:saved.changePct,historyCount:saved.history.length,sourceUrl:saved.sourceUrl},null,2));
 console.log('SCFI cache not touched. Restart/reload the RMS Overview to check the freight card.');
}
void main().catch(error=>{
 console.error('KCCI REFRESH FAILED:',error instanceof Error?error.message:String(error));
 process.exitCode=1;
});
