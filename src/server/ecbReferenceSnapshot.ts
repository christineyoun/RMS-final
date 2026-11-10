import {parseDatedDisplayFx} from '../utils/soybeanPriceSnapshot.ts';

/** Keep the current official ECB reference observation, not retrieval time, authoritative. */
export function verifiedEcbPrevious(saved:any):any|null {
 const current=parseDatedDisplayFx(saved?.raw,saved?.verifiedAt);
 const previous=saved?.previous;
 const older=parseDatedDisplayFx(previous?.raw,previous?.verifiedAt);
 if(!current||!older)return null;
 const days=(Date.parse(current.observationDate)-Date.parse(older.observationDate))/86400000;
 // Only adjacent reference dates (including ordinary weekends). If skipped
 // sessions make comparability uncertain, do not publish a daily percentage.
 return days>=1&&days<=3?previous:null;
}

export function buildVerifiedEcbSnapshot(raw:any,verifiedAt:string,prior:any):any {
 const current=parseDatedDisplayFx(raw,verifiedAt);
 if(!current)throw Error('Invalid dated USD-based Frankfurter ECB reference response');
 const old=parseDatedDisplayFx(prior?.raw,prior?.verifiedAt);
 if(old&&old.observationDate>current.observationDate)
  throw Error('Frankfurter returned an older reference date than saved ECB data');
 let previous:any=null;
 if(old&&old.observationDate<current.observationDate){
  previous={raw:prior.raw,verifiedAt:prior.verifiedAt};
 }else if(old&&old.observationDate===current.observationDate){
  previous=verifiedEcbPrevious(prior);
 }
 const candidate={raw,verifiedAt,...(previous?{previous}:{})};
 // Do not retain a misleading comparison after missed sessions.
 if(!verifiedEcbPrevious(candidate))delete candidate.previous;
 return candidate;
}
