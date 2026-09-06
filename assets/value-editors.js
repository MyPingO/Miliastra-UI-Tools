(()=>{
'use strict';

/* JSON primitive lists are self-contained arrays. They do not depend on an
   external Structure definition, so Build New can edit their items directly. */
if(!LIST_TYPES.includes('GuidList'))LIST_TYPES.splice(1,0,'GuidList');
if(!PRIMITIVE_TYPES.includes('GuidList'))PRIMITIVE_TYPES.push('GuidList');
if(!VALUE_TYPES.includes('GuidList')){
  const structIndex=VALUE_TYPES.indexOf('Struct');
  if(structIndex>=0)VALUE_TYPES.splice(structIndex,0,'GuidList');
  else VALUE_TYPES.push('GuidList');
}

const jsonListElementKinds=new Map([
  ['StringList','string'],
  ['Int32List','int32'],
  ['FloatList','float'],
  ['BoolList','bool'],
  ['Vector3List','vector3'],
  ['EntityList','id'],
  ['GuidList','id'],
  ['ConfigReferenceList','id'],
  ['EntityReferenceList','id'],
  ['ArmyList','id']
]);

function defaultJsonListItem(type){
  const kind=jsonListElementKinds.get(type);
  if(kind==='string')return '';
  if(kind==='float')return '0.00';
  if(kind==='bool')return 'False';
  if(kind==='vector3')return '0,0,0';
  return '0';
}

function normalizeJsonListItem(type,raw){
  const kind=jsonListElementKinds.get(type);
  const text=String(raw??'').trim();
  if(kind==='string')return String(raw??'');
  if(kind==='bool'){
    if(/^(true|1)$/i.test(text))return 'True';
    if(/^(false|0)$/i.test(text))return 'False';
    throw new Error('Bool list items must be True or False.');
  }
  if(kind==='int32'){
    if(!/^-?\d+$/.test(text))throw new Error('Integer list items must be whole numbers.');
    const value=BigInt(text);
    if(value<-2147483648n||value>2147483647n)throw new Error('Integer list items must fit Int32.');
    return value.toString();
  }
  if(kind==='float'){
    const value=Number(text);
    if(!Number.isFinite(value))throw new Error('Float list items must be numbers.');
    return text||'0';
  }
  if(kind==='vector3'){
    const parts=text.split(',').map(part=>part.trim());
    if(parts.length!==3||parts.some(part=>!Number.isFinite(Number(part)))){
      throw new Error('Vector3 list items must use X,Y,Z, for example 1,2,3.');
    }
    return parts.join(',');
  }
  if(kind==='id'){
    try{
      const value=BigInt(text||'0');
      if(value<0n)throw new Error();
      return value.toString();
    }catch{
      throw new Error('ID list items must be non-negative integers.');
    }
  }
  return String(raw??'');
}

function jsonListItemControl(type,value,onCommit){
  const kind=jsonListElementKinds.get(type);
  let control;
  if(kind==='bool'){
    control=document.createElement('select');
    ['False','True'].forEach(label=>{
      const option=document.createElement('option');
      option.value=label;
      option.textContent=label;
      control.appendChild(option);
    });
    control.value=/^(true|1)$/i.test(String(value))?'True':'False';
  }else{
    control=document.createElement('input');
    control.type='text';
    if(kind==='int32'||kind==='id')control.inputMode='numeric';
    else if(kind==='float')control.inputMode='decimal';
    control.value=String(value??defaultJsonListItem(type));
    if(kind==='vector3')control.placeholder='0,0,0';
  }

  control.addEventListener('change',()=>{
    try{
      const normalized=normalizeJsonListItem(type,control.value);
      control.value=normalized;
      onCommit(normalized);
    }catch(error){
      alert(error.message||String(error));
      control.value=String(value??defaultJsonListItem(type));
    }
  });
  return control;
}

if(typeof primitiveControl==='function'&&!globalThis.__miliastraJsonListItemEditorV2){
  globalThis.__miliastraJsonListItemEditorV2=true;
  const previousPrimitiveControl=primitiveControl;
  primitiveControl=function(wrapper){
    const type=wrapper?.param_type;
    if(!isListType(type))return previousPrimitiveControl(wrapper);
    if(!Array.isArray(wrapper.value))wrapper.value=[];

    const host=document.createElement('div');
    host.className='json-list-editor';
    const list=document.createElement('div');
    list.className='structure-list-editor';

    wrapper.value.forEach((value,index)=>{
      const row=document.createElement('div');
      row.className='structure-list-row';
      const valueHost=document.createElement('div');
      valueHost.className='structure-list-value';
      valueHost.appendChild(jsonListItemControl(type,value,normalized=>{
        pushHistory(`Edit ${type} item`);
        wrapper.value[index]=normalized;
        syncRawJson();
      }));

      const actions=document.createElement('div');
      actions.className='structure-list-actions';
      const up=document.createElement('button');
      up.className='small';up.textContent='↑';up.disabled=index===0;
      up.addEventListener('click',()=>{
        pushHistory(`Move ${type} item`);
        [wrapper.value[index-1],wrapper.value[index]]=[wrapper.value[index],wrapper.value[index-1]];
        renderJson();
      });
      const down=document.createElement('button');
      down.className='small';down.textContent='↓';down.disabled=index===wrapper.value.length-1;
      down.addEventListener('click',()=>{
        pushHistory(`Move ${type} item`);
        [wrapper.value[index],wrapper.value[index+1]]=[wrapper.value[index+1],wrapper.value[index]];
        renderJson();
      });
      const duplicate=document.createElement('button');
      duplicate.className='small';duplicate.textContent='⧉';duplicate.title='Duplicate item';
      duplicate.addEventListener('click',()=>{
        pushHistory(`Duplicate ${type} item`);
        wrapper.value.splice(index+1,0,deepCloneData(wrapper.value[index]));
        renderJson();
      });
      const remove=document.createElement('button');
      remove.className='small danger';remove.textContent='×';remove.title='Delete item';
      remove.addEventListener('click',()=>{
        pushHistory(`Delete ${type} item`);
        wrapper.value.splice(index,1);
        renderJson();
      });
      actions.append(up,down,duplicate,remove);
      row.append(valueHost,actions);
      list.appendChild(row);
    });

    if(!wrapper.value.length){
      const empty=document.createElement('div');
      empty.className='structure-list-empty';
      empty.textContent='Empty list. Click + Add Item.';
      list.appendChild(empty);
    }

    const actions=document.createElement('div');
    actions.className='add-row';
    const add=document.createElement('button');
    add.className='small';
    add.textContent='+ Add Item';
    add.addEventListener('click',()=>{
      pushHistory(`Add ${type} item`);
      wrapper.value.push(defaultJsonListItem(type));
      renderJson();
    });
    actions.appendChild(add);
    host.append(list,actions);
    return host;
  };
}

/* Structure GIA Build New. Keep this patch deliberately small: core remains
   responsible for normal button/input handlers. We only provide editable
   defaults and constrain the type picker to shapes whose defaults we can
   serialize completely. */
const editableGiaScalarTypes=new Set([3,4,5,6,12,20,21]);
const editableGiaListTypes=new Set([8,9,11,15]);
const fullyEditableGiaBuildTypes=new Set([
  ...editableGiaScalarTypes,
  ...editableGiaListTypes
]);

function defaultGiaScalarValue(typeCode){
  const type=Number(typeCode);
  if(type===6)return '';
  if(type===4)return 'False';
  if(type===5)return '0.00';
  if(type===12)return '0,0,0';
  return '0';
}

function parseGiaScalarValue(typeCode,raw){
  const type=Number(typeCode);
  if(type===6)return String(raw??'');
  const text=String(raw??'').trim();
  if(type===3){
    if(!/^-?\d+$/.test(text))throw new Error('Integer default must be a whole number.');
    const value=BigInt(text);
    if(value<-2147483648n||value>2147483647n)throw new Error('Integer default must fit Int32.');
    return value.toString();
  }
  if(type===4){
    if(/^(true|1)$/i.test(text))return 'True';
    if(/^(false|0)$/i.test(text))return 'False';
    throw new Error('Bool default must be True or False.');
  }
  if(type===5){
    const value=Number(text);
    if(!Number.isFinite(value))throw new Error('Float default must be a number.');
    return text||'0';
  }
  if(type===12){
    const parts=text.split(',').map(part=>part.trim());
    if(parts.length!==3||parts.some(part=>!Number.isFinite(Number(part)))){
      throw new Error('Vector3 default must use X,Y,Z, for example 1,2,3.');
    }
    return parts.join(',');
  }
  if(type===20||type===21){
    try{
      const value=BigInt(text||'0');
      if(value<0n||value>0xFFFFFFFFFFFFFFFFn)throw new Error();
      return value.toString();
    }catch{
      throw new Error('ID default must be a non-negative integer.');
    }
  }
  return String(raw??'');
}

function recoverGiaScalarValue(item){
  if(!item||!editableGiaScalarTypes.has(Number(item.typeCode)))return;
  const type=Number(item.typeCode);
  if(Number(item.scalarValueTypeCode)===type&&item.scalarValue!==undefined)return;
  let candidate=defaultGiaScalarValue(type);
  if(item.defaultValue!==undefined&&item.defaultValue!==null){
    try{candidate=parseGiaScalarValue(type,item.defaultValue);}catch{}
  }
  item.scalarValueTypeCode=type;
  item.scalarValue=candidate;
  item.defaultValue=String(candidate);
}

function float32Bytes(value){
  const bytes=new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0,Number(value),true);
  return bytes;
}

function signedInt32VarintValue(value){
  return BigInt.asUintN(64,BigInt(String(value)));
}

function giaScalarTypedPayload(typeCode,value){
  const type=Number(typeCode);
  const parsed=parseGiaScalarValue(type,value);
  if(type===6){
    return parsed===''?new Uint8Array():encodeField(1,2,textEncoder.encode(parsed));
  }
  if(type===3){
    return parsed==='0'?new Uint8Array():encodeField(1,0,signedInt32VarintValue(parsed));
  }
  if(type===4){
    return parsed==='True'?encodeField(1,0,1):new Uint8Array();
  }
  if(type===5){
    return Number(parsed)===0?new Uint8Array():encodeField(1,5,float32Bytes(parsed));
  }
  if(type===12){
    const [x,y,z]=parsed.split(',').map(Number);
    if(x===0&&y===0&&z===0)return encodeField(1,2,new Uint8Array());
    return encodeField(1,2,concatBytes(
      encodeField(1,5,float32Bytes(x)),
      encodeField(2,5,float32Bytes(y)),
      encodeField(3,5,float32Bytes(z))
    ));
  }
  if(type===20||type===21){
    const id=BigInt(parsed);
    return encodeField(1,2,id===0n?new Uint8Array():encodeField(2,0,id));
  }
  return new Uint8Array();
}

function patchGiaScalarDefault(fieldMessage,typeCode,value){
  const type=Number(typeCode);
  if(!editableGiaScalarTypes.has(type))return fieldMessage;
  const memberFields=parseFields(fieldMessage);
  const defaultWrapper=findField(memberFields,3,2);
  const defaultFields=parseFields(defaultWrapper.value);
  const typedField=findField(defaultFields,type+10,2);
  const patchedDefault=replaceField(
    defaultWrapper.value,
    typedField,
    giaScalarTypedPayload(type,value)
  );
  return replaceField(fieldMessage,defaultWrapper,patchedDefault);
}

if(typeof structureGiaBuildTypeOptions==='function'&&!globalThis.__miliastraEditableGiaTypeOptionsV2){
  globalThis.__miliastraEditableGiaTypeOptionsV2=true;
  const previousStructureGiaBuildTypeOptions=structureGiaBuildTypeOptions;
  structureGiaBuildTypeOptions=function(){
    return previousStructureGiaBuildTypeOptions()
      .filter(option=>fullyEditableGiaBuildTypes.has(Number(option.typeCode)));
  };
}

if(typeof patchStructureFieldTemplate==='function'&&!globalThis.__miliastraGiaScalarDefaultBuilderV2){
  globalThis.__miliastraGiaScalarDefaultBuilderV2=true;
  const previousPatchStructureFieldTemplate=patchStructureFieldTemplate;
  patchStructureFieldTemplate=function(typeCode,fieldName,fieldIndex,listValues=[]){
    let message=previousPatchStructureFieldTemplate(typeCode,fieldName,fieldIndex,listValues);
    const item=currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode
      ?currentDocument.items?.[Number(fieldIndex)-1]
      :null;
    if(item&&editableGiaScalarTypes.has(Number(typeCode))){
      recoverGiaScalarValue(item);
      message=patchGiaScalarDefault(message,typeCode,item.scalarValue);
    }
    return message;
  };
}

if(typeof StructureGiaDocument==='function'&&!globalThis.__miliastraGiaScalarNormalizeV2){
  globalThis.__miliastraGiaScalarNormalizeV2=true;
  const previousNormalize=StructureGiaDocument.prototype.normalize;
  StructureGiaDocument.prototype.normalize=function(){
    const result=previousNormalize.call(this);
    if(this.structureBuildMode){
      this.items.forEach(item=>{
        if(editableGiaScalarTypes.has(Number(item.typeCode))){
          recoverGiaScalarValue(item);
          item.defaultValue=String(item.scalarValue);
        }
      });
    }
    return result;
  };
}

function syncStructureBuilderInteractivity(){
  if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode)return;
  const hasSelection=selectedIndex!==null&&Boolean(currentDocument.items?.[selectedIndex]);
  const item=hasSelection?currentDocument.items[selectedIndex]:null;
  const type=Number(item?.typeCode);

  if(elements.structureName)elements.structureName.disabled=false;
  if(elements.structureId)elements.structureId.disabled=false;
  if(elements.generateStructureIdButton)elements.generateStructureIdButton.disabled=false;
  if(elements.structureFieldName)elements.structureFieldName.disabled=!hasSelection;
  if(elements.structureFieldType)elements.structureFieldType.disabled=!hasSelection;

  if(elements.addButton)elements.addButton.disabled=false;
  if(elements.pasteButton)elements.pasteButton.disabled=false;
  if(elements.batchDeleteButton)elements.batchDeleteButton.disabled=false;
  if(elements.duplicateButton)elements.duplicateButton.disabled=!hasSelection;
  if(elements.copyButton)elements.copyButton.disabled=!hasSelection;
  if(elements.deleteButton)elements.deleteButton.disabled=!hasSelection;
  if(elements.upButton)elements.upButton.disabled=!hasSelection||selectedIndex===0;
  if(elements.downButton)elements.downButton.disabled=!hasSelection||selectedIndex===currentDocument.items.length-1;

  const inspector=document.getElementById('structureInspector');
  if(inspector)inspector.style.pointerEvents='auto';

  if(!item)return;

  if(editableGiaScalarTypes.has(type)){
    recoverGiaScalarValue(item);
    elements.structureScalarDefaultField?.classList.remove('hidden');
    elements.structureListDefaultPanel?.classList.add('hidden');
    if(elements.structureFieldDefault){
      elements.structureFieldDefault.disabled=false;
      elements.structureFieldDefault.readOnly=false;
      elements.structureFieldDefault.value=String(item.scalarValue);
      elements.structureFieldDefault.placeholder=type===12?'0,0,0':'';
      elements.structureFieldDefault.inputMode=[3,20,21].includes(type)?'numeric':type===5?'decimal':'text';
    }
  }else if(editableGiaListTypes.has(type)){
    elements.structureScalarDefaultField?.classList.add('hidden');
    elements.structureListDefaultPanel?.classList.remove('hidden');
    if(elements.structureListAddButton)elements.structureListAddButton.disabled=false;
  }
}

if(typeof renderGia==='function'&&!globalThis.__miliastraGiaInteractivityRenderV2){
  globalThis.__miliastraGiaInteractivityRenderV2=true;
  const previousRenderGia=renderGia;
  renderGia=function(...args){
    const result=previousRenderGia(...args);
    syncStructureBuilderInteractivity();
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode&&selectedIndex!==null){
      const item=currentDocument.items?.[selectedIndex];
      if(item){
        const type=Number(item.typeCode);
        if(editableGiaScalarTypes.has(type)){
          elements.structureGiaHelp.textContent='Build mode: field name, type, and default value are editable. Changes apply automatically.';
        }else if(editableGiaListTypes.has(type)){
          elements.structureGiaHelp.textContent='Build mode: use + Add Item and the row controls to edit this list default.';
        }
      }
    }
    return result;
  };
}

let scalarFocusState=null;
if(elements.structureFieldDefault&&!elements.structureFieldDefault.dataset.editableGiaScalarDefaultV2){
  elements.structureFieldDefault.dataset.editableGiaScalarDefaultV2='1';
  elements.structureFieldDefault.addEventListener('focus',()=>{
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode&&selectedIndex!==null){
      scalarFocusState=captureHistoryState();
    }
  });
  elements.structureFieldDefault.addEventListener('change',()=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode||selectedIndex===null)return;
    const item=currentDocument.items[selectedIndex];
    if(!editableGiaScalarTypes.has(Number(item.typeCode)))return;
    try{
      const parsed=parseGiaScalarValue(item.typeCode,elements.structureFieldDefault.value);
      const changed=String(item.scalarValue??'')!==String(parsed);
      if(changed&&scalarFocusState)pushHistory('Edit Structure default value',scalarFocusState);
      item.scalarValueTypeCode=Number(item.typeCode);
      item.scalarValue=parsed;
      item.defaultValue=String(parsed);
      elements.structureFieldDefault.value=String(parsed);
      updateMeta();
      setStatus('Structure default value updated.','success');
    }catch(error){
      alert(error.message||String(error));
      recoverGiaScalarValue(item);
      elements.structureFieldDefault.value=String(item.scalarValue);
      setStatus(error.message||String(error),'error');
    }finally{
      scalarFocusState=null;
    }
  });
  elements.structureFieldDefault.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();
      elements.structureFieldDefault.blur();
    }
  });
}

const newStructureButton=document.getElementById('newStructureGiaButton');
if(newStructureButton&&!newStructureButton.dataset.structureInteractivityRepairV2){
  newStructureButton.dataset.structureInteractivityRepairV2='1';
  newStructureButton.addEventListener('click',()=>{
    setTimeout(()=>{
      if(currentDocument?.kind!=='gia-structure')return;
      currentDocument.structureBuildMode=true;
      currentDocument.normalize();
      renderGia();
      syncStructureBuilderInteractivity();
    },0);
  });
}

syncStructureBuilderInteractivity();
})();
