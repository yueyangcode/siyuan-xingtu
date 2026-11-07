const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');const root=path.join(__dirname,'dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json')));assert.equal(manifest.name,'siyuan-xingtu');assert.equal(manifest.version,require('./package.json').version);
for(const file of ['index.js','README.md','LICENSE','i18n/zh_CN.json','i18n/en_US.json','licenses/d3-force.txt','licenses/d3-dispatch.txt','licenses/d3-quadtree.txt','licenses/d3-timer.txt'])assert.ok(fs.statSync(path.join(root,file)).size>0,file);
for(const [name,w,h] of [['icon.png',160,160],['preview.png',1024,768]]){const b=fs.readFileSync(path.join(root,name));assert.equal(b.readUInt32BE(16),w);assert.equal(b.readUInt32BE(20),h);assert.ok(b.length<524288);}
const paths=fs.readdirSync(root,{recursive:true});assert.ok(paths.every(p=>!/(^|[\\/])(qa|node_modules|backups)([\\/]|$)|\.private\.|settings\.json/.test(p)));
console.log({package:'PASS',version:manifest.version});
