export type EndpointBox={id:string;anchorX?:number;anchorY:number;width:number;height:number};
export type PlacedEndpointBox=EndpointBox&{left:number;top:number};

/** Compact, endpoint-aligned badges. No axis gutter or curve-wide avoidance.
 * Prefer the original translateY(-170%) position; only resolve badge/dot collisions. */
export function layoutEndpointLabels(input:EndpointBox[],bounds:{width:number;height:number;padding?:number;gap?:number}):PlacedEndpointBox[]{
  const padding=bounds.padding??1,gap=bounds.gap??2,dotClearance=6;
  const boxes=input.filter(b=>Number.isFinite(b.anchorY)&&b.width>0&&b.height>0)
    .map(b=>({...b,anchorX:b.anchorX??bounds.width,left:Math.max(0,Math.min(bounds.width-b.width,(b.anchorX??bounds.width)-b.width)),
      top:Math.max(padding,Math.min(bounds.height-padding-b.height,b.anchorY-b.height*1.7))}))
    .sort((a,b)=>a.anchorY-b.anchorY||a.id.localeCompare(b.id));
  if(!boxes.length||bounds.width<=0||bounds.height<=0)return [];
  const horizontal=(a:PlacedEndpointBox,b:PlacedEndpointBox)=>a.left<b.left+b.width&&b.left<a.left+a.width;
  const collision=(a:PlacedEndpointBox,b:PlacedEndpointBox)=>horizontal(a,b)&&a.top<b.top+b.height+gap-.001&&b.top<a.top+a.height+gap-.001;
  const allowed=boxes.map(box=>{
    let start=padding;const end=bounds.height-padding-box.height,intervals:number[][]=[];
    const blocked=boxes.filter(dot=>dot.anchorX>=box.left-dotClearance&&dot.anchorX<=box.left+box.width+dotClearance)
      .map(dot=>[dot.anchorY-dotClearance-box.height,dot.anchorY+dotClearance]).sort((a,b)=>a[0]-b[0]);
    for(const [lo,hi] of blocked){if(hi<start)continue;if(lo>start)intervals.push([start,Math.min(end,lo)]);start=Math.max(start,hi);if(start>end)break;}
    if(start<=end)intervals.push([start,end]);return intervals.filter(([lo,hi])=>lo<=hi);
  });
  if(boxes.every((b,i)=>allowed[i].some(([lo,hi])=>b.top>=lo&&b.top<=hi)&&!boxes.slice(i+1).some(other=>collision(b,other))))return boxes;
  // Balanced packing candidates avoid pushing one badge an entire height when
  // a smaller adjustment shared by the colliding pair is possible.
  const balanced:number[]=[];
  for(let start=0;start<boxes.length;start++)for(let end=start;end<boxes.length;end++){
    const offsets:number[]=[];let offset=0;
    for(let i=start;i<=end;i++){offsets.push(offset);offset+=boxes[i].height+gap;}
    const base=boxes.slice(start,end+1).reduce((sum,b,i)=>sum+b.top-offsets[i],0)/(end-start+1);
    offsets.forEach(o=>balanced.push(base+o));
  }
  // A dot or chart boundary can constrain the whole stack. Include positions
  // packed back from that boundary, so the first badge can also move minimally.
  let offsets=new Set([0]);
  for(const box of boxes)offsets=new Set([...offsets,...[...offsets].map(o=>o+box.height+gap)]);
  const edges=allowed.flatMap(intervals=>intervals.flat()).flatMap(edge=>[...offsets].flatMap(o=>[edge-o,edge+o]));
  let best:PlacedEndpointBox[]|undefined,bestCost=Infinity,aboveOnly=true;
  const search=(i:number,current:PlacedEndpointBox[],cost:number)=>{
    if(cost>=bestCost)return;
    if(i===boxes.length){best=current;bestCost=cost;return;}
    const box=boxes[i];
    for(const [lo,intervalEnd] of allowed[i]){
      const hi=aboveOnly?Math.min(intervalEnd,box.anchorY-dotClearance-box.height):intervalEnd;
      if(lo>hi)continue;
      const candidates=[...new Set([lo,hi,box.top,...balanced,...edges,...current.flatMap(b=>[b.top-gap-box.height,b.top+b.height+gap])])]
        .map(top=>Math.max(lo,Math.min(hi,top))).sort((a,b)=>Math.abs(a-box.top)-Math.abs(b-box.top));
      for(const top of candidates){const next={...box,top};if(current.some(other=>collision(next,other)))continue;
        search(i+1,[...current,next],cost+(top-box.top)**2);}
    }
  };
  search(0,[],0);
  // Only a lack of room above (for example at the top boundary) permits below.
  if(!best){aboveOnly=false;search(0,[],0);}
  return best??boxes;
}
