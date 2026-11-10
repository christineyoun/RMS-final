/** Pure evidence guard for an independent Brent quote update. No network or writes. */
export const YAHOO_BRENT_URL='https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=1mo';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
const quoteOf=v=>v?.quoteDisplay;

export function planBrentQuoteUpdate(latest, saved, publication, now=new Date()) {
  if(!publication||publication.version!==1||!publication.data?.energy||!saved)
    throw Error('Saved Brent publication and energy record are required');
  const q=quoteOf(latest),t=stamp(q?.observationDate),nowMs=now.getTime();
  if(latest?.benchmark!=='BZ=F'||latest?.unit!=='USD/bbl'||latest?.sourceUrl!==YAHOO_BRENT_URL||
     !positive(latest?.currentPrice)||!positive(q?.price)||t===null||t>nowMs+60_000||
     q?.comparisonBasis!=='provider-reported-quote-change'&&q?.comparisonBasis!=='quote-change-unverified')
     throw Error('No valid, timestamped Yahoo BZ=F market quote; saved data retained');
  if(q.comparisonBasis==='provider-reported-quote-change' && !Number.isFinite(q.pctChange))
     throw Error('Source-reported Brent change is not numerically valid');
  const savedQuote=quoteOf(saved),publishedQuote=quoteOf(publication.data.energy);
  const previousTimes=[stamp(savedQuote?.observationDate),stamp(publishedQuote?.observationDate)].filter(v=>v!==null);
  if(previousTimes.some(v=>t<v))throw Error('Yahoo quote is older than an already published observation');
  // A revision to a quote at the same timestamp is ambiguous; do not silently replace evidence.
  if(previousTimes.some(v=>t===v)&&
    [savedQuote,publishedQuote].some(old=>old?.observationDate===q.observationDate &&
      (old.price!==q.price||old.pctChange!==q.pctChange)))
    throw Error('Same-timestamp Yahoo quote differs from saved evidence; manual review required');
  const isSame=q.observationDate===savedQuote?.observationDate &&
               q.observationDate===publishedQuote?.observationDate &&
               q.price===savedQuote.price && q.price===publishedQuote.price &&
               q.pctChange===savedQuote.pctChange && q.pctChange===publishedQuote.pctChange;
  return {shouldWrite:!isSame,latestQuote:q.price,changePercent:q.pctChange??null,
    observationDate:q.observationDate,previousObservationDate:publishedQuote?.observationDate||null};
}

export function brentOnlyPublication(previous,saved,nowIso,revision){
  if(previous?.version!==1||!previous?.data?.energy||!revision||!Number.isFinite(Date.parse(nowIso)))
    throw Error('Cannot create a safe Brent-only publication');
  return {...previous,revision,publishedAt:nowIso,lastCheckedAt:nowIso,
    data:{...previous.data,energy:saved}};
}
