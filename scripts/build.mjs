import {mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
for(const name of await readdir(path.join(root,'assets'))){
  if(!/\.(js|mjs)$/.test(name))continue;
  // The repository contains an unused archived HTML shell named core-patches.js.
  // Preserve it, but check its inline scripts as HTML instead of treating it as JS.
  const source=await readFile(path.join(root,'assets',name),'utf8');
  if(/^\s*<!doctype html>/i.test(source)){
    for(const script of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1],{filename:name});
    continue;
  }
  const result=spawnSync(process.execPath,['--check',path.join(root,'assets',name)],{encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(result.stderr);
}
for(const name of ['index.html','components.html']){
  const html=await readFile(path.join(root,name),'utf8');
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1],{filename:name});
  for(const match of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)){
    if(match[1].endsWith('/'))continue;
    await readFile(path.join(root,match[1]));
  }
}
await mkdir(path.join(root,'dist'),{recursive:true});
for(const name of ['index.html','components.html','assets','docs'])await cp(path.join(root,name),path.join(root,'dist',name),{recursive:true});
await writeFile(path.join(root,'dist','.nojekyll'),'');
console.log('Static build ready in dist/. All JavaScript syntax and HTML asset references checked.');
