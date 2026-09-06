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

function makeUniqueName(baseName,usedNames,maxLength=20){
  const fallback='Variable';
  let base=String(baseName??'').trim()||fallback;
  base=base.slice(0,maxLength);
  if(!usedNames.has(base))return base;
  for(let suffixNumber=2;suffixNumber<10000;suffixNumber+=1){
    const suffix=` ${suffixNumber}`;
    const candidate=`${base.slice(0,Math.max(1,maxLength-suffix.length))}${suffix}`;
    if(!usedNames.has(candidate))return candidate;
  }
  throw new Error('Could not generate a unique variable name.');
}

function ensureUniqueStructureGiaNames(documentModel=currentDocument){
  if(documentModel?.kind!=='gia-structure'||!documentModel.structureBuildMode)return false;
  const usedNames=new Set();
  let changed=false;
  documentModel.items.forEach((item,index)=>{
    const currentName=String(item.name??'').trim();
    if(!usedNames.has(currentName)){
      usedNames.add(currentName);
      return;
    }
    const uniqueName=makeUniqueName(currentName||`Field ${index+1}`,usedNames,20);
    item.name=uniqueName;
    item.originalName=uniqueName;
    usedNames.add(uniqueName);
    changed=true;
  });
  return changed;
}

function ensureUniqueJsonStructureNames(documentModel=currentDocument){
  if(documentModel?.kind!=='json-struct'||documentModel.source!=='new'||!Array.isArray(documentModel.object?.value))return false;
  const usedNames=new Set();
  let changed=false;
  documentModel.object.value.forEach((member,index)=>{
    const currentName=String(member?.key??'');
    if(!usedNames.has(currentName)){
      usedNames.add(currentName);
      return;
    }
    const uniqueName=makeUniqueName(currentName||`Variable ${index+1}`,usedNames,20);
    member.key=uniqueName;
    usedNames.add(uniqueName);
    changed=true;
  });
  return changed;
}

function canonicalDictionaryKey(dictionary,value){
  if(dictionary?.key_type==='Int32'){
    const numericValue=Number(value);
    if(Number.isFinite(numericValue))return String(Math.trunc(numericValue));
  }
  return String(value??'');
}

function nextUniqueDictionaryKey(dictionary,baseValue,usedKeys,index){
  if(dictionary?.key_type==='Int32'){
    const numericValue=Number(baseValue);
    let candidate=Number.isFinite(numericValue)?Math.trunc(numericValue)+1:0;
    while(usedKeys.has(String(candidate)))candidate+=1;
    return String(candidate);
  }
  const base=String(baseValue??'')||`Key ${index+1}`;
  if(!usedKeys.has(base))return base;
  for(let suffixNumber=2;suffixNumber<10000;suffixNumber+=1){
    const candidate=`${base} ${suffixNumber}`;
    if(!usedKeys.has(candidate))return candidate;
  }
  throw new Error('Could not generate a unique dictionary key.');
}

function visitDictionaries(value,callback,visited=new Set()){
  if(!value||typeof value!=='object'||visited.has(value))return;
  visited.add(value);
  if(value.type==='Dict'&&Array.isArray(value.value))callback(value);
  if(Array.isArray(value)){
    value.forEach(item=>visitDictionaries(item,callback,visited));
    return;
  }
  Object.values(value).forEach(item=>visitDictionaries(item,callback,visited));
}

function ensureUniqueDictionaryKeys(documentModel=currentDocument){
  if(!documentModel||documentModel.source!=='new'||!documentModel.object)return false;
  let changed=false;
  visitDictionaries(documentModel.object,dictionary=>{
    const usedKeys=new Set();
    dictionary.value.forEach((entry,index)=>{
      if(!entry?.key)return;
      const currentValue=entry.key.value;
      const canonicalValue=canonicalDictionaryKey(dictionary,currentValue);
      if(!usedKeys.has(canonicalValue)){
        usedKeys.add(canonicalValue);
        return;
      }
      const uniqueValue=nextUniqueDictionaryKey(dictionary,currentValue,usedKeys,index);
      entry.key.value=uniqueValue;
      usedKeys.add(canonicalDictionaryKey(dictionary,uniqueValue));
      changed=true;
    });
  });
  return changed;
}

function duplicateStructureGiaName(name,indexToIgnore){
  if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode)return false;
  return currentDocument.items.some((item,index)=>index!==indexToIgnore&&String(item.name??'').trim()===name);
}

function installStructureNameGuard(){
  const input=document.getElementById('structureFieldName');
  if(!input||input.dataset.uniqueNameGuard==='1')return;
  input.dataset.uniqueNameGuard='1';

  const rejectDuplicate=event=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode||selectedIndex==null)return false;
    const candidate=String(input.value??'').trim().slice(0,20);
    if(!candidate||!duplicateStructureGiaName(candidate,selectedIndex))return false;
    const currentName=currentDocument.items[selectedIndex]?.name??'';
    input.value=currentName;
    input.setCustomValidity('Structure field names must be unique.');
    input.reportValidity();
    input.setCustomValidity('');
    if(event){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    setStatus?.(`Structure field name “${candidate}” is already in use.`,'error');
    return true;
  };

  input.addEventListener('change',rejectDuplicate);
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter')rejectDuplicate(event);
  });
}

function installJsonUniquenessPatches(){
  if(typeof renderJson==='function'&&!globalThis.__miliastraUniqueRenderJson){
    globalThis.__miliastraUniqueRenderJson=true;
    const originalRenderJson=renderJson;
    renderJson=function(...args){
      if(currentDocument?.source==='new'){
        ensureUniqueJsonStructureNames(currentDocument);
        ensureUniqueDictionaryKeys(currentDocument);
      }
      return originalRenderJson(...args);
    };
  }

  if(typeof renderRootStruct==='function'&&!globalThis.__miliastraUniqueStructureEditor){
    globalThis.__miliastraUniqueStructureEditor=true;
    const originalRenderRootStruct=renderRootStruct;
    renderRootStruct=function(root){
      const host=originalRenderRootStruct(root);
      if(currentDocument?.kind!=='json-struct'||currentDocument.source!=='new')return host;
      const variableFields=[...host.querySelectorAll('.field')].filter(field=>field.querySelector(':scope > label')?.textContent.trim()==='Variable Name');
      variableFields.forEach((field,index)=>{
        const control=field.querySelector('input,textarea,select');
        const member=root.value?.[index];
        if(!control||!member)return;
        control.dataset.lastUniqueValue=String(member.key??'');
        const validate=()=>{
          const candidate=String(member.key??'');
          const duplicate=root.value.some((other,otherIndex)=>otherIndex!==index&&String(other?.key??'')===candidate);
          if(!duplicate){
            control.dataset.lastUniqueValue=candidate;
            return;
          }
          const previousValue=control.dataset.lastUniqueValue??'';
          member.key=previousValue;
          control.value=previousValue;
          setStatus?.(`Structure variable name “${candidate}” is already in use.`,'error');
        };
        control.addEventListener('input',validate);
        control.addEventListener('change',validate);
      });
      return host;
    };
  }

  if(typeof renderDictionary==='function'&&!globalThis.__miliastraUniqueDictionaryEditor){
    globalThis.__miliastraUniqueDictionaryEditor=true;
    const originalRenderDictionary=renderDictionary;
    renderDictionary=function(dictionary,nested=false){
      const card=originalRenderDictionary(dictionary,nested);
      if(currentDocument?.source!=='new')return card;
      const entriesHost=card.children[1];
      if(!entriesHost)return card;
      [...entriesHost.children].forEach((entryCard,index)=>{
        const keyHost=entryCard.querySelector(':scope > .json-entry-key');
        const control=keyHost?.querySelector('input,textarea,select');
        const entry=dictionary.value?.[index];
        if(!control||!entry?.key)return;
        control.dataset.lastUniqueKey=String(entry.key.value??'');
        const validate=()=>{
          const candidate=entry.key.value;
          const canonicalCandidate=canonicalDictionaryKey(dictionary,candidate);
          const duplicate=dictionary.value.some((other,otherIndex)=>otherIndex!==index&&canonicalDictionaryKey(dictionary,other?.key?.value)===canonicalCandidate);
          if(!duplicate){
            control.dataset.lastUniqueKey=String(candidate??'');
            return;
          }
          const previousValue=control.dataset.lastUniqueKey??'';
          entry.key.value=previousValue;
          control.value=previousValue;
          setStatus?.(`Dictionary key “${candidate}” is already in use.`,'error');
        };
        control.addEventListener('input',validate);
        control.addEventListener('change',validate);
      });
      return card;
    };
  }

  if(typeof validateDictionary==='function'&&!globalThis.__miliastraUniqueDictionaryValidation){
    globalThis.__miliastraUniqueDictionaryValidation=true;
    const originalValidateDictionary=validateDictionary;
    validateDictionary=function(dictionary,path,errors,warnings){
      originalValidateDictionary(dictionary,path,errors,warnings);
      if(!dictionary||!Array.isArray(dictionary.value))return;
      const seenKeys=new Map();
      dictionary.value.forEach((entry,index)=>{
        if(!entry?.key)return;
        const canonicalKey=canonicalDictionaryKey(dictionary,entry.key.value);
        if(seenKeys.has(canonicalKey)){
          errors.push(`${path}: duplicate key “${entry.key.value}” at entries ${seenKeys.get(canonicalKey)+1} and ${index+1}.`);
        }else{
          seenKeys.set(canonicalKey,index);
        }
      });
    };
  }

  if(typeof validateJsonDocument==='function'&&!globalThis.__miliastraUniqueStructureValidation){
    globalThis.__miliastraUniqueStructureValidation=true;
    const originalValidateJsonDocument=validateJsonDocument;
    validateJsonDocument=function(documentModel){
      const result=originalValidateJsonDocument(documentModel);
      if(documentModel?.kind==='json-struct'&&Array.isArray(documentModel.object?.value)){
        const seenNames=new Map();
        documentModel.object.value.forEach((member,index)=>{
          const name=String(member?.key??'');
          if(!name)return;
          if(seenNames.has(name)){
            result.errors.push(`Structure: duplicate variable name “${name}” at variables ${seenNames.get(name)+1} and ${index+1}.`);
          }else{
            seenNames.set(name,index);
          }
        });
      }
      return result;
    };
  }
}

function installStructureBuildValidation(){
  if(typeof StructureGiaDocument==='undefined'||globalThis.__miliastraUniqueStructureGiaValidation)return;
  globalThis.__miliastraUniqueStructureGiaValidation=true;
  const originalBuildFile=StructureGiaDocument.prototype.buildFile;
  StructureGiaDocument.prototype.buildFile=function(){
    if(this.structureBuildMode){
      const seenNames=new Set();
      for(const item of this.items){
        const name=String(item.name??'').trim();
        if(!name)throw new Error('Structure field names cannot be empty.');
        if(seenNames.has(name))throw new Error(`Structure field name “${name}” is duplicated. Field names must be unique.`);
        seenNames.add(name);
      }
    }
    return originalBuildFile.call(this);
  };
}

function installRenderGiaUniqueness(){
  if(typeof renderGia!=='function'||globalThis.__miliastraUniqueRenderGia)return;
  globalThis.__miliastraUniqueRenderGia=true;
  const originalRenderGia=renderGia;
  renderGia=function(...args){
    ensureUniqueStructureGiaNames(currentDocument);
    return originalRenderGia(...args);
  };
}

function installBuildTabVisibilityBehavior(){
  if(typeof renderTabVisibilityEditor==='function'&&!globalThis.__miliastraBuildTabVisibilityPatched){
    globalThis.__miliastraBuildTabVisibilityPatched=true;
    const originalRenderTabVisibilityEditor=renderTabVisibilityEditor;
    renderTabVisibilityEditor=function(item){
      if(currentDocument?.kind==='gia-tab'&&currentDocument.tabBuildMode){
        elements.tabVisibilityEditor?.classList.add('hidden');
        return;
      }
      elements.tabVisibilityEditor?.classList.remove('hidden');
      return originalRenderTabVisibilityEditor(item);
    };
  }

  if(document.documentElement.dataset.tabBuildVisibilityHook==='1')return;
  document.documentElement.dataset.tabBuildVisibilityHook='1';
  document.addEventListener('click',event=>{
    if(!event.target.closest('#newTabButton'))return;
    setTimeout(()=>{
      if(currentDocument?.kind!=='gia-tab')return;
      currentDocument.tabBuildMode=true;
      currentDocument.visibilityTargets={containers:[],controls:[]};
      currentDocument.items?.forEach(item=>{
        item.containerVisibility={};
        item.controlVisibility={};
      });
      renderGia();
    },0);
  },true);
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
    style.textContent=`
.sd-overlay{background:var(--bg,#0d1117);color:var(--text,#eef3f8);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.sd-head{padding:11px 15px;background:#111720;border-bottom:1px solid var(--line,#2b3543)}
.sd-head h2{font-size:16px;font-weight:760;margin-right:10px}
.sd-head button{padding:7px 11px;border-radius:7px;background:var(--panel2,#1b222d);border-color:var(--line2,#3a4759)}
.sd-head button.primary{background:var(--accent-dark,#2e6fc4);border-color:#4387df}
.sd-file{color:var(--muted,#98a6b6);font-size:12px}
.sd-main{padding:0;background:#0e141b}
.sd-wrap{max-width:1050px;margin:0 auto;padding:24px}
.sd-tabs{display:flex;gap:6px;margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line,#2b3543)}
.sd-tabs button{flex:1;color:var(--muted,#98a6b6);background:transparent;border-color:transparent}
.sd-tabs button.active{color:var(--text,#eef3f8);background:var(--panel2,#1b222d);border-color:var(--line2,#3a4759)}
.sd-section{margin:0 0 12px;padding:15px;border:1px solid var(--line,#2b3543);border-radius:10px;background:var(--panel,#151b23)}
.sd-section h3{font-size:12px;color:var(--muted,#98a6b6)}
.sd-note{color:var(--muted,#98a6b6);font-size:12px;margin:5px 0 10px}
.sd-card{border-color:var(--line,#2b3543);background:#0f151d;border-radius:8px;padding:11px}
.sd-item-head input,.sd-ref input,.sd-formal input,.sd-formal select,.sd-value input,.sd-card select,.sd-card textarea{background:#0e141b;border:1px solid var(--line2,#3a4759);color:var(--text,#eef3f8);border-radius:7px;padding:8px 9px}
.sd-status{padding:7px 12px;background:#111720;border-top:1px solid var(--line,#2b3543);color:var(--muted,#98a6b6)}
.sd-wrap>.hidden{display:none!important}
@media(max-width:900px){.sd-wrap{padding:14px}.sd-item-head,.sd-formal,.sd-value{grid-template-columns:1fr}}
`;
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

installJsonUniquenessPatches();
installStructureBuildValidation();
installRenderGiaUniqueness();
installBuildTabVisibilityBehavior();
installStructureTabs();
installStructureNameGuard();
installStatusTabs();
installDeckItemListRefresh();
installDeckBuildDefaults();
const observer=new MutationObserver(()=>{
  installStatusTabs();
  installStructureNameGuard();
});
observer.observe(document.body,{childList:true,subtree:true});
})();
