/**
 * Fail-closed scheduled Market Intelligence spend reservation.
 * This is a conservative ESTIMATE, not a substitute for the provider's actual billing caps.
 * All previous daily requests for the KST calendar month are counted before a new
 * paid transport is allowed. A durable post-response usage estimate reconciles a
 * reservation; missing or zero estimates retain the full reservation. Estimates
 * are conservative telemetry, not invoices. An invalid/missing FX observation
 * blocks new MI spending.
 */
export type MiPaidRequest = { reservedUsd:number; estimatedUsd?:number };
export type MiDailySpend = { version:number; day:string; requests:MiPaidRequest[] };

/** The existing journal writes estimatedUsd only in the post-response onUsage
 * callback. Failed or uncertain transport leaves it absent; missing provider
 * usage is recorded as the original reservation. Never release a reserve merely
 * because an article was rejected or a phase ended. */
export function miAccountedUsd(r:MiPaidRequest):number {
  if(!r||!Number.isFinite(r.reservedUsd)||r.reservedUsd<=0||
    (r.estimatedUsd!==undefined&&(!Number.isFinite(r.estimatedUsd)||r.estimatedUsd<0)))
    throw Error('Invalid paid request record; refusing new paid requests');
  return r.estimatedUsd!==undefined&&r.estimatedUsd>0?r.estimatedUsd:r.reservedUsd;
}

/** Legacy exported name retained for callers. Includes reconciled estimates and
 * unresolved reservations, not the gross sum of past preflight reservations. */
export function miReservedKrw(requests:readonly MiPaidRequest[], safetyKrwPerUsd:number):number {
  if(!Number.isFinite(safetyKrwPerUsd)||safetyKrwPerUsd<=0||!Array.isArray(requests))
    throw Error('Verified FX and well-formed paid request history required');
  return requests.reduce((sum,r)=>{
    const next=sum+Math.ceil(miAccountedUsd(r)*safetyKrwPerUsd);
    if(!Number.isSafeInteger(next))throw Error('Invalid paid request accounting total');
    return next;
  },0);
}

export function requireMiMonthlyRoom(
  limitKrw:number, historicalKrw:number, todayRequests:readonly MiPaidRequest[],
  nextUsd:number, safetyKrwPerUsd:number
):number {
  if(!Number.isFinite(limitKrw)||limitKrw<=0||!Number.isFinite(historicalKrw)||historicalKrw<0||
     !Number.isFinite(nextUsd)||nextUsd<=0)throw Error('Invalid monthly AI spending authorization');
  const requested=Math.ceil(nextUsd*safetyKrwPerUsd);
  const projected=historicalKrw+miReservedKrw(todayRequests,safetyKrwPerUsd)+requested;
  if(!Number.isSafeInteger(requested)||!Number.isSafeInteger(projected))throw Error('Invalid monthly AI spending authorization');
  if(projected>limitKrw)throw Error('Market Intelligence monthly estimated spending reservation limit reached; previous publications retained');
  return requested;
}

/** Read all earlier days of the same KST month. Treat absence as no daily run;
 * any malformed record or storage outage blocks new spending instead. */
export async function previousMonthMiKrw(
  day:string, safetyKrwPerUsd:number,
  read:(key:string)=>Promise<Uint8Array>
):Promise<number> {
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day))
    throw Error('KST day required for monthly budget');
  const month=day.slice(0,7),today=Number(day.slice(8));
  let sum=0;
  for(let date=1;date<today;date++){
    const previousDay=`${month}-${String(date).padStart(2,'0')}`;
    let bytes:Uint8Array;
    try{bytes=await read(`control/paid-daily/${previousDay}.json`);}
    catch(e){if(/HTTP 404\s*$/.test(String((e as Error)?.message||'')))continue;throw e;}
    let record:MiDailySpend;
    try{record=JSON.parse(Buffer.from(bytes).toString('utf8'));}
    catch{throw Error('Malformed prior paid spending journal; no new requests');}
    if(record?.version!==2||record?.day!==previousDay||!Array.isArray(record.requests))
      throw Error('Invalid prior paid spending journal identity; no new requests');
    sum+=miReservedKrw(record.requests,safetyKrwPerUsd);
  }
  return sum;
}
