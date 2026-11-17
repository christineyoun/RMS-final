import {createHash} from 'node:crypto';
import path from 'node:path';
import {load} from 'cheerio';
import {readFreeJson,writeFreeJson} from './freeDailyPublication.ts';
import {readThaiStarchExports,TTSA_ANNUAL_EXPORTS,validExportYear,type ThaiStarchExportYear,type ThaiStarchExports} from '../utils/thaiStarchExports.ts';

const savedFile='free-thai-starch-exports.json';
const normalize=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
const asTonnes=(s:string)=>/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s.trim())?Number(s.trim().replaceAll(',','')):NaN;

/** Read product and unit jointly. Do not confuse adjacent value (M.Baht) columns with volumes. */
export function parseThaiStarchExports(html:string,asOf=new Date()):ThaiStarchExports|null {
  const $=load(html),table=$('table#tbl_tpc_export');
  if(table.length!==1)return null;
  const notes=table.next('div').children('p').map((_,p)=>normalize($(p).text())).get();
  if(!notes.includes('source: thai customs department'))return null;
  const header=table.children('thead').children('tr').toArray();
  if(header.length!==3)return null;
  const grid:string[][]=header.map(()=>[]);
  for(const [row,tr] of header.entries()){
    let column=0;
    for(const cell of $(tr).children('th').toArray()){
      while(grid[row][column]!==undefined)column++;
      const width=Number($(cell).attr('colspan')??1),height=Number($(cell).attr('rowspan')??1);
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||column+width>64||row+height>header.length)return null;
      const label=normalize($(cell).text());
      for(let i=row;i<row+height;i++)for(let j=column;j<column+width;j++){
        if(grid[i][j]!==undefined)return null;
        grid[i][j]=label;
      }
      column+=width;
    }
  }
  const size=grid[0].length;
  if(!size||grid.some(row=>row.length!==size||Array.from(row).some(x=>x===undefined)))return null;
  const findColumn=(match:(product:string,unit:string)=>boolean)=>grid[1].flatMap((label,i)=>match(label,grid[2][i])?[i]:[]);
  const year=findColumn((label,unit)=>label==='year'&&unit==='year');
  const columns=(name:RegExp)=>findColumn((label,unit)=>name.test(label)&&/^volume\s*\((?:metric\s+)?ton(?:ne)?s?\)$/.test(unit));
  const native=columns(/^native starch$/),modified=columns(/^mod(?:e)?ified starch$/);
  if([year,native,modified].some(indices=>indices.length!==1))return null;
  const partialYears=new Set(notes.filter(note=>/\b(?:from|through|partial|ytd|to date)\b/.test(note)).flatMap(note=>note.match(/\b(?:19|20)\d{2}\b/g)??[]));
  const seen=new Set<number>(),rows:ThaiStarchExportYear[]=[];
  for(const tr of table.children('tbody').children('tr').toArray()){
    const cells=$(tr).children('td').map((_,cell)=>$(cell).text().trim()).get();
    const y=cells[year[0]];
    if(!y||!/^\d{4}$/.test(y)||partialYears.has(y)||+y>=asOf.getUTCFullYear())continue;
    if(seen.has(+y))return null;
    seen.add(+y);
    if(cells.length!==size)continue;
    const entry={calendarYear:+y,nativeTonnes:asTonnes(cells[native[0]]),modifiedTonnes:asTonnes(cells[modified[0]])};
    if(validExportYear(entry,asOf))rows.push(entry);
  }
  rows.sort((a,b)=>b.calendarYear-a.calendarYear);
  const current=rows[0];
  if(!current)return null;
  const previous=rows.find(row=>row.calendarYear===current.calendarYear-1);
  return {scope:'thailand-tapioca-starch-exports',unit:'tonnes',period:'calendar-year',current,...(previous?{previous}:{}),
    source:{name:'TTSA',authority:'Thai Customs Department',url:TTSA_ANNUAL_EXPORTS,retrievedAt:asOf.toISOString(),sha256:createHash('sha256').update(html).digest('hex')}};
}

export function readSavedThaiStarchExports(root=process.cwd(),now=new Date()){
  return readThaiStarchExports(readFreeJson(savedFile,path.join(root,'.rms-stage3')),now);
}

/** Runs independently of the crop survey and price graph inside the existing free-source runner. */
export async function refreshThaiStarchExports({root=process.cwd(),now=new Date(),fetcher=fetch}:{root?:string;now?:Date;fetcher?:typeof fetch}={}){
  try{
    const response=await fetcher(TTSA_ANNUAL_EXPORTS,{redirect:'error',signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw Error('TTSA annual exports HTTP '+response.status);
    if(response.redirected||response.url&&response.url!==TTSA_ANNUAL_EXPORTS)throw Error('TTSA annual exports publisher mismatch');
    const next=parseThaiStarchExports(await response.text(),now);
    if(!next)throw Error('No verified annual export table');
    const prior=readSavedThaiStarchExports(root);
    if(prior){
      if(prior.current.calendarYear>next.current.calendarYear||prior.source.retrievedAt>next.source.retrievedAt||
        prior.current.calendarYear===next.current.calendarYear&&prior.previous&&!next.previous)
        return {data:prior,lastError:'TTSA annual export response is older or incomplete'};
      if(JSON.stringify([prior.current,prior.previous])===JSON.stringify([next.current,next.previous]))return {data:prior};
    }
    writeFreeJson(savedFile,next,path.join(root,'.rms-stage3'));
    return {data:next};
  }catch(error){return {data:readSavedThaiStarchExports(root),lastError:error instanceof Error?error.message:'TTSA annual exports unavailable'};}
}
