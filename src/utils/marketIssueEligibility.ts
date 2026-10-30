/** Eligibility only; factual/source verification still belongs to the server. */
export function eligibleMarketIssue(article:any,now=Date.now()):boolean{
 const date=Date.parse(article?.publishedAt),age=now-date;
 if(article?.unavailable||!Number.isFinite(date)||age<0||age>14*86400000)return false;
 try{
  const u=new URL(article.originalUrl);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   !/(^|\.)(?:blogspot\.com|wordpress\.com|medium\.com|substack\.com|tistory\.com|reddit\.com|quora\.com|dcinside\.com)$/.test(u.hostname)&&
   !/^(?:blog|cafe)\.naver\.com$/.test(u.hostname)&&
   !/blog|community|social|anonymous/i.test(article.sourceType||'');
 }catch{return false;}
}
