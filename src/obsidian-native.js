/* SiYuan 3.8.5: presentation-only patch for the built-in global and local graphs. */
(() => {
  const KEY = '__xingtuGraph';
  window[KEY]?.dispose();
  const patches = new Map();
  const style = document.createElement('style');
  style.textContent = `:is(.sy__globalGraph,.sy__graph) .graph__svg {background:#101010!important}
    :is(.sy__globalGraph,.sy__graph) .graph__tooltip {display:none!important}
    body:has(:is(.sy__globalGraph,.sy__graph).fullscreen) .siyuan-floating-toc-plugin-container {visibility:hidden}
    :is(.og-timelapse,.og-physics){background:#181818;color:#dadada;padding:6px 10px;font:12px ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei Light",sans-serif;flex-shrink:0}
    :is(.og-timelapse,.og-physics) [hidden]{display:none!important}.og-time-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    :is(.og-timelapse,.og-physics) button,:is(.og-timelapse,.og-physics) select{background:#292929;color:#dadada;border:1px solid #444;border-radius:4px;padding:4px 8px;font:inherit;cursor:pointer}
    :is(.og-timelapse,.og-physics) input{width:100%;accent-color:#9975ec}:is(.og-timelapse,.og-physics) small{display:block;color:#aaa;padding-top:4px}
    :is(.og-timelapse,.og-physics) input[type=date]{width:auto;background:#292929;color:#dadada;border:1px solid #444;color-scheme:dark}
    .og-time-status{font-variant-numeric:tabular-nums}
    .og-physics{position:absolute;z-index:5;top:44px;right:8px;padding:0;background:transparent;max-width:calc(100% - 16px)}
    .og-physics>summary{list-style:none;cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;margin-left:auto;color:#b3b3b3;border-radius:4px}
    .og-physics>summary::-webkit-details-marker{display:none}.og-physics>summary svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5}
    .og-physics>summary:hover{color:#dadada;background:#ffffff0d}.og-physics>summary:focus-visible{outline:2px solid #8a5cec}
    .og-physics[open]{width:252px;padding:8px 12px;background:#181818f5;border:1px solid #303030;border-radius:6px;max-height:calc(100% - 100px);overflow:auto;box-sizing:border-box;box-shadow:0 4px 18px #0004}
    .og-physics[open]>summary{margin-bottom:8px}.og-physics label{line-height:1.6;margin:6px 0}.og-physics output{float:right;color:#aaa;font-variant-numeric:tabular-nums}
    .og-physics input[type=range]{height:14px}.og-physics button{margin-top:8px}
    .og-timelapse{position:absolute;z-index:4;left:8px;bottom:8px;padding:0;background:transparent;max-width:calc(100% - 16px);box-sizing:border-box}
    .og-timelapse>button{background:#181818b3;border-color:#303030;color:#b3b3b3}
    .og-timelapse:has(.og-time-controls:not([hidden])){padding:10px;background:#181818f5;border:1px solid #303030;border-radius:6px;max-height:calc(100% - 80px);overflow:auto}
    .og-timelapse button:hover{color:#dadada;background:#333}
`;
  style.textContent=style.textContent.replaceAll(':is(.sy__globalGraph,.sy__graph)',':is(.sy__globalGraph,.sy__graph).xt-enabled');
  document.head.append(style);
  let dpiQuery;
  function watchDpi(){
    dpiQuery?.removeEventListener('change',watchDpi);
    dpiQuery=matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
    dpiQuery.addEventListener('change',watchDpi);
    patches.forEach((_,engine)=>{if(!engine.destroyed)engine.scheduleRender();});
  }
  watchDpi();
  window.addEventListener('resize',watchDpi);

  function attach(engine) {
    if(patches.has(engine) && patches.get(engine).renderer!==engine.renderer){patches.get(engine).dispose();patches.delete(engine);}
    if(patches.has(engine)||!engine||engine.destroyed)return;
    if(!Config.compatible(engine)){bridge.onIncompatible();return;}
    const panel=engine.container.closest('.sy__graph,.sy__globalGraph');panel.classList.add('xt-enabled');
    const renderer = engine.renderer, labels = engine.labelRenderer;
    const render = renderer.render, renderLabels = labels.render, measure = labels.measureLabel;
    const hitTest = engine.hitTest, updateGeometry = renderer.updateGeometry, drawEdges = renderer.drawEdges;
    const physics = typeof attachPhysics==='function' ? attachPhysics(engine) : null;
    const timelapse = typeof attachTimelapse==='function' ? attachTimelapse(engine) : null;
    let geometry = -1, order = [], version = 100000;
    let labelCount = 0;
    let frame, focus = -1, lastTime = 0, animating = false;
    let nodeAlpha = [], nodeTint = [], edgeAlpha = [], edgeTint = [], positions, sizes;
    let neighbors = new Set(), frames = 0;
    const textWidths=new Map(),labelOpacity=new Map(),labelDecision=new Map(),labelEmphasis=new Map();
    let labelTime=0,referenceScale=0;
    const nodeMotion=new Map();
    let clearFocusAt=0;
    const alignDrag=()=>{
      const action=engine.pointerAction;
      if(!frame || !action || action.node<0)return;
      action.nodeOffsetX=positions[action.node*2]-(action.x-engine.camera.x)/engine.camera.scale;
      action.nodeOffsetY=positions[action.node*2+1]-(action.y-engine.camera.y)/engine.camera.scale;
    };
    engine.container.addEventListener('pointerdown',alignDrag);
    const zoomWheel=event=>{
      if(!engine.data || engine.destroyed)return;
      event.preventDefault();event.stopImmediatePropagation();
      const rect=engine.container.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      const old=engine.camera.scale,wx=(x-engine.camera.x)/old,wy=(y-engine.camera.y)/old;
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?engine.height:1);
      const scale=Math.max(.02,Math.min(8,old*Math.exp(-delta/300)));
      engine.camera.scale=scale;engine.camera.x=x-wx*scale;engine.camera.y=y-wy*scale;
      engine.cameraTouched=true;engine.focusAnimation++;
      engine.scheduleRender();
    };
    engine.container.addEventListener('wheel',zoomWheel,{capture:true,passive:false});
    const mix = (a,b,t) => a+(b-a)*t;
    // Keep the native GPU renderer and physics worker; change only its presentation buffers.
    if (typeof updateGeometry === 'function' && renderer.gl && renderer.upload) {
      renderer.updateGeometry = function(state) {
        updateGeometry.call(this,state);
        state.data.nodes.forEach((_,i)=>this.nodeColors.set([
          mix(179,138,nodeTint[i])/255,mix(179,92,nodeTint[i])/255,
          mix(179,236,nodeTint[i])/255,nodeAlpha[i]],i*4));
        state.data.links.forEach((_,i)=>this.edgeColors.set([
          mix(119,129,edgeTint[i])/255,mix(119,83,edgeTint[i])/255,
          mix(119,236,edgeTint[i])/255,edgeAlpha[i]],i*4));
        this.upload(this.nodeColorBuffer,this.nodeColors,this.gl.DYNAMIC_DRAW);
        this.upload(this.edgeColorBuffer,this.edgeColors,this.gl.DYNAMIC_DRAW);
      };
    }
    // The host clamps line width to 1 CSS px; match our Canvas fallback's .75 px.
    if(renderer.gl && typeof drawEdges==='function' && renderer.getUniform && renderer.setViewUniforms){
      renderer.drawEdges=function(state){
        const gl=this.gl,program=this.edgeProgram;
        gl.useProgram(program);gl.bindVertexArray(this.edgeVao);this.setViewUniforms(program,state);
        for(const [name,value] of Object.entries({u_arrow:0,u_arrow_length:0,u_min_width:.75,u_width:.75/state.camera.scale,u_opacity:1,u_highlight_opacity:1}))
          gl.uniform1f(this.getUniform(program,name),value);
        gl.uniform4fv(this.getUniform(program,'u_highlight'),this.highlightLine);
        gl.drawArraysInstanced(gl.TRIANGLES,0,6,state.data.links.length);
      };
    }
    engine.hitTest = function(x,y) {
      if(!frame)return hitTest.call(this,x,y);
      const current=this.hovered;
      if(current>=0 && current<frame.data.nodes.length && nodeAlpha[current]>=.05){
        const dx=x-positions[current*2]*this.camera.scale-this.camera.x,dy=y-positions[current*2+1]*this.camera.scale-this.camera.y;
        if(dx*dx+dy*dy<Math.pow(Math.max(6,sizes[current]*this.camera.scale*1.3)+3,2))return current;
      }
      let result=-1, best=Infinity;
      frame.data.nodes.forEach((_,i)=>{
        if(nodeAlpha[i]<.05)return;
        const dx=x-positions[i*2]*this.camera.scale-this.camera.x;
        const dy=y-positions[i*2+1]*this.camera.scale-this.camera.y;
        const distance=dx*dx+dy*dy, radius=Math.max(6,sizes[i]*this.camera.scale*1.3);
        if(distance<=radius*radius && distance<best){result=i;best=distance;}
      });
      return result;
    };
    renderer.render = function(state) {
      frames++;
      if(engine.__ogPreparing)return;
      const resetReference=engine.__ogResetReference===true;
      if(resetReference){referenceScale=state.camera.scale;labelOpacity.clear();labelDecision.clear();labelEmphasis.clear();delete engine.__ogResetReference;}
      if(engine.__ogSnapPositions){positions=state.positions.slice();engine.__ogSnapPositions=false;}
      const now=performance.now(), gap=now-lastTime, dt=gap>100?16.7:Math.min(50,gap||16.7);lastTime=now;
      const fadeEase=1-Math.exp(-dt/160);
      let nextFocus=engine.pointerAction?.node>=0?engine.pointerAction.node:state.hovered;
      // Crossing a short gap between nodes must not flash the entire graph bright.
      if(nextFocus<0 && focus>=0){
        if(!clearFocusAt)clearFocusAt=now+25;
        if(now<clearFocusAt)nextFocus=focus;
      }else clearFocusAt=0;
      if(geometry!==state.geometryVersion){
        const previous=new Map((resetReference?undefined:frame)?.data.nodes.map((n,i)=>[n.id,{alpha:nodeAlpha[i],tint:nodeTint[i],x:positions[i*2],y:positions[i*2+1]}])||[]);
        const previousEdges=new Map(frame?.data.links.map((l,i)=>[`${frame.data.nodes[l.source].id}/${frame.data.nodes[l.target].id}`,edgeAlpha[i]])||[]);
        if(!engine.__graphTimelapse?.active && state.data.nodes.length && !state.data.nodes.some(n=>previous.has(n.id)))referenceScale=state.camera.scale;
        geometry=state.geometryVersion;
        textWidths.clear();
        const liveIds=new Set(state.data.nodes.map(n=>n.id));
        for(const cache of [nodeMotion,labelOpacity,labelDecision,labelEmphasis])for(const id of cache.keys())if(!liveIds.has(id))cache.delete(id);
        order=state.data.nodes.map((_,i)=>i).sort((a,b)=>state.data.nodes[b].degree-state.data.nodes[a].degree||a-b);
        nodeAlpha=state.data.nodes.map(()=>1);nodeTint=state.data.nodes.map(()=>0);
        edgeAlpha=state.data.links.map(()=>.32);edgeTint=state.data.links.map(()=>0);
        positions=state.positions.slice();sizes=new Float32Array(state.data.nodes.length);
        state.data.nodes.forEach((n,i)=>{
          const p=previous.get(n.id);
          nodeAlpha[i]=p?.alpha??(engine.__graphTimelapse?.active?0:1);nodeTint[i]=p?.tint??0;
          if(p){positions[i*2]=p.x;positions[i*2+1]=p.y;}

        });
        if(engine.__graphTimelapse?.active)state.data.links.forEach((l,i)=>{edgeAlpha[i]=previousEdges.get(`${state.data.nodes[l.source].id}/${state.data.nodes[l.target].id}`)||0;});
        focus=-2;
      }
      if(focus!==nextFocus){
        focus=nextFocus;neighbors=new Set([focus]);
        state.data.links.forEach(e=>{if(e.source===focus)neighbors.add(e.target);if(e.target===focus)neighbors.add(e.source);});
      }
      animating=clearFocusAt>now;
      // Fit to the reference's gradual brightness decay; interrupted fades keep their current value.
      const tween=(a,b)=>{if(Math.abs(a-b)<.002)return b;animating=true;return mix(a,b,fadeEase);};
      const scale = Math.max(.001, state.camera.scale);
      if(!referenceScale)referenceScale=scale;
      const relativeZoom=scale/referenceScale;
      // Interpolate worker frames; forces and inertia live exclusively in the worker.
      const positionEase=engine.__ogPhysicsEnabled===false?1:1-Math.exp(-dt/160);
      state.data.nodes.forEach((node,i)=>{
        const birth=engine.__graphTimelapse?.births.get(node.id);
        const growth=birth===undefined?1:Math.min(1,Math.max(0,(now-birth)/320));
        if(growth<1)animating=true;
        const visible=engine.__ogVisual?.showIsolated!==false || node.degree>0;
        nodeAlpha[i]=tween(nodeAlpha[i],(focus<0||neighbors.has(i)?1:.2)*growth*(visible?1:0));
        nodeTint[i]=tween(nodeTint[i],i===focus?1:0);
        const radius=Math.max(5.5,Math.min(24,Math.sqrt(node.degree||0)*3.3));
        sizes[i]=radius*(state.options.nodeSize/16)*Math.sqrt(relativeZoom)*(1+.12*nodeTint[i])*(.35+.65*growth)/scale;
        nodeMotion.set(node.id,Math.hypot(positions[i*2]-state.positions[i*2],positions[i*2+1]-state.positions[i*2+1])*scale);
        for(let axis=0;axis<2;axis++){
          const j=i*2+axis,target=state.positions[j];
          if(engine.pointerAction?.node===i && !engine.pointerAction.moved)continue;
          if(engine.pointerAction?.node===i||Math.abs(positions[j]-target)*scale<.05)positions[j]=target;
          else{positions[j]=mix(positions[j],target,positionEase);animating=true;}
        }
      });
      state.data.links.forEach((e,i)=>{
        const active=e.source===focus||e.target===focus;
        const birth=Math.max(engine.__graphTimelapse?.births.get(state.data.nodes[e.source].id)||0,engine.__graphTimelapse?.births.get(state.data.nodes[e.target].id)||0);
        const growth=birth?Math.min(1,Math.max(0,(now-birth)/400)):1;
        edgeAlpha[i]=tween(edgeAlpha[i],(focus<0?.32:active?.8:.07)*growth);
        edgeTint[i]=tween(edgeTint[i],active?1:0);
      });
      version++;
      const palette = Object.fromEntries(Object.keys(state.palette).map(key => [key, '#b3b3b3']));
      Object.assign(palette, {background:'#dadada', line:'#777777', referenceLine:'#777777',
        highlightPoint:'#a993ff', highlightLine:'#a993ff'});
      frame={...state, data:{...state.data,sizes},positions,positionVersion:frames,styleVersion:version,
        hovered:-1,selected:-1,selectionVersion:frames,palette,
        options:{...state.options,arrow:false,linkWidth:.75/scale,lineOpacity:1}};
      // Canvas fallback uses the same colors when WebGL is unavailable.
      if(!this.gl && this.context){
        const ctx=this.context,canvas=engine.baseCanvas,dpr=state.devicePixelRatio;
        const width=Math.max(1,Math.round(state.width*dpr)),height=Math.max(1,Math.round(state.height*dpr));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,state.width,state.height);ctx.lineWidth=.75;
        const color=t=>`rgb(${mix(119,129,t)},${mix(119,83,t)},${mix(119,236,t)})`;
        state.data.links.forEach((e,i)=>{ctx.beginPath();ctx.moveTo(positions[e.source*2]*scale+state.camera.x,positions[e.source*2+1]*scale+state.camera.y);ctx.lineTo(positions[e.target*2]*scale+state.camera.x,positions[e.target*2+1]*scale+state.camera.y);ctx.globalAlpha=edgeAlpha[i];ctx.strokeStyle=color(edgeTint[i]);ctx.stroke();});
        state.data.nodes.forEach((_,i)=>{ctx.beginPath();ctx.arc(positions[i*2]*scale+state.camera.x,positions[i*2+1]*scale+state.camera.y,sizes[i]*scale,0,Math.PI*2);ctx.globalAlpha=nodeAlpha[i];ctx.fillStyle=`rgb(${mix(179,138,nodeTint[i])},${mix(179,92,nodeTint[i])},${mix(179,236,nodeTint[i])})`;ctx.fill();});
        ctx.globalAlpha=1;
      }else render.call(this,frame);
      if(animating && !document.hidden && !engine.destroyed && engine.width>0 && engine.height>0)engine.scheduleRender();
    };
    labels.measureLabel = function(text) {
      const context = engine.labelCanvas.getContext('2d');
      context.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif';
      return {width:context.measureText(text).width, height:12};
    };
    labels.render = function(state) {
      if(engine.__ogPreparing)return;
      state=frame||state;
      const canvas = engine.labelCanvas, dpr = state.devicePixelRatio;
      const width = Math.max(1, Math.round(state.width*dpr));
      const height = Math.max(1, Math.round(state.height*dpr));
      if (canvas.width !== width || canvas.height !== height) {canvas.width=width;canvas.height=height;}
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,state.width,state.height);
      ctx.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const seen = new Set(), occupied=[];
      const now=performance.now(),fade=1-Math.exp(-Math.min(50,now-labelTime||16.7)/300);labelTime=now;
      if(labelOpacity.size>state.data.nodes.length*2){labelOpacity.clear();labelDecision.clear();labelEmphasis.clear();}
      const priority = [...new Set([focus,engine.selected].filter(i=>i>=0))];
      // Screen-space buckets avoid scanning every node for every long label.
      const nodeCells=new Map(),cellSize=64;
      const cellsFor=(r,visit)=>{
        for(let cy=Math.floor(Math.max(0,r.top)/cellSize);cy<=Math.floor(Math.min(state.height,r.bottom)/cellSize);cy++)
          for(let cx=Math.floor(Math.max(0,r.left)/cellSize);cx<=Math.floor(Math.min(state.width,r.right)/cellSize);cx++)visit(`${cx}:${cy}`);
      };
      if(engine.__ogVisual?.labelAvoidance!==false)state.data.nodes.forEach((_,i)=>{
        if(nodeAlpha[i]<.05)return;
        const x=state.positions[i*2]*state.camera.scale+state.camera.x,y=state.positions[i*2+1]*state.camera.scale+state.camera.y;
        const r=state.data.sizes[i]*state.camera.scale+1.5,circle={i,x,y,r};
        cellsFor({left:x-r,right:x+r,top:y-r,bottom:y+r},key=>{
          if(!nodeCells.has(key))nodeCells.set(key,[]);nodeCells.get(key).push(circle);
        });
      });
      const coversNode=(rect,index)=>{
        let hit=false;
        cellsFor(rect,key=>{if(hit)return;hit=(nodeCells.get(key)||[]).some(c=>{
          if(c.i===index)return false;
          const dx=c.x-Math.max(rect.left,Math.min(rect.right,c.x)),dy=c.y-Math.max(rect.top,Math.min(rect.bottom,c.y));
          return dx*dx+dy*dy<c.r*c.r;
        });});return hit;
      };
      labelCount = 0;
      for (const i of priority.concat(order)) {
        if (seen.has(i)) continue;
        seen.add(i);
        const node = state.data.nodes[i];
        if (!node?.label || nodeAlpha[i]<.05) continue;
        const active = priority.includes(i);
        const zoom=state.camera.scale/(referenceScale||state.camera.scale);
        const targetEmphasis=active?1:0;
        let emphasis=labelEmphasis.get(node.id)??0;
        emphasis=Math.abs(emphasis-targetEmphasis)<.002?targetEmphasis:mix(emphasis,targetEmphasis,fade);
        labelEmphasis.set(node.id,emphasis);
        if(emphasis!==targetEmphasis){animating=true;if(!document.hidden)engine.scheduleRender();}
        const normalFontSize=12*Math.sqrt(zoom);
        const fontSize=mix(normalFontSize,Math.max(16,normalFontSize),emphasis);
        ctx.font=`${fontSize}px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif`;
        const text = node.label;
        let x = state.positions[i*2]*state.camera.scale+state.camera.x;
        let y = state.positions[i*2+1]*state.camera.scale+state.camera.y+state.data.sizes[i]*state.camera.scale+4;
        let baseWidth=textWidths.get(text);
        if(baseWidth===undefined){ctx.font='12px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif';baseWidth=ctx.measureText(text).width;textWidths.set(text,baseWidth);ctx.font=`${fontSize}px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Inter, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif`;}
        const w = baseWidth*fontSize/12;
        const radius=state.data.sizes[i]*state.camera.scale;
        const boxAt=(cx,cy)=>({left:cx-w/2-2,right:cx+w/2+2,top:cy-2,bottom:cy+fontSize+2});
        let rect=boxAt(x,y);
        if (rect.right<0 || rect.left>state.width || rect.bottom<0 || rect.top>state.height) continue;
        // Try nearby anchors, but never remove a name merely because it collides.
        if(engine.__ogVisual?.labelAvoidance!==false && !active){
          const candidates=[[x,y],[x,y-2*radius-8-fontSize],[x+radius+4+w/2,y-radius-4-fontSize/2],[x-radius-4-w/2,y-radius-4-fontSize/2]];
          for(const [cx,cy] of candidates){
            const candidate=boxAt(cx,cy);
            if(candidate.left<0 || candidate.right>state.width || candidate.top<0 || candidate.bottom>state.height)continue;
            if(!coversNode(candidate,i) && !occupied.some(r=>candidate.left<r.right && candidate.right>r.left && candidate.top<r.bottom && candidate.bottom>r.top)){
              x=cx;y=cy;rect=candidate;break;
            }
          }
        }
        const settings=engine.__ogVisual;
        const cutoff=.45*(settings?.labelZoom??.2)/.2;
        const labelFade=active?1:Math.max(0,Math.min(1,(zoom-cutoff)/.55));
        const eligible=settings?.labels!==false && labelFade>0;
        const wanted=eligible?1:0;
        let decision=labelDecision.get(node.id);
        if(!decision){decision={wanted,since:now,value:wanted};labelDecision.set(node.id,decision);}
        if(decision.wanted!==wanted){decision.wanted=wanted;decision.since=now;}
        if(active || now-decision.since>=450)decision.value=wanted;
        else if(decision.value!==wanted){animating=true;if(!document.hidden)engine.scheduleRender();}
        const motion=nodeMotion.get(node.id)||0;
        const target=decision.value*labelFade*(active?1:Math.max(.15,1-motion/3));
        if(wanted)occupied.push(rect);
        let opacity=labelOpacity.get(node.id)??target;
        const opacityEase=fade;
        opacity=Math.abs(opacity-target)<.01?target:mix(opacity,target,opacityEase);
        labelOpacity.set(node.id,opacity);
        if(opacity!==target){animating=true;if(!document.hidden)engine.scheduleRender();}
        if(opacity<.01)continue;
        ctx.globalAlpha = nodeAlpha[i]*opacity; ctx.fillStyle = '#dadada';
        ctx.fillText(text,x,y); labelCount++;
      }
    };
    let patchDisposed=false;
    patches.set(engine, {renderer,timelapse,dispose() {
      if(patchDisposed)return;patchDisposed=true;panel.classList.remove('xt-enabled');
      engine.container.removeEventListener('pointerdown',alignDrag);
      engine.container.removeEventListener('wheel',zoomWheel,true);
      timelapse?.dispose();
      physics?.dispose();
      if (renderer.render !== render) renderer.render = render;
      labels.render = renderLabels; labels.measureLabel = measure;
      engine.hitTest=hitTest;
      if(updateGeometry)renderer.updateGeometry=updateGeometry;
      if(drawEdges)renderer.drawEdges=drawEdges;
      engine.styleVersion++;
      if(!engine.destroyed)engine.scheduleRender();
    }, get labelCount(){return labelCount;},get animation(){return {focus,animating,frames,radii:Array.from(sizes||[],r=>r*engine.camera.scale),positions:Array.from(positions||[]),nodeAlpha:nodeAlpha.slice(),nodeTint:nodeTint.slice(),edgeAlpha:edgeAlpha.slice()};}});
    engine.scheduleRender();
  }
  function scan() {
    const layout = window.siyuan?.layout;
    if (!layout) return;
    for(const [engine,patch] of patches) if(engine.destroyed){patch.dispose();patches.delete(engine);}
    for(const name of ['leftDock','rightDock','bottomDock']) {
      for(const key of ['globalGraph','graph']) {
        const graph = layout[name]?.data?.[key];
        if(['global','local','pin'].includes(graph?.type))attach(graph.graphEngine);
      }
    }
  }
  // Native graph instances are created on demand; no polling or continuous animation.
  const observer = new MutationObserver(records => {
    if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 &&
      (n.matches?.('.sy__globalGraph,.sy__graph,.graph__canvas') || n.querySelector?.('.sy__globalGraph,.sy__graph,.graph__canvas')))))scan();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  window[KEY] = {patches, scan, dispose(){window.removeEventListener('resize',watchDpi);dpiQuery?.removeEventListener('change',watchDpi);observer.disconnect();patches.forEach(p=>p.dispose());patches.clear();style.remove();delete window[KEY];}};
  scan();
})();
