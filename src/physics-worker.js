import {forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY} from 'd3-force';
let sim, nodes=[], generation=0, paused=false, settings, links=[], signature='';
const held=new Set();
let quietTicks=0;
const intensity=()=>settings.intensity??.6;
function emit(settled=false){
 const positions=new Float32Array(nodes.length*2);
 nodes.forEach((n,i)=>{positions[2*i]=n.x;positions[2*i+1]=n.y;});
 postMessage({type:'positions',generation,positions,settled},[positions.buffer]);
}
// Reserve a node and its title as one rectangle; x sweep limits nearby pairs.
function labelCollision(){
 const sorted=nodes.slice().sort((a,b)=>(a.x+a.vx-a.labelHalf)-(b.x+b.vx-b.labelHalf));
 for(let i=0;i<sorted.length;i++){
  const a=sorted[i];
  for(let j=i+1;j<sorted.length;j++){
   const b=sorted[j],dx=b.x+b.vx-a.x-a.vx,dy=b.y+b.vy-a.y-a.vy;
   if(b.x+b.vx-b.labelHalf>a.x+a.vx+a.labelHalf)break;
   const ox=a.labelHalf+b.labelHalf-Math.abs(dx),oy=a.labelHeight+b.labelHeight-Math.abs(dy);
   if(ox<=0||oy<=0)continue;
   const sx=dx<0?-1:1,sy=dy<0?-1:1;
   if(ox<oy){const push=ox*.5;if(a.fx==null)a.vx-=sx*push;if(b.fx==null)b.vx+=sx*push;}
   else {const push=oy*.5;if(a.fy==null)a.vy-=sy*push;if(b.fy==null)b.vy+=sy*push;}
  }
 }
}
function configure(){
 sim.velocityDecay(settings.damping).alphaDecay(settings.cooling)
  .force('charge',forceManyBody().strength(n=>(n.degree===0?-settings.repulsion*.15:-settings.repulsion*(1+Math.min(4,Math.sqrt(n.degree||0))))).theta(.9))
  .force('link',forceLink(links.map(l=>({...l}))).id(n=>n.id).distance(l=>settings.distance+(l.source.radius||0)+(l.target.radius||0)).strength(settings.spring))
  .force('center',forceCenter(0,0).strength(settings.center))
  .force('x',forceX().strength(settings.center*.05)).force('y',forceY().strength(settings.center*.05))
  .force('collide',forceCollide(n=>n.radius).strength(.7).iterations(2))
  .force('labels',labelCollision);
}
function wake(alpha){quietTicks=0;sim.alpha(Math.max(sim.alpha(),alpha)).alphaTarget(held.size?.3*intensity():0);if(!paused)sim.restart();}
onmessage=({data:m})=>{
 if(m.type==='init'){
  const nextSignature=JSON.stringify([m.nodes.map(n=>[n.id,n.radius,n.degree,n.labelWidth]),m.links,m.settings]);
  if(sim && signature===nextSignature && !held.size){generation=m.generation;paused=m.paused;emit(sim.alpha()<sim.alphaMin());if(paused)sim.stop();else if(sim.alpha()>=sim.alphaMin())sim.restart();return;}
  signature=nextSignature;
  const previous=new Map(nodes.map(n=>[n.id,n]));
  generation=m.generation;settings=m.settings;paused=m.paused;held.clear();
  nodes=m.nodes.map((n,i)=>{
   const old=previous.get(n.id);
   const angle=i*Math.PI*(3-Math.sqrt(5)),r=12*Math.sqrt(i+.5);
   return {...n,labelHalf:Math.max(n.radius||24,((n.labelWidth||0)+20)/.5/2),labelHeight:(Math.max(5.5,Math.min(24,Math.sqrt(n.degree||0)*3.3))+18)/.5,index:i,x:old?.x??n.x??Math.cos(angle)*r,y:old?.y??n.y??Math.sin(angle)*r,vx:old?.vx??0,vy:old?.vy??0};
  });
  links=m.links;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  for(const l of links){for(const [id,other] of [[l.source,l.target],[l.target,l.source]]){
   if(!previous.has(id)&&previous.has(other)){const n=byId.get(id),p=previous.get(other);n.x=p.x+12*Math.cos(n.index||0);n.y=p.y+12*Math.sin(n.index||0);}
  }}

  sim?.stop();sim=forceSimulation(nodes).stop();configure();
  const fresh=!nodes.some(n=>previous.has(n.id));
  if(fresh){sim.alpha(.8);sim.tick(150);
   nodes.forEach(n=>{n.vx*=.2;n.vy*=.2;});sim.alpha(.08*intensity());}

  sim.on('tick',()=>{
   const slow=!held.size && sim.alpha()<.04 && nodes.every(n=>Math.hypot(n.vx,n.vy)<.12);
   quietTicks=slow?quietTicks+1:0;
   if(quietTicks>=12){sim.alpha(0);nodes.forEach(n=>{n.vx=0;n.vy=0;});}
   else emit();
  }).on('end',()=>emit(true));
  emit();wake(fresh?.08*intensity():.18*intensity());return;
 }
 if(m.generation!==generation||!sim)return;
 if(m.type==='pin'){
  const n=nodes[m.index];if(!n)return;
  n.fx=n.x=m.x;n.fy=n.y=m.y;held.add(m.index);wake(.3*intensity());
 }else if(m.type==='release'){
  const n=nodes[m.index];if(n){n.fx=null;n.fy=null;}held.delete(m.index);wake(.3*intensity());
  postMessage({type:'released',generation,index:m.index,token:m.token});
 }else if(m.type==='configure'){settings=m.settings;configure();wake(.3*intensity());}
 else if(m.type==='pause'||m.type==='stop'){paused=true;sim.stop();}
 else if(m.type==='resume'){paused=false;if(sim.alpha()>=sim.alphaMin())sim.restart();else emit(true);}
};
