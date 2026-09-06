(()=>{
'use strict';

/* JSON list values are self-contained arrays. The supplied Structure JSON
   confirms populated Int32List, BoolList, and StringList values, while the
   editor's verified JSON schema defines the remaining primitive list wrappers.
   All primitive/list entries stay in their canonical string representation. */
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

if(typeof primitiveControl==='function'&&!globalThis.__miliastraJsonListItemEditor){
  globalThis.__miliastraJsonListItemEditor=true;
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
      up.className='small'; up.textContent='↑'; up.disabled=index===0;
      up.addEventListener('click',()=>{
        pushHistory(`Move ${type} item`);
        [wrapper.value[index-1],wrapper.value[index]]=[wrapper.value[index],wrapper.value[index-1]];
        renderJson();
      });
      const down=document.createElement('button');
      down.className='small'; down.textContent='↓'; down.disabled=index===wrapper.value.length-1;
      down.addEventListener('click',()=>{
        pushHistory(`Move ${type} item`);
        [wrapper.value[index],wrapper.value[index+1]]=[wrapper.value[index+1],wrapper.value[index]];
        renderJson();
      });
      const duplicate=document.createElement('button');
      duplicate.className='small'; duplicate.textContent='⧉'; duplicate.title='Duplicate item';
      duplicate.addEventListener('click',()=>{
        pushHistory(`Duplicate ${type} item`);
        wrapper.value.splice(index+1,0,deepCloneData(wrapper.value[index]));
        renderJson();
      });
      const remove=document.createElement('button');
      remove.className='small danger'; remove.textContent='×'; remove.title='Delete item';
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

/* Structure GIA Build New: expose only types whose complete editable default
   encoding is confirmed. Other types remain readable when opening existing
   files, but are not offered as half-supported Build New options. */
const editableGiaScalarTypes=new Set([3,4,5,6,12,20,21]);
const fullyEditableGiaBuildTypes=new Set([6,11,3,8,5,4,9,12,15,20,21]);

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

function ensureGiaScalarState(item){
  if(!item||!editableGiaScalarTypes.has(Number(item.typeCode)))return;
  if(Number(item.scalarValueTypeCode)!==Number(item.typeCode)){
    item.scalarValueTypeCode=Number(item.typeCode);
    item.scalarValue=defaultGiaScalarValue(item.typeCode);
  }
  if(item.scalarValue===undefined||item.scalarValue===null){
    item.scalarValue=defaultGiaScalarValue(item.typeCode);
  }
  item.defaultValue=String(item.scalarValue);
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
    const vector=concatBytes(
      encodeField(1,5,float32Bytes(x)),
      encodeField(2,5,float32Bytes(y)),
      encodeField(3,5,float32Bytes(z))
    );
    return encodeField(1,2,vector);
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

if(typeof patchStructureFieldTemplate==='function'&&!globalThis.__miliastraGiaScalarDefaultBuilder){
  globalThis.__miliastraGiaScalarDefaultBuilder=true;
  const previousPatchStructureFieldTemplate=patchStructureFieldTemplate;
  patchStructureFieldTemplate=function(typeCode,fieldName,fieldIndex,listValues=[]){
    let message=previousPatchStructureFieldTemplate(typeCode,fieldName,fieldIndex,listValues);
    const item=currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode
      ?currentDocument.items?.[Number(fieldIndex)-1]
      :null;
    if(item&&editableGiaScalarTypes.has(Number(typeCode))){
      ensureGiaScalarState(item);
      message=patchGiaScalarDefault(message,typeCode,item.scalarValue);
    }
    return message;
  };
}

if(typeof StructureGiaDocument==='function'&&!globalThis.__miliastraGiaScalarNormalize){
  globalThis.__miliastraGiaScalarNormalize=true;
  const previousNormalize=StructureGiaDocument.prototype.normalize;
  StructureGiaDocument.prototype.normalize=function(){
    const result=previousNormalize.call(this);
    if(this.structureBuildMode){
      this.items.forEach(item=>ensureGiaScalarState(item));
    }
    return result;
  };
}

function filterGiaBuildTypeOptions(){
  if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode)return;
  const select=elements.structureFieldType;
  if(!select)return;
  [...select.options].forEach(option=>{
    if(!fullyEditableGiaBuildTypes.has(Number(option.value)))option.remove();
  });
}

function configureGiaScalarEditor(){
  if(currentDocument?.kind!=='gia-structure'||selectedIndex===null)return;
  const item=currentDocument.items?.[selectedIndex];
  if(!item)return;
  if(!currentDocument.structureBuildMode)return;

  filterGiaBuildTypeOptions();
  if(editableGiaScalarTypes.has(Number(item.typeCode))){
    ensureGiaScalarState(item);
    elements.structureScalarDefaultField.classList.remove('hidden');
    elements.structureListDefaultPanel.classList.add('hidden');
    elements.structureFieldDefault.disabled=false;
    elements.structureFieldDefault.readOnly=false;
    elements.structureFieldDefault.value=String(item.scalarValue);
    elements.structureFieldDefault.placeholder=Number(item.typeCode)===12?'0,0,0':'';
    elements.structureFieldDefault.inputMode=[3,20,21].includes(Number(item.typeCode))?'numeric':Number(item.typeCode)===5?'decimal':'text';
  }else if(fullyEditableGiaBuildTypes.has(Number(item.typeCode))){
    elements.structureFieldDefault.disabled=true;
  }
}

if(typeof renderGia==='function'&&!globalThis.__miliastraGiaValueRender){
  globalThis.__miliastraGiaValueRender=true;
  const previousRenderGia=renderGia;
  renderGia=function(...args){
    const result=previousRenderGia(...args);
    configureGiaScalarEditor();
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode){
      const item=currentDocument.items?.[selectedIndex];
      if(item){
        const type=Number(item.typeCode);
        if(editableGiaScalarTypes.has(type)){
          elements.structureGiaHelp.textContent='Build mode: edit the field name, type, and default value directly. Struct/StructList and other types whose full default shape is not known are not offered for Build New.';
        }else if([8,9,11,15].includes(type)){
          elements.structureGiaHelp.textContent='Build mode: use + Add Item and the row controls to edit this list default. The list encoding is confirmed for this type.';
        }
      }
    }
    return result;
  };
}

let giaScalarFocusState=null;
if(elements.structureFieldDefault&&!elements.structureFieldDefault.dataset.editableGiaScalarDefault){
  elements.structureFieldDefault.dataset.editableGiaScalarDefault='1';
  elements.structureFieldDefault.addEventListener('focus',()=>{
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode){
      giaScalarFocusState=captureHistoryState();
    }
  });
  elements.structureFieldDefault.addEventListener('change',()=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode||selectedIndex===null)return;
    const item=currentDocument.items[selectedIndex];
    if(!editableGiaScalarTypes.has(Number(item.typeCode)))return;
    try{
      const parsed=parseGiaScalarValue(item.typeCode,elements.structureFieldDefault.value);
      const changed=String(item.scalarValue??'')!==String(parsed);
      if(changed&&giaScalarFocusState)pushHistory('Edit Structure default value',giaScalarFocusState);
      item.scalarValueTypeCode=Number(item.typeCode);
      item.scalarValue=parsed;
      item.defaultValue=String(parsed);
      elements.structureFieldDefault.value=String(parsed);
      updateMeta();
      setStatus('Structure default value updated.','success');
    }catch(error){
      alert(error.message||String(error));
      ensureGiaScalarState(item);
      elements.structureFieldDefault.value=String(item.scalarValue);
      setStatus(error.message||String(error),'error');
    }finally{
      giaScalarFocusState=null;
    }
  });
  elements.structureFieldDefault.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();
      elements.structureFieldDefault.blur();
    }
  });
}

/* Preserve editable defaults when duplicating/copying/pasting Structure fields. */
if(elements.duplicateButton&&!elements.duplicateButton.dataset.giaValueDuplicate){
  elements.duplicateButton.dataset.giaValueDuplicate='1';
  elements.duplicateButton.addEventListener('click',event=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode||selectedIndex===null)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!applyGiaFields(false,false))return;
    pushHistory('Duplicate Structure field');
    const source=currentDocument.items[selectedIndex];
    const copy=deepCloneData(source);
    copy.name=variableCopyName(source.name||'Field');
    copy.originalName=copy.name;
    currentDocument.items.splice(selectedIndex+1,0,copy);
    currentDocument.normalize();
    selectedIndex+=1;
    renderGia();
    updateMeta();
    setStatus('Duplicated Structure field.','success');
  },true);
}

if(elements.copyButton&&!elements.copyButton.dataset.giaValueCopy){
  elements.copyButton.dataset.giaValueCopy='1';
  elements.copyButton.addEventListener('click',event=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode||selectedIndex===null)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const source=currentDocument.items[selectedIndex];
    copyEditorFragment('gia-structure-field',{
      name:source.name,
      typeCode:source.typeCode,
      listValues:deepCloneData(source.listValues||[]),
      scalarValue:source.scalarValue,
      scalarValueTypeCode:source.scalarValueTypeCode
    },'Structure field');
  },true);
}

if(elements.pasteButton&&!elements.pasteButton.dataset.giaValuePaste){
  elements.pasteButton.dataset.giaValuePaste='1';
  elements.pasteButton.addEventListener('click',async event=>{
    if(currentDocument?.kind!=='gia-structure'||!currentDocument.structureBuildMode)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const fragment=await readEditorFragment();
    if(!fragment||fragment.kind!=='gia-structure-field'){
      alert('Clipboard does not contain a Structure field.');
      return;
    }
    const typeCode=Number(fragment.data?.typeCode);
    if(!fullyEditableGiaBuildTypes.has(typeCode)){
      alert('That copied field type is readable, but is not fully supported for Build New yet.');
      return;
    }
    const insertAt=selectedIndex===null?currentDocument.items.length:selectedIndex+1;
    const item={
      index:insertAt+1,
      name:variableCopyName(fragment.data.name||'Pasted Field'),
      originalName:'',
      typeCode,
      typeName:structureGiaTypeName(typeCode),
      listValues:deepCloneData(fragment.data.listValues||[]),
      scalarValue:fragment.data.scalarValue,
      scalarValueTypeCode:fragment.data.scalarValueTypeCode,
      defaultValue:''
    };
    item.originalName=item.name;
    ensureGiaScalarState(item);
    pushHistory('Paste Structure field');
    currentDocument.items.splice(insertAt,0,item);
    currentDocument.normalize();
    selectedIndex=insertAt;
    renderGia();
    updateMeta();
    setStatus('Pasted Structure field.','success');
  },true);
}

})();
