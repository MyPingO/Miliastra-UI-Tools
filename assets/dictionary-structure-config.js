(()=>{
'use strict';

const structureDictionaryValueTypes=new Set(['Struct','StructList']);

function findFieldByLabel(root,labelText){
  if(!root)return null;
  return [...root.querySelectorAll('.field')].find(field=>
    field.querySelector(':scope > label')?.textContent.trim()===labelText
  )||null;
}

function renameStructureConfigurationField(field){
  if(!field)return;
  const label=field.querySelector(':scope > label');
  if(label&&label.textContent.trim()!=='Structure Configuration ID'){
    label.textContent='Structure Configuration ID';
  }
}

function configureDictionaryBuilderStructureId(){
  const modal=document.getElementById('builderModal');
  if(!modal||modal.classList.contains('hidden'))return;

  const valueTypeField=findFieldByLabel(modal,'Value Type');
  const structureIdField=
    findFieldByLabel(modal,'Value Struct ID (if applicable)')||
    findFieldByLabel(modal,'Value Struct ID')||
    findFieldByLabel(modal,'Structure Configuration ID');
  const valueTypeSelect=valueTypeField?.querySelector('select');

  if(!valueTypeSelect||!structureIdField)return;
  renameStructureConfigurationField(structureIdField);

  const syncVisibility=()=>{
    structureIdField.classList.toggle(
      'hidden',
      !structureDictionaryValueTypes.has(valueTypeSelect.value)
    );
  };

  if(valueTypeSelect.dataset.structureConfigurationVisibility!=='1'){
    valueTypeSelect.dataset.structureConfigurationVisibility='1';
    valueTypeSelect.addEventListener('change',syncVisibility);
  }
  syncVisibility();
}

function installDictionaryBuilderStructureId(){
  const button=document.getElementById('newDictButton');
  if(!button||button.dataset.structureConfigurationField==='1')return;
  button.dataset.structureConfigurationField='1';
  button.addEventListener('click',()=>queueMicrotask(configureDictionaryBuilderStructureId));
}

function installDictionaryEditorStructureId(){
  if(typeof renderDictionary!=='function'||globalThis.__miliastraDictionaryStructureConfigurationId)return;
  globalThis.__miliastraDictionaryStructureConfigurationId=true;
  const previousRenderDictionary=renderDictionary;

  renderDictionary=function(dictionary,nested=false){
    const card=previousRenderDictionary(dictionary,nested);
    const structureIdField=
      findFieldByLabel(card,'Value Struct ID')||
      findFieldByLabel(card,'Value Struct ID (if applicable)')||
      findFieldByLabel(card,'Structure Configuration ID');

    if(structureIdField){
      renameStructureConfigurationField(structureIdField);
      structureIdField.classList.toggle(
        'hidden',
        !structureDictionaryValueTypes.has(dictionary?.value_type)
      );
    }
    return card;
  };
}

function renameGiaStructureConfigurationId(){
  const input=document.getElementById('structureId');
  const field=input?.closest('.field');
  renameStructureConfigurationField(field);
}

installDictionaryBuilderStructureId();
installDictionaryEditorStructureId();
renameGiaStructureConfigurationId();

const observer=new MutationObserver(()=>{
  renameGiaStructureConfigurationId();
  if(!document.getElementById('builderModal')?.classList.contains('hidden')){
    configureDictionaryBuilderStructureId();
  }
});
observer.observe(document.body,{childList:true,subtree:true});
})();
