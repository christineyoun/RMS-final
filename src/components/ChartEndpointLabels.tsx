import React,{useLayoutEffect,useRef,useState} from 'react';
import {layoutEndpointLabels} from '../utils/chartEndpointLabels';

export type ChartEndpointLabel={id:string;text:string;color:string;xPct:number;yPct:number};
const badgeClass='text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-sm';

/** Original floating badge style, shared by the multi-series charts only. */
export function ChartEndpointLabels({labels}:{labels:ChartEndpointLabel[]}){
  const root=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0,boxes:[] as {id:string;width:number;height:number}[]});
  const signature=JSON.stringify(labels);
  useLayoutEffect(()=>{
    const layer=root.current;if(!layer)return;let disposed=false;
    const measure=()=>{
      if(disposed)return;
      const boxes=[...layer.querySelectorAll<HTMLElement>('[data-chart-endpoint-label]')].map(e=>({id:e.dataset.chartEndpointLabel!,width:e.offsetWidth,height:e.offsetHeight}));
      // Layout pixels prevent transforms/page zoom from scaling offsets twice.
      const next={width:layer.clientWidth,height:layer.clientHeight,boxes};
      setSize(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(layer);
    layer.querySelectorAll<HTMLElement>('[data-chart-endpoint-label]').forEach(e=>observer.observe(e));
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
    void document.fonts?.ready.then(measure);
    return ()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
  },[signature]);
  const valid=labels.filter(label=>Number.isFinite(label.xPct)&&Number.isFinite(label.yPct));
  const positioned=layoutEndpointLabels(valid.map(label=>({...size.boxes.find(b=>b.id===label.id),id:label.id,anchorX:label.xPct*size.width/100,anchorY:label.yPct*size.height/100})) as Parameters<typeof layoutEndpointLabels>[0],size);
  return <div ref={root} data-chart-endpoint-layer className="absolute inset-0 pointer-events-none z-10">
    <svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
      {positioned.map(box=>{const label=valid.find(l=>l.id===box.id)!;const x=label.xPct*size.width/100,y=label.yPct*size.height/100;
        const end=box.top+box.height<=y?box.top+box.height:box.top;
        return <g key={box.id}>
          <line data-chart-endpoint-connector={box.id} x1={x} y1={y} x2={x} y2={end} stroke={label.color} strokeWidth="1" strokeDasharray="2 2"/>
          <circle data-chart-endpoint-dot={box.id} cx={x} cy={y} r="3.5" fill={label.color} stroke="#ffffff" strokeWidth="1.5"/>
        </g>;})}
    </svg>
    {valid.map(label=>{const box=positioned.find(b=>b.id===label.id);return <span key={label.id} data-chart-endpoint-label={label.id}
      className={'absolute block whitespace-nowrap '+badgeClass} style={{backgroundColor:label.color,left:box?.left??0,top:box?.top??0,
        maxWidth:size.width||undefined,visibility:box?'visible':'hidden'}}>{label.text}</span>;})}
  </div>;
}
