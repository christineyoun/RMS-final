import type {HTMLAttributes} from 'react';

export type SourceEntry={label:string;url?:string;description?:string};
/** Presentation only: callers retain their verified URLs and publisher identities. */
export function SourceAttribution({entries,className='',...props}:{entries:SourceEntry[]}&HTMLAttributes<HTMLDivElement>){
 const sources=entries.filter((s,i,all)=>s.label&&all.findIndex(t=>s.url?t.url===s.url:!t.url&&t.label===s.label)===i);
 const publisher=(s:SourceEntry)=>s.url?<a href={s.url} target="_blank" rel="noopener noreferrer" aria-description={s.description} className="hover:underline hover:text-[#DF0029] transition-colors">{s.label.replace(/\s*↗$/,'')}{'\u00a0'}↗</a>:<span>{s.label.replace(/\s*↗$/,'')}</span>;
 return <div {...props} className={'rms-source rms-source-group '+className}>{sources.map((s,i)=><span className="rms-source-entry" key={s.url+'|'+s.label}>{i===0?<span>출처: </span>:<span aria-hidden="true">· </span>}{publisher(s)}</span>)}</div>;
}
