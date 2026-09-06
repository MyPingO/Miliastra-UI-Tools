(()=>{
'use strict';

const externalStructureValueTypes=new Set(['Struct','StructList']);

const confirmedPopulatedGiaListTypes=new Set([8,9,11,15]);

function decodePackedUnsignedVarints(bytes){
  const values=[];
  let index=0;
  while(index<bytes.length){
    let value=0n;
    let shift=0n;
    let complete=false;
    while(index<bytes.length&&shift<=63n){
      const byte=BigInt(bytes[index++]);
      value|=(byte&0x7Fn)<<shift;
      if((byte&0x80n)===0n){
        complete=true;
        break;
      }
      shift+=7n;
    }
    if(!complete)throw new Error('Invalid packed varint list.');
    values.push(value);
  }
  return values;
}

function encodeSignedInt32Varint(value){
  const numeric=Number(value);
  if(!Number.isInteger(numeric)||numeric<-2147483648||numeric>2147483647){
    throw new Error('Int32 list values must be between -2147483648 and 2147483647.');
  }
  return encodeVarint(BigInt.asUintN(64,BigInt(numeric)));
}

function installConfirmedGiaListEncoding(){
  if(globalThis.__miliastraConfirmedGiaListEncoding)return;
  globalThis.__miliastraConfirmedGiaListEncoding=true;

  if(typeof readStructureGiaListValues==='function'){
    const previousReadStructureGiaListValues=readStructureGiaListValues;
    readStructureGiaListValues=function(fieldMessage,typeCode){
      const numericTypeCode=Number(typeCode);
      if(numericTypeCode!==8&&numericTypeCode!==9){
        return previousReadStructureGiaListValues(fieldMessage,typeCode);
      }
      try{
        const memberFields=parseFields(fieldMessage);
        const defaultWrapper=findField(memberFields,3,2);
        const defaultFields=parseFields(defaultWrapper.value);
        const typedField=optionalField(defaultFields,numericTypeCode+10,2);
        if(!typedField||!typedField.value.length)return [];
        const listFields=parseFields(typedField.value);
        const values=[];
        for(const field of listFields){
          if(field.number!==1)continue;
          if(field.wireType===2){
            for(const packedValue of decodePackedUnsignedVarints(field.value)){
              if(numericTypeCode===8){
                values.push(Number(BigInt.asIntN(32,packedValue)));
              }else{
                values.push(packedValue!==0n);
              }
            }
          }else if(field.wireType===0){
            if(numericTypeCode===8){
              values.push(Number(BigInt.asIntN(32,BigInt(field.value))));
            }else{
              values.push(Boolean(Number(field.value)));
            }
          }
        }
        return values;
      }catch{
        return previousReadStructureGiaListValues(fieldMessage,typeCode);
      }
    };
  }

  if(typeof buildStructureGiaListValueMessage==='function'){
    const previousBuildStructureGiaListValueMessage=buildStructureGiaListValueMessage;
    buildStructureGiaListValueMessage=function(typeCode,values){
      const numericTypeCode=Number(typeCode);
      if(numericTypeCode===8){
        const list=values||[];
        if(!list.length)return new Uint8Array();
        const packed=concatBytes(...list.map(encodeSignedInt32Varint));
        return encodeField(1,2,packed);
      }
      if(numericTypeCode===9){
        const list=values||[];
        if(!list.length)return new Uint8Array();
        const packed=concatBytes(...list.map(value=>encodeVarint(value?1:0)));
        return encodeField(1,2,packed);
      }
      return previousBuildStructureGiaListValueMessage(typeCode,values);
    };
  }

  if(typeof patchStructureGiaListDefault==='function'){
    const previousPatchStructureGiaListDefault=patchStructureGiaListDefault;
    patchStructureGiaListDefault=function(fieldMessage,typeCode,values){
      const numericTypeCode=Number(typeCode);
      const typeInfo=STRUCTURE_GIA_TYPES.get(numericTypeCode);
      if(typeInfo?.kind==='list'&&!confirmedPopulatedGiaListTypes.has(numericTypeCode)){
        return fieldMessage;
      }
      return previousPatchStructureGiaListDefault(fieldMessage,typeCode,values);
    };
  }

  if(typeof readStructureListEditor==='function'){
    const previousReadStructureListEditor=readStructureListEditor;
    readStructureListEditor=function(item){
      const numericTypeCode=Number(item?.typeCode);
      const typeInfo=STRUCTURE_GIA_TYPES.get(numericTypeCode);
      if(
        currentDocument?.structureBuildMode&&
        typeInfo?.kind==='list'&&
        !confirmedPopulatedGiaListTypes.has(numericTypeCode)
      ){
        item.listValues=[];
        item.defaultValue='[]';
        return true;
      }
      return previousReadStructureListEditor(item);
    };
  }

  if(typeof renderStructureListEditor==='function'){
    const previousRenderStructureListEditor=renderStructureListEditor;
    renderStructureListEditor=function(item){
      const result=previousRenderStructureListEditor(item);
      const numericTypeCode=Number(item?.typeCode);
      const typeInfo=STRUCTURE_GIA_TYPES.get(numericTypeCode);
      if(
        currentDocument?.structureBuildMode&&
        typeInfo?.kind==='list'&&
        !confirmedPopulatedGiaListTypes.has(numericTypeCode)
      ){
        elements.structureListDefaultPanel.classList.add('hidden');
        elements.structureScalarDefaultField.classList.remove('hidden');
        elements.structureFieldDefault.value='[] · empty default only';
      }
      return result;
    };
  }
}

function directFieldByLabel(root,labelText){
  if(!root)return null;
  return [...root.querySelectorAll(':scope > .field, :scope > .json-root-header > .field')]
    .find(field=>field.querySelector(':scope > label')?.textContent.trim()===labelText)||null;
}

function fieldByAnyLabel(root,labels){
  if(!root)return null;
  return [...root.querySelectorAll('.field')].find(field=>
    labels.includes(field.querySelector(':scope > label')?.textContent.trim())
  )||null;
}

function filterConstructibleValueTypes(select,currentType){
  if(!(select instanceof HTMLSelectElement))return;
  const preservedType=String(currentType||select.value||'String');
  [...select.options].forEach(option=>{
    if(
      externalStructureValueTypes.has(option.value)&&
      option.value!==preservedType
    ){
      option.remove();
    }
  });
  if([...select.options].some(option=>option.value===preservedType)){
    select.value=preservedType;
  }
}

function addSafetyHelp(root,key,text){
  if(!root||root.querySelector(`[data-shape-safety-help="${key}"]`))return;
  const note=document.createElement('div');
  note.className='help';
  note.dataset.shapeSafetyHelp=key;
  note.textContent=text;
  root.appendChild(note);
}

function structurePayloadId(wrapper){
  if(!wrapper||!externalStructureValueTypes.has(wrapper.param_type))return null;
  const payload=wrapper.value;
  if(!payload||typeof payload!=='object')return null;
  return payload.structId===undefined?null:String(payload.structId);
}

function validKnownStructureWrapper(wrapper,expectedType){
  if(!wrapper||wrapper.param_type!==expectedType||!wrapper.value||typeof wrapper.value!=='object')return false;
  if(expectedType==='Struct'){
    return wrapper.value.type==='Struct'&&Array.isArray(wrapper.value.value);
  }
  if(expectedType==='StructList'){
    return Array.isArray(wrapper.value.value)&&wrapper.value.value.every(item=>
      item?.param_type==='Struct'&&
      item.value?.type==='Struct'&&
      Array.isArray(item.value.value)
    );
  }
  return false;
}

function installDictionaryBuilderSafety(){
  const button=document.getElementById('newDictButton');
  if(!button||button.dataset.shapeSafeDictionaryBuilder==='1')return;
  button.dataset.shapeSafeDictionaryBuilder='1';
  button.addEventListener('click',()=>{
    queueMicrotask(()=>{
      const modal=document.getElementById('builderModal');
      if(!modal||modal.classList.contains('hidden'))return;
      const valueField=fieldByAnyLabel(modal,['Value Type']);
      const valueSelect=valueField?.querySelector('select');
      if(valueSelect)filterConstructibleValueTypes(valueSelect,valueSelect.value);

      const structureIdField=fieldByAnyLabel(modal,[
        'Value Struct ID (if applicable)',
        'Value Struct ID',
        'Structure Configuration ID'
      ]);
      structureIdField?.classList.add('hidden');

      const description=document.getElementById('builderDescription');
      if(description){
        description.textContent='Choose the Dictionary key and value types. Build New only offers self-contained value types; Structure and Structure List values require an existing custom Structure shape and are not fabricated from an ID alone.';
      }
    });
  });
}

function installDictionaryRenderSafety(){
  if(typeof renderDictionary!=='function'||globalThis.__miliastraShapeSafeDictionaryRender)return;
  globalThis.__miliastraShapeSafeDictionaryRender=true;
  const previousRenderDictionary=renderDictionary;

  renderDictionary=function(dictionary,nested=false){
    const card=previousRenderDictionary(dictionary,nested);
    const header=card.querySelector(':scope > .json-root-header');
    const valueField=fieldByAnyLabel(header||card,['Value Type']);
    const valueSelect=valueField?.querySelector('select');
    if(valueSelect)filterConstructibleValueTypes(valueSelect,dictionary?.value_type);

    const usesExternalStructure=externalStructureValueTypes.has(dictionary?.value_type);
    const structureIdField=fieldByAnyLabel(header||card,[
      'Value Struct ID',
      'Value Struct ID (if applicable)',
      'Structure Configuration ID'
    ]);

    if(structureIdField&&usesExternalStructure){
      const label=structureIdField.querySelector(':scope > label');
      if(label)label.textContent='Structure Configuration ID';
      const input=structureIdField.querySelector('input');
      if(input){
        input.readOnly=true;
        input.title='The ID is locked because changing it would point these known values at a different custom Structure whose shape is not loaded.';
      }
    }

    const actions=[...card.querySelectorAll(':scope > .add-row')].at(-1);
    const addButton=[...(actions?.querySelectorAll('button')||[])]
      .find(button=>button.textContent.trim()==='Add Entry');
    const pasteButton=[...(actions?.querySelectorAll('button')||[])]
      .find(button=>button.textContent.trim()==='Paste Entry');

    if(usesExternalStructure){
      if(addButton){
        addButton.disabled=true;
        addButton.title='A new Structure-valued entry needs the referenced custom Structure shape. Duplicate an existing entry or paste a complete known entry instead.';
      }

      if(pasteButton&&!pasteButton.dataset.safeStructurePaste){
        pasteButton.dataset.safeStructurePaste='1';
        pasteButton.addEventListener('click',async event=>{
          event.preventDefault();
          event.stopImmediatePropagation();
          const fragment=await readEditorFragment();
          if(!fragment||fragment.kind!=='json-dict-entry'){
            alert('Clipboard does not contain a dictionary entry.');
            return;
          }

          const entry=deepCloneData(fragment.data);
          if(
            entry?.key?.param_type!==dictionary.key_type||
            entry?.value?.param_type!==dictionary.value_type
          ){
            alert(
              `Copied entry is ${entry?.key?.param_type||'?'} → ${entry?.value?.param_type||'?'}, `+
              `but this dictionary expects ${dictionary.key_type} → ${dictionary.value_type}.`
            );
            return;
          }

          if(!validKnownStructureWrapper(entry.value,dictionary.value_type)){
            alert('The copied entry does not contain a complete known Structure shape.');
            return;
          }

          const expectedId=String(dictionary.value_structId??'');
          const actualId=structurePayloadId(entry.value);
          if(expectedId&&actualId!==expectedId){
            alert(`Copied entry references Structure Configuration ID ${actualId||'missing'}, but this Dictionary expects ${expectedId}.`);
            return;
          }

          pushHistory('Paste dictionary entry');
          dictionary.value.push(entry);
          renderJson();
        },true);
      }

      addSafetyHelp(
        card,
        'structure-dictionary',
        'This Dictionary uses an external custom Structure. Existing values are editable because their full shape is present. The Structure Configuration ID and blank Add Entry path are locked; duplicate or paste a complete known entry to preserve the referenced Structure shape.'
      );
    }

    return card;
  };
}

function installRootStructureSafety(){
  if(typeof renderRootStruct!=='function'||globalThis.__miliastraShapeSafeRootStructure)return;
  globalThis.__miliastraShapeSafeRootStructure=true;
  const previousRenderRootStruct=renderRootStruct;

  renderRootStruct=function(root){
    const host=previousRenderRootStruct(root);
    const cards=[...host.querySelectorAll(':scope > .json-card')];
    cards.forEach((card,index)=>{
      const member=root.value?.[index];
      const typeSelect=card.querySelector(':scope > .json-card-header > select');
      if(typeSelect)filterConstructibleValueTypes(typeSelect,member?.param_type);

      if(externalStructureValueTypes.has(member?.param_type)){
        addSafetyHelp(
          card.querySelector(':scope > .json-card-body')||card,
          `root-known-structure-${index}`,
          'This variable already contains a known custom Structure shape. You may edit its values or replace the variable with a self-contained type, but the editor will not fabricate a different Structure/Structure List from only a Configuration ID.'
        );
      }
    });
    return host;
  };
}

function installAnonymousStructureSafety(){
  if(typeof renderAnonymousStruct!=='function'||globalThis.__miliastraShapeSafeAnonymousStructure)return;
  globalThis.__miliastraShapeSafeAnonymousStructure=true;
  const previousRenderAnonymousStruct=renderAnonymousStruct;

  renderAnonymousStruct=function(structObject){
    const card=previousRenderAnonymousStruct(structObject);
    const idField=fieldByAnyLabel(card,['Struct ID','Structure Configuration ID']);
    if(idField){
      const label=idField.querySelector(':scope > label');
      if(label)label.textContent='Structure Configuration ID';
      const input=idField.querySelector('input');
      if(input){
        input.readOnly=true;
        input.title='The referenced Structure definition is external to this JSON value, so changing the ID without loading a matching shape is unsafe.';
      }
    }

    [...card.querySelectorAll(':scope > .json-card')].forEach(fieldCard=>{
      const header=fieldCard.querySelector(':scope > .json-card-header');
      const typeSelect=header?.querySelector('select');
      if(typeSelect){
        typeSelect.disabled=true;
        typeSelect.title='Field types are fixed by the referenced custom Structure definition.';
      }
      [...(header?.querySelectorAll('button')||[])].forEach(button=>{
        const text=button.textContent.trim();
        if(['Duplicate','↑','↓','Remove'].includes(text)){
          button.disabled=true;
          button.title='Field count, order, and types are fixed by the referenced custom Structure definition.';
        }
      });
    });

    const actions=[...card.querySelectorAll(':scope > .add-row')].at(-1);
    [...(actions?.querySelectorAll('button')||[])].forEach(button=>{
      if(['Add Field','Paste Field'].includes(button.textContent.trim())){
        button.disabled=true;
        button.title='The referenced custom Structure schema is not editable from a value instance.';
      }
    });

    addSafetyHelp(
      card,
      'external-structure-shape',
      'This is a value instance of an external custom Structure. Its field count, order, types, and Structure Configuration ID are locked because the referenced definition is not embedded as an editable schema here. The existing field values remain editable.'
    );
    return card;
  };
}

function installStructureListSafety(){
  if(typeof renderStructList!=='function'||globalThis.__miliastraShapeSafeStructureList)return;
  globalThis.__miliastraShapeSafeStructureList=true;
  const previousRenderStructList=renderStructList;

  renderStructList=function(listObject){
    const card=previousRenderStructList(listObject);
    const idField=fieldByAnyLabel(card,['Struct ID','Structure Configuration ID']);
    if(idField){
      const label=idField.querySelector(':scope > label');
      if(label)label.textContent='Structure Configuration ID';
      const input=idField.querySelector('input');
      if(input){
        input.readOnly=true;
        input.title='All items in this list use the currently known custom Structure shape.';
      }
    }

    const actions=[...card.querySelectorAll(':scope > .add-row')].at(-1);
    const addButton=[...(actions?.querySelectorAll('button')||[])]
      .find(button=>button.textContent.trim()==='Add Structure');
    const pasteButton=[...(actions?.querySelectorAll('button')||[])]
      .find(button=>button.textContent.trim()==='Paste Structure');

    if(addButton){
      addButton.disabled=true;
      addButton.title='A blank Structure cannot be created without its custom field shape. Duplicate an existing list item or paste a complete known Structure instead.';
    }

    if(pasteButton&&!pasteButton.dataset.safeStructurePaste){
      pasteButton.dataset.safeStructurePaste='1';
      pasteButton.addEventListener('click',async event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        const fragment=await readEditorFragment();
        if(!fragment||fragment.kind!=='json-struct-list-item'){
          alert('Clipboard does not contain a Structure List item.');
          return;
        }
        const wrapper=deepCloneData(fragment.data);
        if(!validKnownStructureWrapper(wrapper,'Struct')){
          alert('The copied item does not contain a complete known Structure shape.');
          return;
        }
        const expectedId=String(listObject.structId??'');
        const actualId=structurePayloadId(wrapper);
        if(expectedId&&actualId!==expectedId){
          alert(`Copied Structure references Configuration ID ${actualId||'missing'}, but this list expects ${expectedId}.`);
          return;
        }
        pushHistory('Paste Structure List item');
        listObject.value.push(wrapper);
        renderJson();
      },true);
    }

    addSafetyHelp(
      card,
      'external-structure-list-shape',
      'Structure List items must all use the referenced custom Structure shape. Existing items may be edited, duplicated, reordered, or removed. To add a new shape safely, paste a complete known Structure item; a blank Structure is not generated from the ID alone.'
    );
    return card;
  };
}

function installJsonToolbarSafety(){
  if(typeof renderJson!=='function'||globalThis.__miliastraShapeSafeRenderJson)return;
  globalThis.__miliastraShapeSafeRenderJson=true;
  const previousRenderJson=renderJson;

  renderJson=function(...args){
    const result=previousRenderJson(...args);
    if(
      currentDocument?.kind==='json-dict'&&
      externalStructureValueTypes.has(currentDocument.object?.value_type)
    ){
      elements.jsonAddRootButton.disabled=true;
      elements.jsonAddRootButton.title='Duplicate or paste a complete known entry; a blank Structure-valued entry cannot be generated from only a Configuration ID.';
    }else if(elements.jsonAddRootButton){
      elements.jsonAddRootButton.disabled=false;
      elements.jsonAddRootButton.title='';
    }
    return result;
  };
}

function makeInspectorMetadataRow(label,value){
  const row=document.createElement('div');
  row.className='meta-row';
  const name=document.createElement('span');
  name.textContent=label;
  const output=document.createElement('code');
  output.textContent=String(value);
  row.append(name,output);
  return row;
}

function installGiaStructureSafety(){
  if(typeof renderGia!=='function'||globalThis.__miliastraShapeSafeGiaStructure)return;
  globalThis.__miliastraShapeSafeGiaStructure=true;
  const previousRenderGia=renderGia;

  renderGia=function(...args){
    const result=previousRenderGia(...args);
    if(currentDocument?.kind!=='gia-structure'||selectedIndex===null)return result;
    const item=currentDocument.items?.[selectedIndex];
    if(!item)return result;

    const dictionaryOption=[...elements.structureFieldType.options]
      .find(option=>Number(option.value)===27);
    if(dictionaryOption&&currentDocument.structureBuildMode){
      dictionaryOption.textContent='Dictionary (String → String)';
      dictionaryOption.title='Build New currently uses the validated empty String → String Dictionary template.';
    }

    const panel=document.getElementById('structureReferenceMetadataPanel');
    if(item.typeCode===27&&panel){
      const hasTypeId=[...panel.querySelectorAll('.meta-row span')]
        .some(label=>label.textContent.trim()==='Dictionary Type ID');
      const typeId=item.dictionaryTypeId||(
        currentDocument.structureBuildMode?'66':null
      );
      if(typeId&&!hasTypeId){
        panel.appendChild(makeInspectorMetadataRow('Dictionary Type ID',typeId));
        panel.classList.remove('hidden');
      }
      if(currentDocument.structureBuildMode){
        addSafetyHelp(
          panel,
          'gia-dictionary-template',
          'Build New only generates the validated empty String → String GIA Dictionary shape. Other key/value pairs use additional Dictionary type metadata that is not derived safely from the available examples, so they are readable but not fabricated.'
        );
      }
    }

    if(currentDocument.structureBuildMode){
      const baseHelp='Build New exposes only self-contained field types whose complete GIA shape is available. Struct and StructList are intentionally unavailable because their defaults embed the referenced custom Structure definition/value shape.';
      const typeInfo=STRUCTURE_GIA_TYPES.get(Number(item.typeCode));
      if(item.typeCode===27){
        elements.structureGiaHelp.textContent=baseHelp+' Dictionary creation is currently limited to the validated empty String → String template.';
      }else if(typeInfo?.kind==='list'&&!confirmedPopulatedGiaListTypes.has(Number(item.typeCode))){
        elements.structureGiaHelp.textContent=baseHelp+' This list type can be created with its validated empty default, but non-empty item encoding is not exposed until a controlled populated GIA confirms it.';
      }else if(typeInfo?.kind==='list'){
        elements.structureGiaHelp.textContent=baseHelp+' Populated defaults are enabled for list encodings confirmed by controlled GIA data.';
      }else{
        elements.structureGiaHelp.textContent=baseHelp;
      }
    }
    return result;
  };
}

installConfirmedGiaListEncoding();
installDictionaryBuilderSafety();
installDictionaryRenderSafety();
installRootStructureSafety();
installAnonymousStructureSafety();
installStructureListSafety();
installJsonToolbarSafety();
installGiaStructureSafety();
})();
