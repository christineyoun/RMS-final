/** Formatting and closed-domain linguistic equivalences only. Never erase a
 * cause, negation, direction, location, qualifier, numerical value or unit. */
export function splitAnalysisStatements(text:string):string[]{
 const result:string[]=[];let start=0;
 for(const m of text.matchAll(/[.!?]\s+(?=[가-힣A-Z0-9])/g)){
  const end=m.index!+1;
  if(text[end-1]==='.'&&/(?:\b[A-Z]\.){1,4}$|\b(?:Mr|Dr|No|Inc|Ltd)\.$/.test(text.slice(0,end)))continue;
  result.push(text.slice(start,end).trim());start=m.index!+m[0].length;
 }
 result.push(text.slice(start).trim());return result.filter(Boolean);
}
export function factualLanguage(text:string):string {
 return text.normalize('NFKC').replace(/(?:이며|이고),$/,'입니다.')
  .replace(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/g,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
  .replace(/(20\d{2}\/\d{2,4})년/g,'$1')
  .replace(/U\.S\. Wheat Associates/gi,'미국소맥협회')
  .replace(/FOB\s+Bangkok/gi,'FOB 방콕')
  .replace(/\bDecember\b/g,'12월물')
  .replace(/DE·FR·NL·DK/g,'독일·프랑스·네덜란드·덴마크')
  .replace(/타피오카\s*전분/g,'타피오카전분').replace(/원료\s*감자/g,'원료감자')
  .replace(/(?<![가-힣])밀(?![가-힣])/g,'소맥')
  .replace(/(생산|수출|소비)량/g,'$1')
  .replace(/(가격|생산|수출|소비|기말재고)(?:은|는|이|가)?\s+(.+?)(?:으로|로)\s*(?:전망됩니다|전망했습니다|전망됐습니다)/g,'$1 전망 $2')
  .replace(/(상승|하락|증가|감소|상향|하향)(?:하였습니다|했습니다|하였다고|했다고|하였다|했다|한 것으로 나타났습니다|한 것으로 집계됐습니다)/g,'$1')
  .replace(/(?:에 따르면|에 의하면|에서 발표한|에서 제시한)/g,' ')
  .replace(/(?:으로|로)?\s*(?:관측됐습니다|관측되었습니다|관측했습니다|공표됐습니다|공표되었습니다|집계됐습니다|제시됐습니다|제시했습니다|전망됐습니다|전망됩니다)/g,' ')
  .replace(/선물\s*관측\s*가격|선물\s*관측가/g,'선물 관측')
  .replace(/(\d)\s+(톤(?!당)|MT|USD|MYR|부셸)/g,'$1$2')
  .replace(/\s+/g,' ').trim();
}
