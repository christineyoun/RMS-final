/** Presentation only: no factual paraphrase, date substitution or saved-data mutation. */
export function formalAiText(text:string):string {
 if(/원문 인용:/.test(text))return text;
 const endings:Record<string,string>={'한다':'합니다','했다':'했습니다','된다':'됩니다','됐다':'됐습니다','있다':'있습니다','없다':'없습니다','이다':'입니다','하세요':'하십시오'};
 // Preserve quoted source wording. Only a small set of unambiguous sentence endings changes.
 return String(text||'').split(/([“"‘'][^”"’']*[”"’'])/g).map((part,i)=>i%2?part:part.replace(/(한다|했다|된다|됐다|있다|없다|이다|하세요)\.(?=\s|$)/g,(_,ending)=>endings[ending]+'.')).join('');
}
export function aiEvidenceDateLabel(generatedAt?:string,dates:string[]=[]):string {
 const valid=(value:string)=>Number.isFinite(Date.parse(value));
 const observed=[...new Set(dates.filter(d=>typeof d==='string'&&valid(d)).map(d=>d.slice(0,10)))].sort();
 return [generatedAt&&valid(generatedAt)?'분석 작성 '+generatedAt.slice(0,10):'',observed.length?'근거 기준 '+observed[0]+(observed.length>1?'–'+observed.at(-1):''):''].filter(Boolean).join(' · ');
}
