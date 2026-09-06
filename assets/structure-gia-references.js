(()=>{
'use strict';

function friendlyStructureTypeName(typeCode){
  const canonical=typeof structureGiaTypeName==='function'?structureGiaTypeName(Number(typeCode)):String(typeCode);
  return ({
    ConfigReference:'Configuration ID',
    ConfigReferenceList:'Configuration ID List',
    EntityReference:'Prefab ID',
    EntityReferenceList:'Prefab ID List',
    Army:'Faction',
    ArmyList:'Faction List',
    Struct:'Structure',
    StructList:'Structure List',
    Dict:'Dictionary'
  })[canonical]||canonical;
}

function readStructureFieldReferenceMetadata(memberMessage,typeCode){
  const metadata={};
  try{
    const memberFields=parseFields(memberMessage);
    const descriptorField=optionalField(memberFields,1,2);
    if(!descriptorField)return metadata;
    const descriptorFields=parseFields(descriptorField.value);
    const configurationField=optionalField(descriptorFields,2,2);
    if(!configurationField)return metadata;
    const configurationFields=parseFields(configurationField.value);
    const numericTypeCode=Number(typeCode);

    if(numericTypeCode===25||numericTypeCode===26){
      const structureIdField=optionalField(configurationFields,2,0);
      if(structureIdField)metadata.structureConfigId=String(structureIdField.value);
      return metadata;
    }

    if(numericTypeCode===27){
      const dictionaryTypeIdField=optionalField(configurationFields,2,0);
      const keyTypeField=optionalField(configurationFields,502,0);
      const valueTypeField=optionalField(configurationFields,503,0);
      const valueStructureIdField=optionalField(configurationFields,504,0);
      if(dictionaryTypeIdField)metadata.dictionaryTypeId=String(dictionaryTypeIdField.value);
      if(keyTypeField)metadata.dictionaryKeyTypeCode=Number(keyTypeField.value);
      if(valueTypeField)metadata.dictionaryValueTypeCode=Number(valueTypeField.value);
      if(valueStructureIdField)metadata.structureConfigId=String(valueStructureIdField.value);
    }
  }catch{}
  return metadata;
}

function structureListDefaultItemCount(fieldMessage){
  try{
    const memberFields=parseFields(fieldMessage);
    const defaultWrapper=optionalField(memberFields,3,2);
    if(!defaultWrapper)return null;
    const defaultFields=parseFields(defaultWrapper.value);
    const typedField=optionalField(defaultFields,36,2);
    if(!typedField)return null;
    return parseFields(typedField.value).filter(field=>field.number===1&&field.wireType===2).length;
  }catch{return null;}
}

function installStructureDefinitionMetadataReader(){
  if(typeof readStructureGiaDefinition!=='function'||globalThis.__miliastraStructureDefinitionMetadataReader)return;
  globalThis.__miliastraStructureDefinitionMetadataReader=true;
  const previousReadStructureGiaDefinition=readStructureGiaDefinition;

  readStructureGiaDefinition=function(message){
    const result=previousReadStructureGiaDefinition(message);
    try{
      const metadataByIndex=new Map();
      parseFields(message)
        .filter(field=>field.number===3&&field.wireType===2)
        .forEach(field=>{
          try{
            const fields=parseFields(field.value);
            const indexField=optionalField(fields,503,0);
            const typeField=optionalField(fields,502,0);
            if(indexField&&typeField){
              metadataByIndex.set(
                Number(indexField.value),
                readStructureFieldReferenceMetadata(field.value,Number(typeField.value))
              );
            }
          }catch{}
        });
      result.members.forEach(member=>Object.assign(member,metadataByIndex.get(Number(member.index))||{}));
    }catch{}
    return result;
  };
}

function installStructureDefaultSummaryReader(){
  if(typeof readStructureGiaDefault!=='function'||globalThis.__miliastraStructureReferenceDefaultReader)return;
  globalThis.__miliastraStructureReferenceDefaultReader=true;
  const previousReadStructureGiaDefault=readStructureGiaDefault;

  readStructureGiaDefault=function(fieldMessage,typeCode){
    const numericTypeCode=Number(typeCode);
    const metadata=readStructureFieldReferenceMetadata(fieldMessage,numericTypeCode);

    if(numericTypeCode===25&&metadata.structureConfigId){
      return `Structure · ID ${metadata.structureConfigId}`;
    }
    if(numericTypeCode===26&&metadata.structureConfigId){
      const itemCount=structureListDefaultItemCount(fieldMessage);
      return `Structure List · ID ${metadata.structureConfigId}${itemCount===null?'':` · ${itemCount} item${itemCount===1?'':'s'}`}`;
    }
    if(numericTypeCode===27&&Number.isFinite(metadata.dictionaryKeyTypeCode)&&Number.isFinite(metadata.dictionaryValueTypeCode)){
      let summary=`${friendlyStructureTypeName(metadata.dictionaryKeyTypeCode)} → ${friendlyStructureTypeName(metadata.dictionaryValueTypeCode)}`;
      if(metadata.structureConfigId&&(metadata.dictionaryValueTypeCode===25||metadata.dictionaryValueTypeCode===26)){
        summary+=` · Structure ID ${metadata.structureConfigId}`;
      }
      return summary;
    }
    return previousReadStructureGiaDefault(fieldMessage,typeCode);
  };
}

function ensureReferencePanel(){
  const inspector=document.getElementById('structureInspector');
  if(!inspector)return null;
  let panel=document.getElementById('structureReferenceMetadataPanel');
  if(panel)return panel;
  panel=document.createElement('div');
  panel.id='structureReferenceMetadataPanel';
  panel.className='meta hidden';
  const help=document.getElementById('structureGiaHelp');
  if(help?.parentNode)help.parentNode.insertBefore(panel,help);
  else inspector.appendChild(panel);
  return panel;
}

function metadataRow(label,value){
  const row=document.createElement('div');
  row.className='meta-row';
  const name=document.createElement('span');
  name.textContent=label;
  const output=document.createElement('code');
  output.textContent=String(value);
  row.append(name,output);
  return row;
}

function renderStructureReferencePanel(){
  const panel=ensureReferencePanel();
  if(!panel)return;
  panel.innerHTML='';

  if(currentDocument?.kind!=='gia-structure'||selectedIndex===null){
    panel.classList.add('hidden');
    return;
  }
  const item=currentDocument.items?.[selectedIndex];
  if(!item){panel.classList.add('hidden');return;}

  if(item.typeCode===25||item.typeCode===26){
    if(item.structureConfigId){
      panel.appendChild(metadataRow('Structure Configuration ID',item.structureConfigId));
      panel.classList.remove('hidden');
    }else panel.classList.add('hidden');
    return;
  }

  if(item.typeCode===27){
    if(Number.isFinite(item.dictionaryKeyTypeCode)){
      panel.appendChild(metadataRow('Dictionary Key Type',friendlyStructureTypeName(item.dictionaryKeyTypeCode)));
    }
    if(Number.isFinite(item.dictionaryValueTypeCode)){
      panel.appendChild(metadataRow('Dictionary Value Type',friendlyStructureTypeName(item.dictionaryValueTypeCode)));
    }
    if(item.structureConfigId&&(item.dictionaryValueTypeCode===25||item.dictionaryValueTypeCode===26)){
      panel.appendChild(metadataRow('Structure Configuration ID',item.structureConfigId));
    }
    if(currentDocument.structureBuildMode&&!panel.children.length){
      panel.appendChild(metadataRow('Dictionary Template','String → String'));
      const note=document.createElement('div');
      note.className='help';
      note.textContent='Build New keeps the validated String → String Dictionary template. Arbitrary GIA Dictionary type metadata is not generated until its additional internal type identifier is understood.';
      panel.appendChild(note);
    }
    panel.classList.toggle('hidden',!panel.children.length);
    return;
  }

  panel.classList.add('hidden');
}

function installReferencePanelRenderer(){
  if(typeof renderGia!=='function'||globalThis.__miliastraStructureReferencePanelRenderer)return;
  globalThis.__miliastraStructureReferencePanelRenderer=true;
  const previousRenderGia=renderGia;
  renderGia=function(...args){
    const result=previousRenderGia(...args);
    renderStructureReferencePanel();
    return result;
  };
}

function updateStructureBuildReferenceNote(){
  const note=[...document.querySelectorAll('.build-note')]
    .find(element=>element.textContent.includes('StructList is confirmed as GIA type code 26'));
  const muted=note?.querySelector('.muted');
  if(muted){
    muted.textContent='Struct and StructList references are read with their Structure Configuration IDs. Build New does not fabricate referenced custom Structure schemas or reuse project-specific IDs; those types remain out of the GIA type picker until a referenced Structure definition can be supplied safely.';
  }
}

installStructureDefinitionMetadataReader();
installStructureDefaultSummaryReader();
installReferencePanelRenderer();
updateStructureBuildReferenceNote();
})();
