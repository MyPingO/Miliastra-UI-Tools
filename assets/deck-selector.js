(()=>{
'use strict';
if(typeof DeckSelectorDocument==='undefined'||typeof parseFields!=='function')return;
if(globalThis.__miliastraDeckSelectorEnhanced)return;
globalThis.__miliastraDeckSelectorEnhanced=true;

const colorNames=['White','Green','Blue','Purple','Orange','Red'];
const colorInternal=[0,1,2,3,4,9];
const concat=(...parts)=>{const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
const field=(fs,n,w=null)=>Array.isArray(fs)?fs.find(f=>f.number===n&&(w===null||f.wireType===w)):undefined;
const num=(fs,n,def=0)=>{const f=field(fs,n,0);return f?Number(f.value):def};

function walkFindLeaf(message,target){
  let fs;try{fs=parseFields(message)}catch{return null}
  for(const f of fs){
    if(f.number===target&&f.wireType===2){
      try{
        const inner=parseFields(f.value);
        if(target===23&&field(inner,502,0)&&field(inner,503,2))return f.value;
        if(target===24&&field(inner,502,0)&&field(inner,503,0)&&field(inner,504,0))return f.value;
      }catch{}
    }
    if(f.wireType===2){const found=walkFindLeaf(f.value,target);if(found)return found}
  }
  return null;
}
function replaceNestedLeaf(message,target,update){
  let fs;try{fs=parseFields(message)}catch{return{bytes:message,changed:false}}
  for(const f of fs){
    if(f.number===target&&f.wireType===2){
      try{
        const inner=parseFields(f.value);
        const match=target===23?(field(inner,502,0)&&field(inner,503,2)):(field(inner,502,0)&&field(inner,503,0)&&field(inner,504,0));
        if(match)return{bytes:replaceField(message,f,update(f.value)),changed:true};
      }catch{}
    }
    if(f.wireType===2){const child=replaceNestedLeaf(f.value,target,update);if(child.changed)return{bytes:replaceField(message,f,child.bytes),changed:true}}
  }
  return{bytes:message,changed:false};
}
function setVarint(message,n,value){const fs=parseFields(message),f=field(fs,n,0),numeric=Number(value);if(f)return replaceField(message,f,numeric);return numeric===0?message:concat(message,encodeField(n,0,numeric))}
function setText(message,n,value){const fs=parseFields(message),f=field(fs,n,2);return f?replaceField(message,f,new TextEncoder().encode(String(value??''))):message}

function readSettings(doc){
  const general=walkFindLeaf(doc.payload,23),known=walkFindLeaf(doc.payload,24);
  const g=general?parseFields(general):[],k=known?parseFields(known):[];
  return{
    displayTitle:!!num(g,502,0),titleText:field(g,503,2)?new TextDecoder('utf-8',{fatal:true}).decode(field(g,503,2).value):'',layout:num(g,505,0)===1?'grid':'list',
    showSelectedQuantity:!!num(g,506,0),showResetCountLimit:!!num(g,510,0),showRemainingTime:!!num(g,514,0),preEndWarningTime:num(g,517,0),
    pauseSinglePlayer:!!num(g,518,0),controlsCollapse:!!num(g,519,0),selectionCancelable:!!num(g,520,0),
    displayDeckIcon:!!num(k,502,0),displayDeckTitle:!!num(k,503,0),displayDeckDescription:!!num(k,504,0)
  };
}
function ensureSettings(doc){return doc.deckPageSettings||(doc.deckPageSettings=readSettings(doc))}

/* Only patch export serialization. Do not replace renderGia/createNewDeckGia/importCsv;
   those function replacements were interfering with the base editor's button handlers. */
const originalBuild=DeckSelectorDocument.prototype.buildFile;
DeckSelectorDocument.prototype.buildFile=function(){
  const settings=ensureSettings(this);
  let out=originalBuild.call(this),payload=out.slice(20,-4);
  payload=replaceNestedLeaf(payload,23,msg=>{
    msg=setVarint(msg,502,settings.displayTitle?1:0);msg=setText(msg,503,settings.titleText);msg=setVarint(msg,505,settings.layout==='grid'?1:0);
    msg=setVarint(msg,506,settings.showSelectedQuantity?1:0);msg=setVarint(msg,510,settings.showResetCountLimit?1:0);msg=setVarint(msg,514,settings.showRemainingTime?1:0);
    msg=setVarint(msg,517,Math.max(0,Math.trunc(Number(settings.preEndWarningTime)||0)));msg=setVarint(msg,518,settings.pauseSinglePlayer?1:0);
    msg=setVarint(msg,519,settings.controlsCollapse?1:0);msg=setVarint(msg,520,settings.selectionCancelable?1:0);return msg;
  }).bytes;
  payload=replaceNestedLeaf(payload,24,msg=>{msg=setVarint(msg,502,settings.displayDeckIcon?1:0);msg=setVarint(msg,503,settings.displayDeckTitle?1:0);msg=setVarint(msg,504,settings.displayDeckDescription?1:0);return msg}).bytes;
  const header=new Uint8Array(out.slice(0,20)),view=new DataView(header.buffer);view.setUint32(0,20+payload.length,false);view.setUint32(16,payload.length,false);
  const result=concat(header,payload,out.slice(-4));
  if(result.length-4!==view.getUint32(0,false)||result.length-24!==view.getUint32(16,false))throw new Error('Deck Selector export size validation failed');
  return result;
};

const originalColorLabel=deckColorLabel;
deckColorLabel=function(value){const n=Number(value),idx=colorInternal.indexOf(n);return idx>=0?`${idx+1} ${colorNames[idx]}`:originalColorLabel(value)};

function installUi(){
  const inspector=document.getElementById('deckInspector');if(!inspector||document.getElementById('deckPageSettings'))return;
  const style=document.createElement('style');style.textContent='.deck-settings{margin:0 0 12px;padding:10px;border:1px solid #27364d;border-radius:9px;background:#0c1421}.deck-settings h3{margin:0 0 8px;font-size:12px;color:#c7d3e3}.deck-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px}.deck-settings .field{margin:0}.deck-toggle{display:flex;align-items:center;gap:7px;min-height:34px;padding:6px 8px;border:1px solid #2b3950;border-radius:7px;background:#0b121e;color:#aebed2;font-size:11px}.deck-toggle input{width:auto}@media(max-width:1100px){.deck-settings-grid{grid-template-columns:1fr}}';document.head.append(style);
  const panel=document.createElement('div');panel.id='deckPageSettings';panel.className='deck-settings';panel.innerHTML='<h3>Deck Selector Settings</h3><div class="deck-settings-grid">'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayTitle"> Display Title</label><div class="field"><label>Title Text</label><input data-ds="titleText"></div>'+ 
    '<div class="field"><label>Interface Layout</label><select data-ds="layout"><option value="list">List</option><option value="grid">Grid</option></select></div>'+ 
    '<label class="deck-toggle"><input type="checkbox" data-ds="showSelectedQuantity"> Show selected quantity</label><label class="deck-toggle"><input type="checkbox" data-ds="showResetCountLimit"> Show reset count limit</label>'+ 
    '<label class="deck-toggle"><input type="checkbox" data-ds="showRemainingTime"> Show Remaining Time (s)</label><div class="field"><label>Pre-End Warning Time (s)</label><input type="number" min="0" step="1" data-ds="preEndWarningTime"></div>'+ 
    '<label class="deck-toggle"><input type="checkbox" data-ds="pauseSinglePlayer"> Pause Game on Page Open in Single-Player Mode</label><label class="deck-toggle"><input type="checkbox" data-ds="controlsCollapse"> Controls can collapse</label>'+ 
    '<label class="deck-toggle"><input type="checkbox" data-ds="selectionCancelable"> Selection can be canceled</label><label class="deck-toggle"><input type="checkbox" data-ds="displayDeckIcon"> Display Deck Icon</label>'+ 
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayDeckTitle"> Display Deck Title</label><label class="deck-toggle"><input type="checkbox" data-ds="displayDeckDescription"> Display Deck Description</label></div>';
  const componentPane=inspector.querySelector('[data-inspector-pane="component"]');
  if(componentPane)componentPane.append(panel);
  else inspector.insertBefore(panel,inspector.children[1]||null);
  panel.querySelectorAll('[data-ds]').forEach(control=>{const key=control.dataset.ds;const commit=()=>{if(currentDocument?.kind!=='gia-deck')return;const s=ensureSettings(currentDocument);s[key]=control.type==='checkbox'?control.checked:(control.type==='number'?Math.max(0,Math.trunc(Number(control.value)||0)):control.value)};control.addEventListener('input',commit);control.addEventListener('change',commit)});

  const oldType=document.getElementById('deckType'),oldColor=document.getElementById('deckTagCode');
  if(oldType&&!document.getElementById('deckTypeSelect')){const box=oldType.closest('.checkbox-box');if(box)box.style.display='none';const select=document.createElement('select');select.id='deckTypeSelect';select.innerHTML='<option value="known">Known Deck</option><option value="unknown">Unknown Deck</option>';box?.insertAdjacentElement('afterend',select);select.addEventListener('change',()=>{if(currentDocument?.kind!=='gia-deck')return;oldType.checked=select.value==='known';applyGiaFields(true,true);setTimeout(syncUi,0)})}
  if(oldColor&&!document.getElementById('deckColorSelect')){oldColor.style.display='none';const select=document.createElement('select');select.id='deckColorSelect';select.innerHTML=colorNames.map((name,i)=>`<option value="${i+1}">${i+1} ${name}</option>`).join('');oldColor.insertAdjacentElement('afterend',select);select.addEventListener('change',()=>{if(currentDocument?.kind!=='gia-deck')return;oldColor.value=String(colorInternal[Number(select.value)-1]);applyGiaFields(true,true);setTimeout(syncUi,0)});const lab=oldColor.closest('.field')?.querySelector('label');if(lab)lab.textContent='Tag Color'}
}

function syncUi(){
  if(currentDocument?.kind!=='gia-deck')return;
  currentDocument.label='Deck Selector';
  const s=ensureSettings(currentDocument),panel=document.getElementById('deckPageSettings');
  if(panel)panel.querySelectorAll('[data-ds]').forEach(control=>{const v=s[control.dataset.ds];if(control.type==='checkbox')control.checked=!!v;else if(document.activeElement!==control)control.value=v??''});
  const item=selectedIndex==null?null:currentDocument.items[selectedIndex];if(!item)return;
  const type=document.getElementById('deckTypeSelect');if(type)type.value=item.deckType?'known':'unknown';
  const icon=document.getElementById('deckIcon');if(icon){icon.disabled=!item.deckType;icon.title=item.deckType?'':'Unknown Decks do not display a custom Deck Icon. Existing serialized icon IDs are preserved.'}
  const color=document.getElementById('deckColorSelect');if(color){const idx=colorInternal.indexOf(Number(item.internalTagCode));color.value=idx>=0?String(idx+1):'1'}
}

installUi();
const body=document.getElementById('deckBody');if(body)new MutationObserver(()=>setTimeout(syncUi,0)).observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
document.addEventListener('click',event=>{if(currentDocument?.kind==='gia-deck'&&(event.target.closest('#deckBody')||event.target.closest('#giaToolbar')||event.target.closest('.quick-dock')))setTimeout(syncUi,0)});
const build=document.getElementById('newDeckButton');if(build)build.addEventListener('click',()=>setTimeout(()=>{if(currentDocument?.kind==='gia-deck'){currentDocument.label='Deck Selector';ensureSettings(currentDocument).titleText='';syncUi()}},0));
const card=build?.closest('.build-card');const title=card?.querySelector('h3');if(title)title.textContent='Deck Selector';if(build)build.textContent='Create Deck Selector';
})();
