(()=>{document.title='Miliastra UI Tools · Data Editor';const brand=document.querySelector('.brand');if(brand)brand.textContent='Miliastra UI Tools';const notice=document.querySelector('.notice');if(notice)notice.innerHTML='<strong>Local processing.</strong> Files stay in your browser. Nothing is uploaded.';const open=document.getElementById('openButton');if(open)open.textContent='Open';const buildTitle=document.querySelector('.build-title p');if(buildTitle)buildTitle.textContent='Choose a format and start editing immediately.';document.querySelectorAll('.build-card').forEach(card=>{const button=card.querySelector('button');if(!button)return;button.textContent=button.textContent.replace(' GIA','').replace(' JSON','');card.setAttribute('tabindex','0');card.setAttribute('role','button');card.addEventListener('click',event=>{if(event.target.closest('button,input,select,textarea,a'))return;button.click()});card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();button.click()}})});const buildWrap=document.querySelector('.build-wrap');if(buildWrap){const sections=[...buildWrap.querySelectorAll(':scope > .build-section')];const byHeading=text=>sections.find(section=>section.querySelector('h2')?.textContent.trim()===text);const giaSection=byHeading('UI Component Exports (.gia)');const giaTypes=byHeading('Verified Structure GIA Types');const variableTypes=byHeading('Verified Structure Variable Types');const jsonSection=byHeading('Variable Exports (.json)');if(giaSection&&jsonSection)giaSection.insertAdjacentElement('afterend',jsonSection);const templateNote=giaSection?.querySelector('.build-note');const details=document.createElement('details');details.className='build-reference';details.innerHTML='<summary>Reference & supported types</summary><div class="build-reference-body"></div>';const body=details.querySelector('.build-reference-body');if(templateNote){const group=document.createElement('div');group.className='build-reference-group full';group.innerHTML='<strong>GIA template behavior</strong>'+templateNote.innerHTML;body.append(group);templateNote.remove()}if(giaTypes){const note=giaTypes.querySelector('.build-note');if(note){const group=document.createElement('div');group.className='build-reference-group';group.innerHTML='<strong>Structure GIA types</strong>'+note.innerHTML;body.append(group)}giaTypes.remove()}if(variableTypes){const note=variableTypes.querySelector('.build-note');if(note){const group=document.createElement('div');group.className='build-reference-group';group.innerHTML='<strong>JSON Structure variable types</strong>'+note.innerHTML;body.append(group)}variableTypes.remove()}if(jsonSection)jsonSection.insertAdjacentElement('afterend',details);else buildWrap.append(details);const copy={newSingleButton:'Single Choice page with Formal Variables and editable options.',newDeckButton:'Deck rows with titles, icons, tags, colors, and descriptions.',newTabButton:'Tabs with Formal Variables and visibility mappings.',newStructureGiaButton:'Typed Structure fields, list defaults, and generated metadata.',newDictButton:'Typed JSON dictionary with primitive or container values.',newStructButton:'JSON Structure with scalar, list, dictionary, and nested types.'};Object.entries(copy).forEach(([id,text])=>{const button=document.getElementById(id);const p=button?.closest('.build-card')?.querySelector('p');if(p)p.textContent=text})}

/* Build-New Tab pages use temporary unique UI IDs instead of the IDs embedded in the template. Miliastra remaps these on import while preserving references. */
function encodeTemporaryVarint(value){const out=[];let n=BigInt(value);while(n>=128n){out.push(Number((n&127n)|128n));n>>=7n}out.push(Number(n));return new Uint8Array(out)}
function replaceAllByteSequences(bytes,from,to){if(from.length!==to.length)throw new Error('Temporary UI ID replacement changed varint length.');const out=new Uint8Array(bytes);outer:for(let i=0;i<=out.length-from.length;i++){for(let j=0;j<from.length;j++)if(out[i+j]!==from[j])continue outer;out.set(to,i);i+=from.length-1}return out}
function collectTemplateUiIds(bytes){const probe=new TabDocument('Tab ID probe.gia',bytes);const ids=[];for(const field of parseFields(probe.payload)){if(field.number!==2||field.wireType!==2)continue;const id=componentRefId(field.value);if(id!==null&&!ids.includes(Number(id)))ids.push(Number(id))}return ids}
function generateTemporaryUiIds(count,used){const result=[];const taken=new Set(used);const cryptoApi=globalThis.crypto;while(result.length<count){let random;if(cryptoApi?.getRandomValues){const buf=new Uint32Array(1);cryptoApi.getRandomValues(buf);random=buf[0]&0x000fffff}else random=Math.floor(Math.random()*0x100000);const candidate=0x40000000|random;if(taken.has(candidate))continue;taken.add(candidate);result.push(candidate)}return result}
function createFreshTabTemplateBytes(){let bytes=base64ToBytes(EMBEDDED_GIA.tab);const sourceIds=collectTemplateUiIds(bytes);if(!sourceIds.length)throw new Error('No UI element IDs were detected in the Tab template.');const generatedIds=generateTemporaryUiIds(sourceIds.length,sourceIds);for(let i=0;i<sourceIds.length;i++){const from=encodeTemporaryVarint(sourceIds[i]);const to=encodeTemporaryVarint(generatedIds[i]);bytes=replaceAllByteSequences(bytes,from,to)}return bytes}
function createNewTabGiaWithFreshIds(){const bytes=createFreshTabTemplateBytes();const documentModel=new TabDocument('New Tab Page.gia',bytes);const template=documentModel.items[0];documentModel.formalVariables=[];documentModel.items=[{internalName:'New Tab',values:[],order:1,rawMessage:template.rawMessage,containerVisibility:{},controlVisibility:{}}];documentModel.visibilityTargets=detectTabVisibilityTargets(documentModel.payload,documentModel.items);documentModel.normalize();currentDocument=documentModel;selectedIndex=0;batchDeleteMode=false;giaFilterText='';elements.giaFilterInput.value='';elements.clearGiaFilterButton.disabled=true;resetHistory();switchView('editor');refreshModeUi();setBatchDeleteMode(false);requestAnimationFrame(()=>{elements.singleInternalName.focus();elements.singleInternalName.select()});setStatus(`Created a Tab page with ${collectTemplateUiIds(bytes).length} temporary unique UI IDs. Miliastra will remap them on import.`,'success')}
const tabBuildButton=document.getElementById('newTabButton');if(tabBuildButton){tabBuildButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();try{createNewTabGiaWithFreshIds()}catch(error){console.error(error);setStatus(`Could not create Tab page: ${error.message}`,'error')}},true)}

const inspector=document.querySelector('.inspector');const original={add:document.getElementById('addButton'),duplicate:document.getElementById('duplicateButton'),up:document.getElementById('upButton'),down:document.getElementById('downButton'),del:document.getElementById('deleteButton')};if(inspector&&original.add){const dock=document.createElement('div');dock.className='quick-dock empty';dock.innerHTML="<div class='quick-dock-row'><span class='quick-label'>Selected item</span><button class='quick-add' data-action='add'>+ Add after</button><button data-action='duplicate'>Duplicate</button><span class='dock-sep'></span><button data-action='up' title='Move up'>↑</button><button data-action='down' title='Move down'>↓</button><button class='quick-delete' data-action='del'>Delete</button></div><div class='quick-dock-hints'><span><kbd>Enter</kbd> edit name</span><span><kbd>Ctrl D</kbd> duplicate</span><span><kbd>Alt ↑↓</kbd> move</span><span><kbd>Del</kbd> delete</span></div>";inspector.prepend(dock);const buttons={};dock.querySelectorAll('[data-action]').forEach(button=>{const action=button.dataset.action;buttons[action]=button;button.addEventListener('click',()=>original[action]?.click())});const syncDock=()=>{const selected=!!document.querySelector('tbody tr.selected');dock.classList.toggle('empty',!selected);Object.entries(buttons).forEach(([action,button])=>{const src=original[action];button.disabled=!src||src.disabled})};const observer=new MutationObserver(syncDock);Object.values(original).filter(Boolean).forEach(button=>observer.observe(button,{attributes:true,attributeFilter:['disabled']}));['singleBody','deckBody','structureBody'].forEach(id=>{const tbody=document.getElementById(id);if(tbody)observer.observe(tbody,{subtree:true,attributes:true,childList:true,attributeFilter:['class']})});syncDock()}const topbar=document.querySelector('.topbar');if(topbar){const shortcuts=document.createElement('button');shortcuts.className='shortcut-button';shortcuts.type='button';shortcuts.textContent='?';shortcuts.title='Keyboard shortcuts';const exportButton=document.getElementById('exportButton');if(exportButton)exportButton.insertAdjacentElement('afterend',shortcuts);else topbar.append(shortcuts);const panel=document.createElement('div');panel.className='shortcut-panel hidden';panel.innerHTML='<div class="shortcut-card"><div class="shortcut-head"><strong>Keyboard shortcuts</strong><button data-close>Close</button></div><div class="shortcut-grid"><div class="shortcut-section"><h3>File & history</h3><div class="shortcut-row"><span>Open file</span><span><kbd>Ctrl O</kbd></span></div><div class="shortcut-row"><span>Export</span><span><kbd>Ctrl S</kbd></span></div><div class="shortcut-row"><span>Build New</span><span><kbd>Ctrl N</kbd></span></div><div class="shortcut-row"><span>Undo / Redo</span><span><kbd>Ctrl Z</kbd> / <kbd>Ctrl Y</kbd></span></div><div class="shortcut-row"><span>Filter</span><span><kbd>Ctrl F</kbd></span></div></div><div class="shortcut-section"><h3>Items</h3><div class="shortcut-row"><span>Add</span><span><kbd>Insert</kbd></span></div><div class="shortcut-row"><span>Edit primary field</span><span><kbd>Enter</kbd></span></div><div class="shortcut-row"><span>Duplicate</span><span><kbd>Ctrl D</kbd></span></div><div class="shortcut-row"><span>Copy / Paste</span><span><kbd>Ctrl C</kbd> / <kbd>Ctrl V</kbd></span></div><div class="shortcut-row"><span>Select previous / next</span><span><kbd>↑</kbd> / <kbd>↓</kbd></span></div><div class="shortcut-row"><span>Move previous / next</span><span><kbd>Alt ↑</kbd> / <kbd>Alt ↓</kbd></span></div><div class="shortcut-row"><span>Delete</span><span><kbd>Del</kbd></span></div></div></div></div>';document.body.append(panel);const setPanel=value=>panel.classList.toggle('hidden',!value);shortcuts.addEventListener('click',()=>setPanel(true));panel.querySelector('[data-close]').addEventListener('click',()=>setPanel(false));panel.addEventListener('click',event=>{if(event.target===panel)setPanel(false)});document.addEventListener('keydown',event=>{if(event.key==='?'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();setPanel(true)}if(event.key==='Escape'&&!panel.classList.contains('hidden')){event.preventDefault();event.stopImmediatePropagation();setPanel(false)}},true)}})();

(()=>{
'use strict';

function installInspectorTabs(inspectorId,itemLabel='Selected Item',componentLabel='Component Settings'){
  const inspector=document.getElementById(inspectorId);
  if(!inspector||inspector.dataset.inspectorTabs==='1')return null;
  inspector.dataset.inspectorTabs='1';

  const children=[...inspector.children];
  const tabs=document.createElement('div');
  tabs.className='inspector-tabs';
  tabs.innerHTML=`<button type="button" class="inspector-tab active" data-inspector-tab="item">${itemLabel}</button><button type="button" class="inspector-tab" data-inspector-tab="component">${componentLabel}</button>`;
  const itemPane=document.createElement('div');
  itemPane.className='inspector-tab-pane';
  itemPane.dataset.inspectorPane='item';
  const componentPane=document.createElement('div');
  componentPane.className='inspector-tab-pane hidden';
  componentPane.dataset.inspectorPane='component';

  inspector.append(tabs,itemPane,componentPane);

  const activate=kind=>{
    tabs.querySelectorAll('[data-inspector-tab]').forEach(button=>button.classList.toggle('active',button.dataset.inspectorTab===kind));
    itemPane.classList.toggle('hidden',kind!=='item');
    componentPane.classList.toggle('hidden',kind!=='component');
  };
  tabs.addEventListener('click',event=>{
    const button=event.target.closest('[data-inspector-tab]');
    if(button)activate(button.dataset.inspectorTab);
  });

  return{inspector,tabs,itemPane,componentPane,children,activate};
}

globalThis.installMiliastraInspectorTabs=installInspectorTabs;

const single=installInspectorTabs('singleInspector','List Item','Component Settings');
if(single){
  const formalMeta=document.getElementById('formalVariableEditor')?.closest('.meta');
  const singleSettings=document.getElementById('singleChoiceSettingsPanel');
  const tabVisibility=document.getElementById('tabVisibilityEditor');
  const itemNodes=single.children.filter(node=>node!==formalMeta&&node!==singleSettings);
  itemNodes.forEach(node=>single.itemPane.append(node));
  if(formalMeta)single.componentPane.append(formalMeta);
  if(singleSettings)single.componentPane.append(singleSettings);
  /* Tab visibility belongs to the selected Tab item, not the component. */
  if(tabVisibility&&!single.itemPane.contains(tabVisibility))single.itemPane.append(tabVisibility);
  document.getElementById('singleBody')?.addEventListener('click',()=>single.activate('item'));
}

const deck=installInspectorTabs('deckInspector','Deck Item','Component Settings');
if(deck){
  deck.children.forEach(node=>deck.itemPane.append(node));
  document.getElementById('deckBody')?.addEventListener('click',()=>deck.activate('item'));
  globalThis.__miliastraDeckInspectorTabs=deck;
}
})();

