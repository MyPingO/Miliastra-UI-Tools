(()=>{
'use strict';

/* Miliastra may serialize an empty text value as a zero-length field instead
   of a nested field-501 text wrapper. The base helper assumed the wrapper
   always existed, which caused otherwise-valid Deck Selector files with blank
   text fields to be rejected during detection. Keep normal wrapper behavior
   unchanged and only handle the zero-length representation explicitly. */
if(typeof readTextWrapper==='function'&&typeof writeTextWrapper==='function'){
  const originalReadTextWrapper=readTextWrapper;
  const originalWriteTextWrapper=writeTextWrapper;
  readTextWrapper=function(wrapperBytes){
    if(wrapperBytes instanceof Uint8Array&&wrapperBytes.length===0)return '';
    return originalReadTextWrapper(wrapperBytes);
  };
  writeTextWrapper=function(wrapperBytes,text){
    const normalizedText=String(text??'');
    if(wrapperBytes instanceof Uint8Array&&wrapperBytes.length===0){
      if(normalizedText==='')return wrapperBytes;
      return encodeField(501,2,new TextEncoder().encode(normalizedText));
    }
    return originalWriteTextWrapper(wrapperBytes,normalizedText);
  };
}

function installStructureTabs(){
  if(typeof globalThis.installMiliastraInspectorTabs!=='function')return;
  const structure=globalThis.installMiliastraInspectorTabs('structureInspector','Structure Field','Component Settings');
  if(!structure)return;
  const name=document.getElementById('structureName')?.closest('.field');
  const id=document.getElementById('structureId')?.closest('.field');
  const hr=structure.children.find(node=>node.tagName==='HR');
  structure.children.filter(node=>node!==name&&node!==id&&node!==hr).forEach(node=>structure.itemPane.append(node));
  if(name)structure.componentPane.append(name);
  if(id)structure.componentPane.append(id);
  document.getElementById('structureBody')?.addEventListener('click',()=>structure.activate('item'));
}

function installStatusTabs(){
  const overlay=document.querySelector('.sd-overlay');
  const wrap=overlay?.querySelector('.sd-wrap');
  if(!overlay||!wrap||wrap.querySelector('.sd-tabs'))return;
  const formalSection=overlay.querySelector('[data-formals]')?.closest('.sd-section');
  const itemSection=overlay.querySelector('[data-items]')?.closest('.sd-section');
  const monitorSection=overlay.querySelector('[data-monitor-scope]')?.closest('.sd-section');
  if(!formalSection||!itemSection)return;

  overlay.querySelector('[data-monitor-name]')?.removeAttribute('maxlength');

  const styleId='componentTabStatusStyle';
  if(!document.getElementById(styleId)){
    const style=document.createElement('style');
    style.id=styleId;
    style.textContent='.sd-tabs{display:flex;gap:6px;margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid #293950}.sd-tabs button{flex:1;color:#8fa3bd;background:#101827}.sd-tabs button.active{color:#eef6ff;background:#1b2d48;border-color:#42648f}.sd-wrap>.hidden{display:none!important}';
    document.head.append(style);
  }

  const tabs=document.createElement('div');
  tabs.className='sd-tabs';
  tabs.innerHTML='<button type="button" class="active" data-sd-tab="items">Status Items</button><button type="button" data-sd-tab="component">Component Settings</button>';
  const itemPane=document.createElement('div');
  itemPane.dataset.sdPane='items';
  const componentPane=document.createElement('div');
  componentPane.dataset.sdPane='component';
  componentPane.className='hidden';
  wrap.prepend(tabs,itemPane,componentPane);
  itemPane.append(itemSection);
  if(monitorSection)componentPane.append(monitorSection);
  componentPane.append(formalSection);

  const activate=kind=>{
    tabs.querySelectorAll('[data-sd-tab]').forEach(button=>button.classList.toggle('active',button.dataset.sdTab===kind));
    itemPane.classList.toggle('hidden',kind!=='items');
    componentPane.classList.toggle('hidden',kind!=='component');
  };
  tabs.addEventListener('click',event=>{
    const button=event.target.closest('[data-sd-tab]');
    if(button)activate(button.dataset.sdTab);
  });
  itemPane.addEventListener('click',event=>{
    if(event.target.closest('.sd-card'))activate('items');
  });
}

function isDeckItemControl(target){
  if(!(target instanceof Element))return false;
  const deckInspector=document.getElementById('deckInspector');
  if(!deckInspector?.contains(target))return false;
  if(target.closest('[data-inspector-pane="component"]')||target.closest('#deckPageSettings'))return false;
  return target.matches('input,textarea,select');
}

function installDeckItemListRefresh(){
  const inspector=document.querySelector('.inspector');
  const deckInspector=document.getElementById('deckInspector');
  if(!inspector||!deckInspector||inspector.dataset.deckItemListRefresh==='1')return;
  inspector.dataset.deckItemListRefresh='1';

  inspector.addEventListener('change',event=>{
    if(currentDocument?.kind!=='gia-deck'||!isDeckItemControl(event.target))return;
    renderGia();
  });

  deckInspector.addEventListener('keydown',event=>{
    if(
      event.key!=='Enter' ||
      event.isComposing ||
      event.target instanceof HTMLTextAreaElement ||
      !isDeckItemControl(event.target)
    )return;
    event.preventDefault();
    event.stopPropagation();
    applyGiaFields(true,true);
  });
}

function installDeckBuildDefaults(){
  const button=document.getElementById('newDeckButton');
  if(!button||button.dataset.emptyTagDefault==='1')return;
  button.dataset.emptyTagDefault='1';
  button.addEventListener('click',()=>{
    setTimeout(()=>{
      if(currentDocument?.kind!=='gia-deck'||!currentDocument.items?.length)return;
      const item=currentDocument.items[0];
      item.tag='';
      item.rawMessage=updateDeckEntry(item);
      renderGia();
    },0);
  });
}

installStructureTabs();
installStatusTabs();
installDeckItemListRefresh();
installDeckBuildDefaults();
const observer=new MutationObserver(()=>installStatusTabs());
observer.observe(document.body,{childList:true,subtree:true});
})();
