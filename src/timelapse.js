function attachTimelapse(engine) {
  const originalSet=engine.setData, originalLayout=engine.startLayout;
  const panel=engine.container.closest('.sy__graph,.sy__globalGraph');
  const ui=document.createElement('div'); ui.className='og-timelapse';
  ui.innerHTML=`<button data-action="start">Animate</button><div class="og-time-controls" hidden>
    <div class="og-time-row"><button data-action="play">暂停</button><button data-action="replay">重新播放</button>
    <select aria-label="播放速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="5">5×</option></select>
    <select aria-label="播放模式"><option value="date">真实日期</option><option value="count">均匀节点</option></select><input type="date" aria-label="查看日期">
    <button data-action="close" title="退出动画，恢复当前完整图谱">退出</button></div>
    <input type="range" min="0" max="1000" value="0" step="1" aria-label="时间轴">
    <div class="og-time-status" role="status"></div><small>按文档创建时间重建 · 连线为当前引用关系，并非历史快照</small></div>`;
  panel.append(ui);
  const start=ui.querySelector('[data-action=start]'), controls=ui.querySelector('.og-time-controls');
  const play=ui.querySelector('[data-action=play]'), slider=ui.querySelector('input[type=range]'), dateInput=ui.querySelector('input[type=date]');
  const speed=ui.querySelector('[aria-label="播放速度"]'), mode=ui.querySelector('[aria-label="播放模式"]');
  const status=ui.querySelector('.og-time-status');
  let source, ordered=[], links=[], worker, url, active=false, playing=false, progress=0;
  let raf=0, last=0, lastApply=0, count=-1, disposed=false, request=0, abort;
  let min=0,max=0,missing=0;
  const births=new Map();
  engine.__graphTimelapse={births,get active(){return active;}};
  function snapshot() {
    if(!engine.data)return null;
    return [engine.data.nodes.map(n=>({...n})),engine.data.links.map(l=>({from:engine.data.nodes[l.source].id,to:engine.data.nodes[l.target].id,ref:l.ref})),{...engine.options},{...engine.palette},{}];
  }
  function pause() { playing=false;cancelAnimationFrame(raf);raf=0;play.textContent='播放'; }
  function stopWorker() { worker?.terminate();if(engine.layoutWorker===worker)engine.layoutWorker=undefined;worker=null;if(url)URL.revokeObjectURL(url);url=null; }
  function reset(restore) {
    request++;abort?.abort();pause();active=false;births.clear();stopWorker();
    engine.startLayout=originalLayout;controls.hidden=true;start.hidden=false;start.disabled=false;start.textContent='Animate';
    if(restore && source && !engine.destroyed) originalSet.apply(engine,source);
    source=null;
  }
  engine.setData=function(...args){reset(false);return originalSet.apply(this,args);};
  function startLayout() {
    engine.__ogPreparing=false;engine.baseCanvas.style.opacity='';engine.labelCanvas.style.opacity='';
    if(!worker){
      engine.stopLayout();
      url=URL.createObjectURL(new Blob([TIMELAPSE_WORKER],{type:'text/javascript'}));worker=new Worker(url);engine.layoutWorker=worker;
      worker.onmessage=({data:m})=>{
        if(!active || m.generation!==engine.generation)return;
        if(m.type==='released'){
          if(engine.pendingNodeReleases.get(m.index)===m.token){engine.pendingNodeReleases.delete(m.index);engine.pinnedNodes.delete(m.index);}return;
        }
        if(m.positions.length!==engine.positions.length)return;
        engine.pinnedNodes.forEach((p,i)=>{m.positions[i*2]=p[0];m.positions[i*2+1]=p[1];});
        engine.positions=m.positions;engine.positionVersion++;engine.scheduleRender();
      };
      worker.onerror=()=>{reset(true);start.textContent='动画布局失败，点击重试';};
    }
    engine.generation++;
    worker.postMessage({type:'init',generation:engine.generation,ids:engine.data.nodes.map(n=>n.id),
      links:engine.data.links.map(l=>({source:engine.data.nodes[l.source].id,target:engine.data.nodes[l.target].id})),options:engine.options,paused:document.hidden||engine.width<1||engine.height<1});
    engine.autoFitPending=false;
  }
  function dateText(t){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function cutoff(){return min-1+progress*(max-min+1);}
  function apply() {
    if(!active)return;
    let n;
    if(mode.value==='count')n=Math.floor(progress*ordered.length);
    else {const t=cutoff();let lo=0,hi=ordered.length;while(lo<hi){const mid=(lo+hi)>>>1;if(ordered[mid].time<=t)lo=mid+1;else hi=mid;}n=lo;}
    if(progress===1)n=ordered.length;
    if(n!==count){
      const nodes=ordered.slice(0,n).map(x=>x.node), ids=new Set(nodes.map(x=>x.id));
      const now=performance.now();nodes.forEach(node=>{if(!births.has(node.id))births.set(node.id,now);});
      for(const id of births.keys())if(!ids.has(id))births.delete(id);
      const currentLinks=links.filter(l=>ids.has(l.from)&&ids.has(l.to));
      const camera={...engine.camera};
      originalSet.call(engine,nodes,currentLinks,source[2],source[3],{});
      engine.focusAnimation++;engine.camera=camera;engine.cameraTouched=true;engine.autoFitPending=false;
      count=n;
    }
    slider.value=String(Math.round(progress*1000));
    const date=mode.value==='date'?cutoff():(count?ordered[count-1].time:min-1);
    dateInput.value=dateText(date);
    status.textContent=`${count?dateText(date):'开始前'} · ${count} 节点 · ${engine.data.links.length} 连线${missing?` · ${missing} 个节点无创建时间，已排除`:''}`;
  }
  function tick(now){
    if(!playing||disposed||engine.destroyed){pause();return;}
    if(document.hidden || engine.width<1 || engine.height<1){pause();return;}
    const elapsed=Math.min(100,now-last);last=now;
    progress=Math.min(1,progress+elapsed/30000*Number(speed.value));
    if(now-lastApply>=100 || progress===1){if(!engine.pointerAction){apply();lastApply=now;}}
    if(progress===1){pause();apply();return;}
    raf=requestAnimationFrame(tick);
  }
  function resume(){if(!active)return;if(progress>=1){progress=0;apply();}playing=true;play.textContent='暂停';last=performance.now();raf=requestAnimationFrame(tick);}
  async function begin(){
    reset(false);source=snapshot();if(!source?.[0].length){start.textContent='当前图谱为空';return;}
    const token=++request;abort=new AbortController();start.disabled=true;start.textContent='读取创建时间…';
    try{
      const times=new Map(), ids=source[0].map(n=>n.id).filter(id=>/^\d{14}-[a-z0-9]{7}$/.test(id));
      for(let i=0;i<ids.length;i+=128){
        const list=ids.slice(i,i+128).map(id=>`'${id}'`).join(',');
        const response=await fetch('/api/query/sql',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)]),
          body:JSON.stringify({stmt:`SELECT b.id, d.created FROM blocks b JOIN blocks d ON d.id=b.root_id WHERE b.id IN (${list}) LIMIT 128`})});
        if(!response.ok)throw Error(`HTTP ${response.status}`);
        const result=await response.json();if(result.code!==0 || !Array.isArray(result.data))throw Error(result.msg||'创建时间查询失败');
        for(const row of result.data){
          const s=String(row.created);if(!/^\d{14}$/.test(s))continue;
          const d=new Date(Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8)),Number(s.slice(8,10)),Number(s.slice(10,12)),Number(s.slice(12,14)));
          if(Number.isFinite(+d)&&d.getFullYear()===Number(s.slice(0,4))&&d.getMonth()+1===Number(s.slice(4,6))&&d.getDate()===Number(s.slice(6,8)))times.set(row.id,+d);
        }
      }
      if(disposed||token!==request)return;
      ordered=source[0].filter(n=>times.has(n.id)).map(node=>({node,time:times.get(node.id)})).sort((a,b)=>a.time-b.time||a.node.id.localeCompare(b.node.id));
      missing=source[0].length-ordered.length;if(!ordered.length)throw Error('没有可用的文档创建时间');
      links=source[1];min=ordered[0].time;max=ordered[ordered.length-1].time;
      active=true;count=-1;progress=0;engine.startLayout=startLayout;
      engine.camera={scale:Math.min(.8,Math.min(engine.width,engine.height)*.4/(Math.sqrt(ordered.length)*100+200)),x:engine.width/2,y:engine.height/2};
      dateInput.min=dateText(min);dateInput.max=dateText(max);
      start.hidden=true;start.disabled=false;controls.hidden=false;apply();resume();
    }catch(error){if(token===request){reset(true);start.textContent=`读取失败：${error.message}（点击重试）`;}}
  }
  start.onclick=begin;
  play.onclick=()=>playing?pause():resume();
  ui.querySelector('[data-action=replay]').onclick=()=>{pause();progress=0;apply();resume();};
  ui.querySelector('[data-action=close]').onclick=()=>reset(true);
  slider.oninput=()=>{pause();progress=Number(slider.value)/1000;apply();};
  dateInput.onchange=()=>{if(!dateInput.value)return;pause();const date=new Date(dateInput.value+'T23:59:59');if(!Number.isFinite(+date))return;mode.value='date';progress=Math.max(0,Math.min(1,(+date-min+1)/(max-min+1)));apply();};
  mode.onchange=()=>{pause();progress=0;apply();};
  const visibility=()=>{const hidden=document.hidden||engine.container.clientWidth<1||engine.container.clientHeight<1;if(hidden)pause();if(worker)worker.postMessage({type:hidden?'pause':'resume',generation:engine.generation});};document.addEventListener('visibilitychange',visibility);
  const resize=new ResizeObserver(visibility);resize.observe(engine.container);
  return {get state(){return {active,playing,progress,count,total:ordered.length,missing,mode:mode.value};},dispose(){if(disposed)return;disposed=true;resize.disconnect();reset(true);engine.setData=originalSet;delete engine.__graphTimelapse;document.removeEventListener('visibilitychange',visibility);ui.remove();}};
}
