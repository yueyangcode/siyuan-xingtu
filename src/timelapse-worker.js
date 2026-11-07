import {forceSimulation, forceLink, forceManyBody, forceX, forceY} from 'd3-force';

let simulation, nodes = [], generation = 0, paused = false, last = 0;
function emit(settled = false) {
  const now = performance.now();
  if (!settled && now - last < 30) return;
  last = now;
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => { positions[i * 2] = n.x; positions[i * 2 + 1] = n.y; });
  postMessage({type:'positions', generation, positions, settled}, [positions.buffer]);
}
function options(o) {
  simulation.force('links', forceLink().id(n => n.id).distance(Math.max(30, o.linkDistance)).strength(.18))
    .force('charge', forceManyBody().strength(-900).theta(.9))
    .force('x', forceX(0).strength(.012)).force('y', forceY(0).strength(.012));
}
onmessage = ({data:m}) => {
  if (m.type === 'init') {
    const previous = new Map(nodes.map(n => [n.id,n]));
    generation = m.generation;paused=m.paused===true;
    nodes = m.ids.map((id,i) => previous.get(id) || {id, x:Math.cos(i*2.4)*Math.sqrt(i+1)*60, y:Math.sin(i*2.4)*Math.sqrt(i+1)*60});
    const index = new Map(nodes.map(n => [n.id,n]));
    const ranks = new Map(m.ids.map((id,i)=>[id,i]));
    for (const l of m.links) {
      if (!previous.has(l.target) && previous.has(l.source)) {
        const n=index.get(l.target), p=index.get(l.source), i=ranks.get(l.target);
        n.x=p.x+Math.cos(i*2.4)*60; n.y=p.y+Math.sin(i*2.4)*60;
      }
    }
    simulation?.stop();
    simulation = forceSimulation(nodes).stop().alphaDecay(.045).velocityDecay(.32);
    options(m.options);
    simulation.force('links').links(m.links.map(l=>({...l})));
    simulation.on('tick',()=>emit()).on('end',()=>emit(true));
    if (!paused && nodes.length) simulation.alpha(.65).restart();
    else emit(true);
    return;
  }
  if (m.generation !== generation || !simulation) return;
  if (m.type === 'pin') {
    const n=nodes[m.index]; if(!n)return;
    n.fx=m.x; n.fy=m.y; simulation.alpha(.25);if(!paused)simulation.restart();
  } else if (m.type === 'release') {
    const n=nodes[m.index]; if(n){n.fx=null;n.fy=null;}
    simulation.alpha(.25);if(!paused)simulation.restart();
    postMessage({type:'released',generation,index:m.index,token:m.token});
  } else if (m.type === 'pause' || m.type === 'stop') {
    paused=true; simulation.stop();
  } else if (m.type === 'resume') {
    paused=false;if(simulation.alpha()>=simulation.alphaMin())simulation.restart();
  }
};
