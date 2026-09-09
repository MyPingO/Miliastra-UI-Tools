import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {GameDocument} from '../assets/game-document.mjs';
import {demoFile} from '../assets/demo.mjs';
const root=new URL('../',import.meta.url);
test('pinned component modules build and round-trip generated rows',async()=>{
  const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>{if(!e.message.includes('CSS'))errors.push(e.message);});console.on('error',(...args)=>errors.push(args.map(String).join(' ')));
  const dom=new JSDOM(await fs.readFile(new URL('assets/editor-core.html',root),'utf8'),{
    url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,
    beforeParse(w){
      w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.alert=message=>errors.push('Alert: '+message);w.confirm=()=>true;
      w.fetch=async url=>{const local=new URL(String(url),'http://localhost/');try{const content=await fs.readFile(new URL(local.pathname.slice(1),root),'utf8');return{ok:true,text:async()=>content};}catch{return{ok:false,text:async()=>''};}};
      w.structuredClone=value=>{
        const clone=v=>v instanceof w.Uint8Array?new w.Uint8Array(v):Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;return clone(value);
      };
      w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    }
  });
  const w=dom.window;
  const scripts=['site.js','status-display.js','component-tabs.js','dictionary-key-types.js','dictionary-structure-config.js','structure-gia-references.js','data-shape-safety.js','value-editors.js','structure-gia-build-types.js','gia-dictionaries.js','dictionary-no-nesting.js'];
  const append=code=>{const script=w.document.createElement('script');script.textContent=code;w.document.body.append(script);};
  for(const name of scripts)append(await fs.readFile(new URL('assets/'+name,root),'utf8'));
  append((await Promise.all([1,2,3].map(n=>fs.readFile(new URL(`assets/final-audit-fixes.part${n}.txt`,root),'utf8')))).join(''));
  append(await fs.readFile(new URL('assets/component-workbench.js',root),'utf8'));
  await w.miliastraEnhancementsReady;
  assert.ok(w.MiliastraBridge);
  // Expose a tiny test adapter from the actual global script scope.
  append('globalThis.testDocument=()=>currentDocument; globalThis.reopenTest=bytes=>detectGia("roundtrip.gia",bytes);');
  for(const kind of ['single','deck','tab']){
    await w.MiliastraBridge.create(kind);
    const model=w.testDocument();assert.ok(model?.items.length,`${kind} created`);
    const count=model.items.length;
    [...w.document.querySelectorAll('#giaToolbar button')].find(b=>b.textContent==='Generate rows').click();
    const dialog=w.document.querySelector('dialog');dialog.querySelector('[data-count]').value='3';dialog.querySelector('[data-pattern]').value='Test {n}';dialog.querySelector('[data-apply]').click();
    assert.equal(model.items.length,count+3,`${kind} generator appends rows`);
    const bytes=model.buildFile(),reopened=w.reopenTest(bytes);assert.equal(reopened.items.length,model.items.length,`${kind} round-trip count`);
    const generic=new GameDocument('generated.gia',Uint8Array.from(bytes));assert.deepEqual(generic.export(),Uint8Array.from(bytes));assert.ok(generic.records.length>0);
    const names=reopened.items.map(x=>kind==='deck'?x.title:x.internalName);assert.ok(names.includes('Test 1'),`${kind} generated name survives`);
  }
  assert.throws(()=>w.reopenTest(new w.Uint8Array(demoFile())),/Game workspace/);
  assert.deepEqual(errors,[]);dom.window.close();
});
