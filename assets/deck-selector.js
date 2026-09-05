(()=>{
'use strict';
if(typeof DeckSelectorDocument==='undefined'||typeof parseFields!=='function')return;

const colorNames=['White','Green','Blue','Purple','Orange','Red'];
const concat=(...parts)=>{const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
const field=(fs,n,w=null)=>fs.find(f=>f.number===n&&(w===null||f.wireType===w));
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
    if(f.wireType===2){
      const child=replaceNestedLeaf(f.value,target,update);
      if(child.changed)return{bytes:replaceField(message,f,child.bytes),changed:true};
    }
  }
  return{bytes:message,changed:false};
}

function setVarint(message,n,value){
  const fs=parseFields(message),f=field(fs,n,0);
  if(f)return replaceField(message,f,Number(value));
  return concat(message,encodeField(n,0,Number(value)));
}
function setText(message,n,value){
  const fs=parseFields(message),f=field(fs,n,2);
  if(!f)return message;
  return replaceField(message,f,writeTextWrapper(f.value,String(value??'')));
}

function readSettings(doc){
  const general=walkFindLeaf(doc.payload,23),known=walkFindLeaf(doc.payload,24);
  const g=general?parseFields(general):[],k=known?parseFields(known):[];
  return{
    displayTitle:!!num(g,502,0),
    titleText:field(g,503,2)?readTextWrapper(field(g,503,2).value):'',
    layout:num(g,505,0)===1?'grid':'list',
    showSelectedQuantity:!!num(g,506,0),
    showResetCountLimit:!!num(g,510,0),
    showRemainingTime:!!num(g,514,0),
    preEndWarningTime:num(g,517,0),
    pauseSinglePlayer:!!num(g,518,0),
    controlsCollapse:!!num(g,519,0),
    selectionCancelable:!!num(g,520,0),
    displayDeckIcon:!!num(k,502,0),
    displayDeckTitle:!!num(k,503,0),
    displayDeckDescription:!!num(k,504,0)
  };
}
function ensureSettings(doc){return doc.deckPageSettings||(doc.deckPageSettings=readSettings(doc))}

const originalBuild=DeckSelectorDocument.prototype.buildFile;
DeckSelectorDocument.prototype.buildFile=function(){
  const settings=ensureSettings(this);
  let out=originalBuild.call(this),payload=out.slice(20,-4);
  payload=replaceNestedLeaf(payload,23,msg=>{
    msg=setVarint(msg,502,settings.displayTitle?1:0);
    msg=setText(msg,503,settings.titleText);
    msg=setVarint(msg,505,settings.layout==='grid'?1:0);
    msg=setVarint(msg,506,settings.showSelectedQuantity?1:0);
    msg=setVarint(msg,510,settings.showResetCountLimit?1:0);
    msg=setVarint(msg,514,settings.showRemainingTime?1:0);
    msg=setVarint(msg,517,Math.max(0,Math.trunc(Number(settings.preEndWarningTime)||0)));
    msg=setVarint(msg,518,settings.pauseSinglePlayer?1:0);
    msg=setVarint(msg,519,settings.controlsCollapse?1:0);
    msg=setVarint(msg,520,settings.selectionCancelable?1:0);
    return msg;
  }).bytes;
  payload=replaceNestedLeaf(payload,24,msg=>{
    msg=setVarint(msg,502,settings.displayDeckIcon?1:0);
    msg=setVarint(msg,503,settings.displayDeckTitle?1:0);
    msg=setVarint(msg,504,settings.displayDeckDescription?1:0);
    return msg;
  }).bytes;
  const header=new Uint8Array(out.slice(0,20)),view=new DataView(header.buffer);
  view.setUint32(0,20+payload.length,false);view.setUint32(16,payload.length,false);
  return concat(header,payload,out.slice(-4));
};

const originalCreate=createNewDeckGia;
createNewDeckGia=function(){
  originalCreate();
  if(currentDocument?.kind==='gia-deck'){
    currentDocument.label='Deck Selector';
    ensureSettings(currentDocument).titleText='';
    renderGia();
  }
};

const originalColorLabel=deckColorLabel;
deckColorLabel=function(value){
  const n=Number(value);
  return Number.isInteger(n)&&n>=0&&n<6?`${n+1} ${colorNames[n]}`:originalColorLabel(value);
};

function installUi(){
  const inspector=document.getElementById('deckInspector');if(!inspector||document.getElementById('deckPageSettings'))return;
  const style=document.createElement('style');
  style.textContent='.deck-settings{margin:0 0 12px;padding:10px;border:1px solid #27364d;border-radius:9px;background:#0c1421}.deck-settings h3{margin:0 0 8px;font-size:12px;color:#c7d3e3}.deck-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px}.deck-settings .field{margin:0}.deck-toggle{display:flex;align-items:center;gap:7px;min-height:34px;padding:6px 8px;border:1px solid #2b3950;border-radius:7px;background:#0b121e;color:#aebed2;font-size:11px}.deck-toggle input{width:auto}.deck-span2{grid-column:1/-1}@media(max-width:1100px){.deck-settings-grid{grid-template-columns:1fr}.deck-span2{grid-column:auto}}';
  document.head.append(style);
  const panel=document.createElement('div');panel.id='deckPageSettings';panel.className='deck-settings';
  panel.innerHTML='<h3>Deck Selector Settings</h3><div class="deck-settings-grid">'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayTitle"> Display Title</label>'+
    '<div class="field"><label>Title Text</label><input data-ds="titleText" placeholder=""></div>'+
    '<div class="field"><label>Interface Layout</label><select data-ds="layout"><option value="list">List</option><option value="grid">Grid</option></select></div>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="showSelectedQuantity"> Show selected quantity</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="showResetCountLimit"> Show reset count limit</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="showRemainingTime"> Show Remaining Time (s)</label>'+
    '<div class="field"><label>Pre-End Warning Time (s)</label><input type="number" min="0" step="1" data-ds="preEndWarningTime"></div>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="pauseSinglePlayer"> Pause Game on Page Open in Single-Player Mode</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="controlsCollapse"> Controls can collapse</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="selectionCancelable"> Selection can be canceled</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayDeckIcon"> Display Deck Icon</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayDeckTitle"> Display Deck Title</label>'+
    '<label class="deck-toggle"><input type="checkbox" data-ds="displayDeckDescription"> Display Deck Description</label>'+
    '</div>';
  inspector.insertBefore(panel,inspector.children[1]||null);
  panel.querySelectorAll('[data-ds]').forEach(control=>{
    const key=control.dataset.ds;
    const commit=()=>{
      if(currentDocument?.kind!=='gia-deck')return;
      const s=ensureSettings(currentDocument);
      s[key]=control.type==='checkbox'?control.checked:(control.type==='number'?Math.max(0,Math.trunc(Number(control.value)||0)):control.value);
    };
    control.addEventListener(control.type==='text'?'input':'change',commit);
    if(control.tagName==='INPUT'&&control.type!=='checkbox')control.addEventListener('input',commit);
  });

  const oldType=document.getElementById('deckType'),oldColor=document.getElementById('deckTagCode'),icon=document.getElementById('deckIcon');
  if(oldType){const box=oldType.closest('.checkbox-box');if(box)box.style.display='none';const select=document.createElement('select');select.id='deckTypeSelect';select.innerHTML='<option value="known">Known Deck</option><option value="unknown">Unknown Deck</option>';box?.insertAdjacentElement('afterend',select);select.addEventListener('change',()=>{oldType.checked=select.value==='known';applyGiaFields(true,true);syncUi()})}
  if(oldColor){oldColor.style.display='none';const select=document.createElement('select');select.id='deckColorSelect';select.innerHTML=colorNames.map((name,i)=>`<option value="${i+1}">${i+1} ${name}</option>`).join('');oldColor.insertAdjacentElement('afterend',select);select.addEventListener('change',()=>{oldColor.value=String(Number(select.value)-1);applyGiaFields(true,true);syncUi()});const lab=oldColor.closest('.field')?.querySelector('label');if(lab)lab.textContent='Tag Color'}
}

function syncUi(){
  if(currentDocument?.kind!=='gia-deck')return;
  currentDocument.label='Deck Selector';
  const s=ensureSettings(currentDocument),panel=document.getElementById('deckPageSettings');
  if(panel)panel.querySelectorAll('[data-ds]').forEach(control=>{const key=control.dataset.ds,v=s[key];if(control.type==='checkbox')control.checked=!!v;else control.value=v??''});
  const item=selectedIndex==null?null:currentDocument.items[selectedIndex];
  if(item){
    const type=document.getElementById('deckTypeSelect');if(type)type.value=item.deckType?'known':'unknown';
    const icon=document.getElementById('deckIcon');if(icon){icon.disabled=!item.deckType;icon.title=item.deckType?'':'Unknown Decks do not display a custom Deck Icon.'}
    const color=document.getElementById('deckColorSelect');if(color){const display=Number(item.internalTagCode)+1;color.value=display>=1&&display<=6?String(display):'1'}
  }
}

installUi();
const originalRender=renderGia;
renderGia=function(){const result=originalRender();installUi();syncUi();return result};

const originalImportCsv=importCsv;
importCsv=async function(file){
  const isDeck=currentDocument?.kind==='gia-deck';
  let hasDisplayColor=false;
  if(isDeck){try{const rows=parseCsv(await file.text());hasDisplayColor=rows.length&&Object.keys(rows[0]).some(k=>['Tag Color','Tag Color Index'].includes(k))}catch{}}
  await originalImportCsv(file);
  if(isDeck&&hasDisplayColor&&currentDocument?.kind==='gia-deck'){
    for(const item of currentDocument.items){const n=Number(item.internalTagCode);if(Number.isInteger(n)&&n>=1&&n<=6){item.internalTagCode=n-1;item.rawMessage=updateDeckEntry(item)}}
    renderGia();updateMeta();
  }
};

const card=document.getElementById('newDeckButton')?.closest('.build-card');
const title=card?.querySelector('h3');if(title)title.textContent='Deck Selector';
const button=document.getElementById('newDeckButton');if(button)button.textContent='Create Deck Selector';
})();
