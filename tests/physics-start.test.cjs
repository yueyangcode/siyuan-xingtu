const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Config=require('../src/config.cjs');
function setup(){
 let resolve,reject,observer;const workers=[];
 const status={textContent:''},ui={querySelectorAll:()=>[],querySelector:s=>s==='small'?status:{},remove(){}};
 const node={id:'20261109000000-abcdefg',type:'d',label:'Long…',degree:1};
 const engine={data:{nodes:[node],links:[]},positions:new Float32Array(2),baseCanvas:{style:{}},labelCanvas:{style:{},getContext:()=>({measureText:t=>({width:t.length*12})})},container:{closest:()=>({append(){}}),clientWidth:400,clientHeight:600},width:400,height:600,camera:{scale:1},selected:-1,generation:0,geometryVersion:0,positionVersion:0,pinnedNodes:new Map(),pendingNodeReleases:new Map(),scheduleRender(){},fit(){},resize(){this.width=this.container.clientWidth;this.height=this.container.clientHeight;},stopLayout(){},startLayout(){},setData(nodes){this.data={nodes,links:[]};this.positions=new Float32Array(nodes.length*2);this.startLayout();}};
 const context={Config,bridge:{readConfig:()=>Config.defaults},PHYSICS_WORKER:'',Float32Array,AbortController,AbortSignal,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},fetch:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),document:{hidden:false,createElement:()=>ui,addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(cb){observer=cb;}observe(){}disconnect(){}},Worker:class{constructor(){this.messages=[];workers.push(this);}postMessage(m){this.messages.push(m);}terminate(){this.terminated=true;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/physics.js'),'utf8'),context);
 const runtime=context.attachPhysics(engine);
 return {engine,runtime,workers,status,resize:()=>observer(),resolve:()=>resolve({ok:true,json:async()=>({code:0,data:[{id:node.id,content:'Long complete title'}]})}),reject:()=>reject(Error('offline'))};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('pending title request does not block worker; completion preserves generation and positions',async()=>{
 const x=setup(),w=x.workers[0];assert.ok(w);assert.equal(w.messages[0].type,'init');
 w.onmessage({data:{type:'positions',generation:x.engine.generation,positions:new Float32Array([20,30]),settled:true}});
 assert.equal(x.engine.__ogPreparing,false);assert.equal(x.engine.baseCanvas.style.opacity,'');
 const generation=x.engine.generation;x.resolve();await flush();
 assert.equal(x.engine.data.nodes[0].label,'Long complete title');assert.equal(x.engine.generation,generation);
 assert.deepEqual([...x.engine.positions],[20,30]);assert.equal(w.messages.at(-1).type,'labels');x.runtime.dispose();
});
test('failed metadata lookup and switching to empty graph do not leave a hidden canvas',async()=>{
 const x=setup();x.engine.setData([]);assert.equal(x.engine.__ogPreparing,false);assert.equal(x.engine.baseCanvas.style.opacity,'');
 x.reject();await flush();assert.match(x.status.textContent,/完整标题读取失败/);assert.equal(x.workers.length,1);x.runtime.dispose();
});
test('unload during title request cannot restart worker',async()=>{
 const x=setup();x.runtime.dispose();x.resolve();await flush();assert.equal(x.workers.length,1);assert.ok(x.workers[0].terminated);
});
