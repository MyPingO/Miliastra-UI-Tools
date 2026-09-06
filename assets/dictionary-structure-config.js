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

function syncStructListItemIds(listObject,structureId){
  if(!listObject||typeof listObject!=='object')return;
  const normalizedId=String(structureId??'0');
  listObject.structId=normalizedId;
  if(!Array.isArray(listObject.value))return;
  listObject.value.forEach(wrapper=>{
    if(wrapper?.param_type==='Struct'&&wrapper.value&&typeof wrapper.value==='object'){
      wrapper.value.structId=normalizedId;
    }
  });
}

function syncDictionaryStructureIds(dictionary,structureId){
  if(!dictionary||!structureDictionaryValueTypes.has(dictionary.value_type))return;
  const normalizedId=String(structureId??'0');
  dictionary.value_structId=normalizedId;
  if(!Array.isArray(dictionary.value))return;

  dictionary.value.forEach(entry=>{
    const wrapper=entry?.value;
    if(!wrapper||wrapper.param_type!==dictionary.value_type||!wrapper.value||typeof wrapper.value!=='object')return;
    if(dictionary.value_type==='Struct')wrapper.value.structId=normalizedId;
    else syncStructListItemIds(wrapper.value,normalizedId);
  });
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
  const syncVisibility=()=>structureIdField.classList.toggle(
    'hidden',
    !structureDictionaryValueTypes.has(valueTypeSelect.value)
  );
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
      structureIdField.classList.toggle('hidden',!structureDictionaryValueTypes.has(dictionary?.value_type));
      const input=structureIdField.querySelector('input');
      if(input&&input.dataset.structureReferenceSync!=='1'){
        input.dataset.structureReferenceSync='1';
        input.inputMode='numeric';
        input.addEventListener('input',()=>{
          syncDictionaryStructureIds(dictionary,input.value);
          if(typeof syncRawJson==='function')syncRawJson();
        });
      }
    }
    return card;
  };
}

function installNestedStructureIdLabels(){
  if(typeof renderAnonymousStruct==='function'&&!globalThis.__miliastraAnonymousStructureConfigurationId){
    globalThis.__miliastraAnonymousStructureConfigurationId=true;
    const previousRenderAnonymousStruct=renderAnonymousStruct;
    renderAnonymousStruct=function(structObject){
      const card=previousRenderAnonymousStruct(structObject);
      const field=findFieldByLabel(card,'Struct ID')||findFieldByLabel(card,'Structure Configuration ID');
      if(field){
        renameStructureConfigurationField(field);
        const input=field.querySelector('input');
        if(input)input.inputMode='numeric';
      }
      return card;
    };
  }

  if(typeof renderStructList==='function'&&!globalThis.__miliastraStructListConfigurationId){
    globalThis.__miliastraStructListConfigurationId=true;
    const previousRenderStructList=renderStructList;
    renderStructList=function(listObject){
      const card=previousRenderStructList(listObject);
      const field=findFieldByLabel(card,'Struct ID')||findFieldByLabel(card,'Structure Configuration ID');
      if(field){
        renameStructureConfigurationField(field);
        const input=field.querySelector('input');
        if(input&&input.dataset.structureReferenceSync!=='1'){
          input.dataset.structureReferenceSync='1';
          input.inputMode='numeric';
          input.addEventListener('input',()=>{
            syncStructListItemIds(listObject,input.value);
            if(typeof syncRawJson==='function')syncRawJson();
          });
        }
      }
      return card;
    };
  }
}

function collectStructureReferenceErrors(value,path,errors,visited=new Set()){
  if(!value||typeof value!=='object'||visited.has(value))return;
  visited.add(value);

  if(value.type==='Dict'&&structureDictionaryValueTypes.has(value.value_type)&&Array.isArray(value.value)){
    const expectedId=String(value.value_structId??'0');
    value.value.forEach((entry,index)=>{
      const wrapper=entry?.value;
      const actualId=String(wrapper?.value?.structId??'');
      if(wrapper?.param_type===value.value_type&&actualId!==expectedId){
        errors.push(`${path}[${index}].value: Structure Configuration ID ${actualId||'missing'} does not match dictionary ID ${expectedId}.`);
      }
    });
  }

  if(value.param_type==='StructList'&&value.value&&typeof value.value==='object'&&Array.isArray(value.value.value)){
    const expectedId=String(value.value.structId??'0');
    value.value.value.forEach((wrapper,index)=>{
      const actualId=String(wrapper?.value?.structId??'');
      if(wrapper?.param_type==='Struct'&&actualId!==expectedId){
        errors.push(`${path}.value[${index}]: Structure Configuration ID ${actualId||'missing'} does not match StructList ID ${expectedId}.`);
      }
    });
  }

  if(Array.isArray(value)){
    value.forEach((item,index)=>collectStructureReferenceErrors(item,`${path}[${index}]`,errors,visited));
  }else{
    Object.entries(value).forEach(([key,item])=>collectStructureReferenceErrors(item,`${path}.${key}`,errors,visited));
  }
}

function installStructureReferenceValidation(){
  if(typeof validateJsonDocument!=='function'||globalThis.__miliastraStructureReferenceValidation)return;
  globalThis.__miliastraStructureReferenceValidation=true;
  const previousValidateJsonDocument=validateJsonDocument;
  validateJsonDocument=function(documentModel){
    const result=previousValidateJsonDocument(documentModel);
    if(documentModel?.source==='new'&&documentModel.object){
      collectStructureReferenceErrors(documentModel.object,'Root',result.errors);
    }
    return result;
  };
}

function renameGiaStructureConfigurationId(){
  const input=document.getElementById('structureId');
  renameStructureConfigurationField(input?.closest('.field'));
}

installDictionaryBuilderStructureId();
installDictionaryEditorStructureId();
installNestedStructureIdLabels();
installStructureReferenceValidation();
renameGiaStructureConfigurationId();
})();
