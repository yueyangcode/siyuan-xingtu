function attachPhysics(engine){
 const original=engine.startLayout, originalSet=engine.setData;
 const titles=new Map(),titleSources=new Map(),titleAbort=new AbortController();let loadingTitles=false;
 const defaults=Config.defaults;
 let config=Config.normalize(bridge.readConfig());
 const fields=[['intensity','物理动画强度',.1,1,.05],['labelZoom','普通标签显示缩放',.2,2,.05],['repulsion','节点排斥力',10,2000,10],['distance','连接距离',30,400,5],['spring','弹簧强度',.01,1,.01],['damping','运动阻尼',.1,.9,.01],['cooling','冷却速度',.005,.08,.005],['center','中心力',0,.2,.01]];
 for(const [k,,min,max] of fields)config[k]=Number.isFinite(config[k])?Math.max(min,Math.min(max,config[k])):defaults[k];
 if(config.labelZoom===.65)config.labelZoom=.2;
 config.enabled=config.enabled!==false;config.labels=config.labels!==false;config.showIsolated=config.showIsolated!==false;engine.__ogVisual=config;
 const ui=document.createElement('details');ui.className='og-physics';
 ui.innerHTML='<summary aria-label="图谱显示与物理设置" title="图谱显示与物理设置"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6M16 9v6M10 15v6"/></svg></summary><label><input type="checkbox" style="width:auto" data-key="enabled"> 启用弹簧动画</label>'+fields.map(([k,label,min,max,step])=>`<label style="display:block">${label} <output data-value="${k}"></output><input aria-label="${label}" data-key="${k}" type="range" min="${min}" max="${max}" step="${step}"></label>`).join('')+'<label><input type="checkbox" style="width:auto" data-key="labels"> 显示标签</label><label><input type="checkbox" style="width:auto" data-key="showIsolated"> 显示孤立节点</label><label><input type="checkbox" style="width:auto" data-key="labelAvoidance"> 标签位置避让</label><button type="button">恢复推荐参数</button><small role="status"></small>';
 engine.container.closest('.sy__graph,.sy__globalGraph').append(ui);
 let worker,url,disposed=false,viewReady=false,preparing=false;const remembered=new Map();
 function release(){worker?.terminate();if(engine.layoutWorker===worker)engine.layoutWorker=undefined;worker=null;if(url)URL.revokeObjectURL(url);url=null;}
 function syncUI(){engine.__ogVisual=config;engine.scheduleRender();ui.querySelectorAll('[data-key]').forEach(input=>{const k=input.dataset.key;if(input.type==='checkbox')input.checked=config[k];else{input.value=config[k];ui.querySelector(`[data-value="${k}"]`).textContent=config[k];}});}
 function initialView(){
  engine.fit(false);
  if(engine.camera.scale<.5){
   const index=engine.selected>=0?engine.selected:engine.data.nodes.reduce((best,n,i)=>n.degree>engine.data.nodes[best].degree?i:best,0);
   engine.camera.scale=.5;engine.camera.x=engine.width/2-engine.positions[index*2]*.5;engine.camera.y=engine.height/2-engine.positions[index*2+1]*.5;
  }
  engine.__ogResetReference=true;
 }
 function start(){
  if(disposed||engine.destroyed)return;
  engine.__ogPhysicsEnabled=config.enabled;
  if(!config.enabled){preparing=false;engine.__ogPreparing=false;engine.baseCanvas.style.opacity='';engine.labelCanvas.style.opacity='';release();engine.stopLayout();engine.autoFitPending=false;engine.__ogPhysicsSettled=true;engine.scheduleRender();return;}
  if(!engine.data?.nodes.length){release();return;}
  const missing=engine.data.nodes.filter(n=>['d','NodeDocument'].includes(n.type) && /(?:\.{3}|…)$/.test(n.label||'') && /^\d{14}-[a-z0-9]{7}$/.test(n.id) && !titles.has(n.id));
  if(loadingTitles)return;
  if(missing.length){
   for(const n of missing)titleSources.set(n.id,n.label);
   loadingTitles=true;preparing=true;engine.__ogPreparing=true;engine.baseCanvas.style.opacity='0';engine.labelCanvas.style.opacity='0';release();
   (async()=>{
    try{
     for(let offset=0;offset<missing.length;offset+=128){
      const ids=missing.slice(offset,offset+128).map(n=>`'${n.id}'`).join(',');
      const response=await fetch('/api/query/sql',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([titleAbort.signal,AbortSignal.timeout(15000)]),body:JSON.stringify({stmt:`SELECT id,content FROM blocks WHERE type='d' AND id IN (${ids}) LIMIT 128`})});
      const result=await response.json();if(!response.ok||result.code!==0)throw Error('title lookup');
      for(const row of result.data||[])if(typeof row.content==='string')titles.set(row.id,row.content);
     }
    }catch{if(!disposed)ui.querySelector('small').textContent='完整标题读取失败，暂用原生图谱名称';}
    finally{for(const n of missing)if(!titles.has(n.id))titles.set(n.id,n.label);loadingTitles=false;if(!disposed&&!engine.destroyed)start();}
   })();return;
  }
  let changed=false;
  for(const n of engine.data.nodes){const title=titles.get(n.id);if(title && n.label!==title){n.label=title;changed=true;}}
  if(changed)engine.geometryVersion++;

  if(!worker||engine.layoutWorker!==worker){
   release();engine.stopLayout();url=URL.createObjectURL(new Blob([PHYSICS_WORKER],{type:'text/javascript'}));
   worker=new Worker(url);engine.layoutWorker=worker;
   worker.onmessage=({data:m})=>{
    if(disposed||engine.destroyed||m.generation!==engine.generation)return;
    if(m.type==='released'){if(engine.pendingNodeReleases.get(m.index)===m.token){engine.pendingNodeReleases.delete(m.index);engine.pinnedNodes.delete(m.index);}return;}
    if(m.positions.length!==engine.positions.length)return;
    if(preparing){
     preparing=false;engine.__ogPreparing=false;engine.__ogSnapPositions=true;engine.__ogResetReference=true;
     engine.positions=m.positions;
     if(engine.width>1&&engine.height>1&&!engine.cameraTouched){initialView();viewReady=true;}
     engine.baseCanvas.style.opacity='';engine.labelCanvas.style.opacity='';
    }
    engine.pinnedNodes.forEach((p,i)=>{m.positions[2*i]=p[0];m.positions[2*i+1]=p[1];});
    engine.data.nodes.forEach((n,i)=>remembered.set(n.id,[m.positions[2*i],m.positions[2*i+1]]));
    engine.__ogPhysicsSettled=m.settled;engine.positions=m.positions;engine.positionVersion++;engine.scheduleRender();
    if(m.settled)engine.autoFitPending=false;
   };
   worker.onerror=()=>{preparing=false;engine.__ogPreparing=false;engine.baseCanvas.style.opacity='';engine.labelCanvas.style.opacity='';release();config.enabled=false;engine.__ogPhysicsEnabled=false;syncUI();ui.querySelector('small').textContent='物理线程失败，已恢复原生布局';original.call(engine);};
  }
  if(!remembered.size){preparing=true;engine.__ogPreparing=true;engine.baseCanvas.style.opacity='0';engine.labelCanvas.style.opacity='0';}
  engine.__ogPhysicsSettled=false;engine.generation++;engine.pinnedNodes.clear();engine.pendingNodeReleases.clear();
  const data=engine.data;
  const measure=engine.labelCanvas.getContext('2d');measure.font='12px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif';
  const nodes=data.nodes.map((n,i)=>{const p=remembered.get(n.id),angle=i*Math.PI*(3-Math.sqrt(5)),r=45*Math.sqrt(i+.5);return {id:n.id,x:p?.[0]??Math.cos(angle)*r,y:p?.[1]??Math.sin(angle)*r,labelWidth:measure.measureText(n.label||'').width,degree:n.degree||0,radius:24+Math.min(30,Math.sqrt(n.degree||0)*5)};});
  engine.positions=new Float32Array(nodes.flatMap(n=>[n.x,n.y]));engine.positionVersion++;
  if(!preparing && !viewReady && engine.width>1 && engine.height>1){
   initialView();viewReady=true;

  }
  engine.autoFitPending=false;
  // Keep only the current graph to bound memory when browsing many documents.
  const ids=new Set(nodes.map(n=>n.id));for(const id of remembered.keys())if(!ids.has(id))remembered.delete(id);
  worker.postMessage({type:'init',generation:engine.generation,nodes,links:data.links.map(l=>({source:data.nodes[l.source].id,target:data.nodes[l.target].id})),settings:config,paused:document.hidden||engine.width<1||engine.height<1});
  engine.scheduleRender();
 }
 function apply(){bridge.writeConfig(config);syncUI();if(engine.__graphTimelapse?.active)return;
  if(worker&&engine.layoutWorker===worker&&config.enabled){engine.__ogPhysicsSettled=false;worker.postMessage({type:'configure',generation:engine.generation,settings:config});}else start();
 }
 ui.oninput=e=>{const k=e.target.dataset.key;if(!k)return;config[k]=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);if(['labels','showIsolated','labelZoom','labelAvoidance'].includes(k)){bridge.writeConfig(config);syncUI();}else apply();};
 ui.querySelector('button').onclick=()=>{config={...defaults};apply();};
 const visibility=()=>{if(engine.layoutWorker===worker)worker?.postMessage({type:document.hidden||engine.width<1||engine.height<1?'pause':'resume',generation:engine.generation});};
 document.addEventListener('visibilitychange',visibility);
 engine.setData=function(...args){
  const incoming=new Set((args[0]||[]).map(n=>n.id));for(const map of [titles,titleSources])for(const id of map.keys())if(!incoming.has(id))map.delete(id);
  for(const n of args[0]||[])if(titleSources.has(n.id)&&n.label!==titleSources.get(n.id)&&n.label!==titles.get(n.id)){titles.delete(n.id);titleSources.delete(n.id);}
  const camera={...this.camera},touched=this.cameraTouched,wasReady=viewReady;
  const overlap=args[0]?.some(n=>remembered.has(n.id));
  const resetView=args[4]?.resetLayout===true || !overlap;
  if(resetView && !this.__graphTimelapse?.active){viewReady=false;remembered.clear();release();}
  originalSet.apply(this,args);
  if(!resetView && wasReady && camera.scale>0 && overlap && config.enabled && !this.__graphTimelapse?.active){
   this.focusAnimation++;this.camera=camera;this.cameraTouched=touched;this.autoFitPending=false;
  }
 };
 const resize=new ResizeObserver(()=>{
  visibility();
  if(disposed||engine.destroyed||preparing||viewReady||!engine.data?.nodes.length||engine.container.clientWidth<2||engine.container.clientHeight<2)return;
  engine.resize();
  if(!engine.cameraTouched){initialView();}
  viewReady=true;engine.autoFitPending=false;engine.scheduleRender();
 });
 resize.observe(engine.container);
 engine.startLayout=start;syncUI();start();
 return {dispose(){if(disposed)return;disposed=true;titleAbort.abort();resize.disconnect();release();engine.startLayout=original;engine.setData=originalSet;engine.baseCanvas.style.opacity='';engine.labelCanvas.style.opacity='';delete engine.__ogPreparing;delete engine.__ogResetReference;delete engine.__ogSnapPositions;delete engine.__ogVisual;delete engine.__ogPhysicsEnabled;delete engine.__ogPhysicsSettled;document.removeEventListener('visibilitychange',visibility);ui.remove();if(!engine.destroyed)original.call(engine);}};
}
