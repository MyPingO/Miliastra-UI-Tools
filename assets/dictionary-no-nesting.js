(()=>{
'use strict';

/* Miliastra Dictionaries are single-level mappings. A Dictionary can be a
   Structure field, but Dictionary values cannot themselves be Dictionary. */

function fieldByLabel(root,labelText){
  if(!root)return null;
  return [...root.querySelectorAll('.field')].find(field=>
    field.querySelector(':scope > label')?.textContent.trim()===labelText
  )||null;
}

function removeNestedDictionaryOption(select,currentValue){
  if(!(select instanceof HTMLSelectElement))return;
  const current=String(currentValue??select.value??'');
  const option=[...select.options].find(candidate=>candidate.value==='Dict'||candidate.value==='27');
  if(!option)return;

  if(current===option.value){
    option.disabled=true;
    option.textContent='Dictionary (invalid nested value)';
    select.value=option.value;
  }else{
    option.remove();
  }
}

function installJsonDictionaryNoNesting(){
  const newDictionaryButton=document.getElementById('newDictButton');
  if(newDictionaryButton&&!newDictionaryButton.dataset.noNestedDictionary){
    newDictionaryButton.dataset.noNestedDictionary='1';
    newDictionaryButton.addEventListener('click',()=>{
      queueMicrotask(()=>{
        const modal=document.getElementById('builderModal');
        if(!modal||modal.classList.contains('hidden'))return;
        const valueField=fieldByLabel(modal,'Value Type');
        const select=valueField?.querySelector('select');
        if(select)removeNestedDictionaryOption(select,select.value);
      });
    });
  }

  if(typeof renderDictionary==='function'&&!globalThis.__miliastraJsonDictionaryNoNesting){
    globalThis.__miliastraJsonDictionaryNoNesting=true;
    const previousRenderDictionary=renderDictionary;
    renderDictionary=function(dictionary,nested=false){
      const card=previousRenderDictionary(dictionary,nested);
      const header=card.querySelector(':scope > .json-root-header');
      const valueField=fieldByLabel(header||card,'Value Type');
      const select=valueField?.querySelector('select');
      if(select)removeNestedDictionaryOption(select,dictionary?.value_type);

      if(dictionary?.value_type==='Dict'){
        const note=document.createElement('div');
        note.className='help';
        note.textContent='Nested Dictionaries are not valid. Change Value Type to a non-Dictionary type before exporting.';
        card.appendChild(note);
      }
      return card;
    };
  }

  if(typeof validateDictionary==='function'&&!globalThis.__miliastraJsonDictionaryNoNestingValidation){
    globalThis.__miliastraJsonDictionaryNoNestingValidation=true;
    const previousValidateDictionary=validateDictionary;
    validateDictionary=function(dictionary,path,errors,warnings){
      if(dictionary?.value_type==='Dict'){
        errors.push(`${path}: Dictionary values cannot be Dictionary; nested Dictionaries are not supported.`);
      }
      return previousValidateDictionary(dictionary,path,errors,warnings);
    };
  }
}

function enforceGiaDictionaryNoNestingUi(){
  if(currentDocument?.kind!=='gia-structure')return;
  const panel=document.getElementById('structureGiaDictionaryPanel');
  if(!panel)return;

  for(const field of panel.querySelectorAll('.field')){
    const label=field.querySelector(':scope > label')?.textContent.trim();
    if(label!=='Value Type')continue;
    const select=field.querySelector('select');
    if(!select)continue;
    removeNestedDictionaryOption(select,select.value);
  }

  const selectedItem=selectedIndex===null?null:currentDocument.items?.[selectedIndex];
  const model=selectedItem?.dictionaryModel;
  if(Number(selectedItem?.typeCode)===27&&Number(model?.valueTypeCode)===27){
    if(!panel.querySelector('[data-no-nested-dictionary-warning]')){
      const note=document.createElement('div');
      note.className='help';
      note.dataset.noNestedDictionaryWarning='1';
      note.textContent='Nested Dictionaries are not valid. Change this Dictionary Value Type before exporting.';
      panel.appendChild(note);
    }
  }
}

function validateGiaNoNestedDictionaryModel(model,path){
  if(!model||typeof model!=='object')return;
  if(Number(model.valueTypeCode)===27){
    throw new Error(`${path}: Dictionary values cannot be Dictionary; nested Dictionaries are not supported.`);
  }
}

function installGiaDictionaryNoNesting(){
  if(typeof renderGia==='function'&&!globalThis.__miliastraGiaDictionaryNoNestingUi){
    globalThis.__miliastraGiaDictionaryNoNestingUi=true;
    const previousRenderGia=renderGia;
    renderGia=function(...args){
      const result=previousRenderGia(...args);
      enforceGiaDictionaryNoNestingUi();
      return result;
    };
  }

  if(typeof StructureGiaDocument==='function'&&!globalThis.__miliastraGiaDictionaryNoNestingValidation){
    globalThis.__miliastraGiaDictionaryNoNestingValidation=true;
    const previousBuildFile=StructureGiaDocument.prototype.buildFile;
    StructureGiaDocument.prototype.buildFile=function(){
      if(this.structureBuildMode){
        for(const item of this.items||[]){
          if(Number(item?.typeCode)!==27)continue;
          validateGiaNoNestedDictionaryModel(
            item.dictionaryModel,
            `Dictionary field "${item.name||'Unnamed'}"`
          );
        }
      }
      return previousBuildFile.call(this);
    };
  }

  enforceGiaDictionaryNoNestingUi();
}

installJsonDictionaryNoNesting();
installGiaDictionaryNoNesting();
})();
