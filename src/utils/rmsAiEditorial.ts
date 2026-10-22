import overlays from '../data/rmsAiEditorialOverlays.json';

export type EditorialFields = {
  deskRecommendation:string; executiveSummary?:string;
  bullishFactors:string[]; bearishFactors:string[]; watchItems:string[];
};

/** Presentation only. Exact source identity and every original display field
 * must match; future/revised reports fail closed to their own original prose.
 * Source snapshots and Gemini responses are never written by this module. */
export function rmsAiEditorial(commodity:string|undefined,generatedAt:string|undefined,
  sources:Array<{title?:string;url:string}>,fields:EditorialFields) {
  const entry=overlays.entries.find(e=>e.commodity===commodity && e.snapshot.generatedAt===generatedAt);
  const sameSources=entry && sources.length===entry.sources.length &&
    sources.every((s,i)=>s.url===entry.sources[i].url && s.title===entry.sources[i].title);
  const matches=entry && sameSources && (Object.keys(entry.original) as Array<keyof EditorialFields>)
    .every(k=>JSON.stringify(fields[k])===JSON.stringify(entry.original[k]));
  return matches ? {fields:entry.revised,editorial:entry.review.version,snapshot:entry.snapshot} : {fields,editorial:null,snapshot:null};
}
