const fs=require('node:fs'),path=require('node:path'),webpack=require('webpack');const root=__dirname,read=p=>fs.readFileSync(path.join(root,p),'utf8');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
webpack({mode:'production',target:'webworker',entry:{'physics-worker':path.join(root,'src/physics-worker.js'),'timelapse-worker':path.join(root,'src/timelapse-worker.js')},output:{path:path.join(root,'dist'),filename:'[name].js'},devtool:false},(error,stats)=>{
 if(error||stats.hasErrors()){console.error(error||stats.toString());process.exitCode=1;return;}
 const config=`const Config=(()=>{const module={exports:{}};${read('src/config.cjs')}\nreturn module.exports;})();`;
 const factory=`function createRuntime(bridge){const PHYSICS_WORKER=${JSON.stringify(read('dist/physics-worker.js'))};const TIMELAPSE_WORKER=${JSON.stringify(read('dist/timelapse-worker.js'))};\n${read('src/physics.js')}\n${read('src/timelapse.js')}\n${read('src/obsidian-native.js')}\nreturn window.__xingtuGraph;}`;
 fs.writeFileSync(path.join(root,'dist/index.js'),`/* 星图: MIT; D3 ISC. See licenses/. */\n${config}\n${factory}\n${read('src/settings.js')}\n${read('src/index.cjs')}`);
 for(const file of ['plugin.json','README.md','LICENSE','icon.png','preview.png'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(root,'dist',file));
 for(const dir of ['i18n','licenses','docs'])fs.cpSync(path.join(root,dir),path.join(root,'dist',dir),{recursive:true});
 console.log('Built 星图 '+JSON.parse(read('package.json')).version);
});
