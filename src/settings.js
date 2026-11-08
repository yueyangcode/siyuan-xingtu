function createSettingsView(plugin) {
 const root = document.createElement('div');
 root.className = 'xt-settings';
 // Static markup only. Runtime status is assigned with textContent below.
 root.innerHTML = `
 <style>
 .xt-settings-dialog { --xt-muted:#787774; --xt-line:#e9e9e7; --xt-hover:#f1f1ef; --xt-bg:#fff; --xt-text:#37352f; background:var(--xt-bg); color:var(--xt-text); border-radius:10px; }
 [data-theme-mode="dark"] .xt-settings-dialog { --xt-muted:#a4a4a0; --xt-line:#343434; --xt-hover:#2c2c2c; --xt-bg:#202020; --xt-text:#e6e6e3; }
 .xt-settings-dialog .b3-dialog__header { background:transparent; color:var(--xt-muted); font-size:12px; font-weight:400; padding:14px 24px; border-bottom:1px solid var(--xt-line); }
 .xt-settings-dialog .b3-dialog__content { padding:0; }
 .xt-settings-dialog .config-item { padding:0; border:0; display:block; }
 .xt-settings-dialog .config-name, .xt-settings-dialog .config-item > .fn__block > .fn__hr { display:none; }
 .xt-settings { box-sizing:border-box; width:100%; min-width:0; padding:32px 36px 24px; font-family:var(--b3-font-family); font-size:14px; line-height:1.55; text-align:left; }
 .xt-settings * { box-sizing:border-box; }
 .xt-settings h2, .xt-settings h3, .xt-settings p { margin:0; color:inherit; }
 .xt-settings .xt-heading { display:flex; align-items:center; gap:14px; }
 .xt-settings .xt-mark { width:40px; height:40px; flex:none; color:var(--xt-text); }
 .xt-settings h2 { font-size:24px; line-height:1.3; font-weight:650; letter-spacing:-.5px; }
 .xt-settings .xt-subtitle { color:var(--xt-muted); font-size:13px; margin-top:5px; }
 .xt-settings .xt-status { margin:18px 0 28px; color:var(--xt-muted); font-size:12px; display:flex; align-items:center; gap:7px; }
 .xt-settings .xt-status::before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; flex:none; }
 .xt-settings .xt-status[data-warning="true"] { color:var(--b3-theme-error); }
 .xt-settings .xt-section-title { color:var(--xt-muted); font-size:12px; font-weight:500; padding-bottom:9px; border-bottom:1px solid var(--xt-line); }
 .xt-settings .xt-row { display:flex; align-items:center; justify-content:space-between; gap:22px; padding:18px 0; border-bottom:1px solid var(--xt-line); }
 .xt-settings .xt-copy { min-width:0; }
 .xt-settings .xt-row h3 { font-size:14px; font-weight:500; }
 .xt-settings .xt-row p { color:var(--xt-muted); font-size:12px; margin-top:5px; line-height:1.65; }
 .xt-settings button { flex:none; font:inherit; font-size:12px; line-height:20px; padding:5px 12px; color:var(--xt-text); background:transparent; border:1px solid var(--xt-line); border-radius:5px; cursor:pointer; box-shadow:0 1px 2px #00000008; }
 .xt-settings button:hover { background:var(--xt-hover); }
 .xt-settings button:focus-visible, .xt-settings summary:focus-visible { outline:2px solid var(--b3-theme-primary); outline-offset:3px; }
 .xt-settings .xt-location { flex:none; font-size:12px; color:var(--xt-muted); white-space:nowrap; }
 .xt-settings kbd { font:inherit; font-size:11px; border:1px solid var(--xt-line); border-radius:4px; padding:2px 6px; color:var(--xt-muted); background:transparent; box-shadow:none; }
 .xt-settings details { margin-top:20px; font-size:12px; color:var(--xt-muted); }
 .xt-settings summary { cursor:pointer; width:fit-content; padding:3px 0; }
 .xt-settings details p { margin:9px 0 0 14px; line-height:1.7; }
 .xt-settings .xt-footer { margin-top:24px; color:var(--xt-muted); font-size:11px; display:flex; justify-content:space-between; gap:16px; }
 @media(max-width:520px) { .xt-settings { padding:24px 20px 20px; } .xt-settings .xt-row { gap:14px; flex-wrap:wrap; } .xt-settings .xt-copy { flex:1 1 180px; } .xt-settings .xt-footer { flex-wrap:wrap; } }
 </style>
 <div class="xt-heading">
  <svg class="xt-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M9 12 27 7 31 28 13 32 9 12 31 28M27 7 13 32" opacity=".45"/><circle cx="9" cy="12" r="3.5" fill="var(--xt-bg)"/><circle cx="27" cy="7" r="3" fill="var(--xt-bg)"/><circle cx="31" cy="28" r="3.5" fill="var(--xt-bg)"/><circle cx="13" cy="32" r="2.5" fill="var(--xt-bg)"/></svg>
  <div><h2>星图</h2><p class="xt-subtitle">在笔记之间，看见连接。</p></div>
 </div>
 <p class="xt-status" role="status"></p>
 <h3 class="xt-section-title">图谱与交互</h3>
 <div class="xt-row">
  <div class="xt-copy"><h3>全局关系图</h3><p>查看笔记之间的连接，滚轮缩放，拖动节点。</p></div>
  <button type="button" data-action="graph"></button>
 </div>
 <div class="xt-row">
  <div class="xt-copy"><h3>显示与布局</h3><p>调整标签、孤立节点与物理布局，修改后自动保存。</p></div>
  <span class="xt-location">图谱右上角</span>
 </div>
 <div class="xt-row">
  <div class="xt-copy"><h3>生长动画</h3><p>按创建时间展开笔记，支持暂停、重播和调速。</p></div>
  <span class="xt-location">左下角 <kbd>Animate</kbd></span>
 </div>
 <details><summary>使用说明</summary>
  <p>局部关系图仍从思源原有入口打开，同样应用星图的显示效果。</p>
  <p>生长动画使用文档创建时间和当前引用关系，并非历史快照。</p>
  <p>停用插件会恢复原生图谱。请勿同时启用旧版图谱增强代码片段。</p>
 </details>
 <div class="xt-footer"><span>本地运行，不上传笔记</span><span>设置自动保存</span></div>`;
 const status = root.querySelector('.xt-status');
 status.textContent = plugin.blocked ? '请先停用旧图谱片段，再启用星图' : plugin.warned ? '当前版本暂不兼容，已保留原生图谱' : plugin.runtime ? `已启用 · ${plugin.runtime.patches.size ? `已接入 ${plugin.runtime.patches.size} 个图谱` : '打开关系图即可使用'}` : '正在准备图谱';
 status.dataset.warning = String(!!(plugin.blocked || plugin.warned));
 const panel = document.querySelector('.sy__globalGraph');
 const visible = !!panel?.getClientRects().length;
 const button = root.querySelector('[data-action="graph"]');
 button.textContent = visible ? '收起图谱' : '打开图谱';
 button.onclick = () => { plugin.setting.close(); plugin.openGraph(); };
 return root;
}
