export function recentMarketArticles<T extends {publishedAt?:string}>(
 items:readonly T[],maxAgeDays=30,now=new Date()
):T[]{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const today=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day));
 return items.filter(a=>{
  const m=/^(20\d{2})-(\d{2})-(\d{2})(?:$|T)/.exec(String(a.publishedAt||''));
  if(!m)return false;
  const date=Date.UTC(+m[1],+m[2]-1,+m[3]);
  if(!Number.isFinite(date)||
     new Date(date).toISOString().slice(0,10)!==m[1]+'-'+m[2]+'-'+m[3])
    return false;
  const age=Math.round((today-date)/86400000);
  return age>=0&&age<=maxAgeDays;
 });
}
