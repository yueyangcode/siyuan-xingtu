'use strict';
const {Plugin,Setting,showMessage,getFrontend}=require('siyuan');
module.exports=class Xingtu extends Plugin {
 async onload(){this.disposed=false;this.saveQueue=Promise.resolve();this.settingsData=await this.loadData('settings.json');if(this.disposed)return;
  this.hasConfig=!!this.settingsData?.physics;this.config=Config.normalize(this.settingsData?.physics);this.addCommand({langKey:'openGraph',callback:()=>this.openGraph()});}
 async onLayoutReady(){if(this.disposed||this.runtime||this.starting||getFrontend().includes('mobile')||window.siyuan?.isPublish)return;this.starting=true;
  // The old snippet must be disabled before migration to prevent two competing patches.
  if(window.__obsidianNativeGraph){let disabled=false;try{const response=await fetch('/api/snippet/getSnippet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'all',enabled:2})});const result=await response.json();const old=result.data?.snippets?.find(s=>s.id==='20261012180000-ogstyle');disabled=response.ok&&result.code===0&&old?.enabled===false;}catch{}if(this.disposed)return;
   if(disabled)window.__obsidianNativeGraph.dispose();else{this.starting=false;this.blocked=true;showMessage('星图：检测到旧图谱片段，请先停用“Obsidian 样式 · 原生关系图与生长动画”，再启用星图。',10000);return;}}
  if(!this.hasConfig){let legacy;try{legacy=JSON.parse(localStorage.getItem('og-physics-v1')||'null');}catch{}this.config=Config.normalize(legacy);this.hasConfig=true;this.persist();}
  this.runtime=createRuntime({readConfig:()=>({...this.config}),writeConfig:value=>{this.config=Config.normalize(value);this.persist();},onIncompatible:()=>{if(!this.warned){this.warned=true;showMessage('星图：当前图谱接口不兼容，已保留原生图谱。',8000);}}});
 }
 persist(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.flush(),300);}
 flush(){clearTimeout(this.saveTimer);this.saveTimer=null;const snapshot={version:1,physics:{...this.config}};this.saveQueue=this.saveQueue.catch(()=>{}).then(()=>this.saveData('settings.json',snapshot)).catch(error=>{console.error('[星图] 保存设置失败',error);if(!this.disposed)showMessage('星图设置保存失败，请检查工作区是否可写。',6000);});return this.saveQueue;}
 openGraph(){const button=document.querySelector('.dock__item[data-type="globalGraph"]');if(button)button.click();else showMessage('请从思源停靠栏打开全局关系图。');}
 openSetting(){this.setting?.close();const root=document.createElement('div');root.style.cssText='padding:8px 0;line-height:1.8';
  const title=document.createElement('h2');title.textContent='星图';root.append(title);
  for(const text of ['沿用你熟悉的全局与局部关系图入口，保留深色背景、灰色节点、紫色焦点、完整标题和平滑缩放。','打开图谱后，右上角的调节按钮可设置物理布局、标签显示和孤立节点；参数自动保存。左下角 Animate 可播放生长动画。','生长动画根据创建时间和当前引用关系重建，并非真实历史快照。','停用星图会恢复原生图谱。升级迁移时保留旧片段备份，但请勿同时启用。']){const p=document.createElement('p');p.textContent=text;root.append(p);}
  const status=document.createElement('p');status.textContent=this.blocked?'状态：等待停用旧片段':this.warned?'状态：当前图谱不兼容，使用原生效果':`状态：已启用，已接入 ${this.runtime?.patches.size||0} 个图谱`;root.append(status);
  const button=document.createElement('button');button.className='b3-button b3-button--outline';button.textContent='打开 / 收起全局图谱';button.onclick=()=>{this.setting.close();this.openGraph();};root.append(button);
  this.setting=new Setting({width:'620px'});this.setting.addItem({title:'',actionElement:root});this.setting.open(this.displayName);
 }
 onunload(){this.disposed=true;if(this.saveTimer)this.flush();this.setting?.close();this.runtime?.dispose();this.runtime=null;}
};
