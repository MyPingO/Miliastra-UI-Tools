(()=>{
'use strict';

/* Generic GIA Dictionary support.
   Test Structure(1).gia confirms that a Structure Dictionary stores:
   - a dictionary type descriptor (key/value type + generated dictionary type id),
   - repeated key/value typed wrappers,
   - repeated key/value pair Struct wrappers,
   - key/value type metadata on Assemble/Split/Modify ports.
   Struct / StructList values stay unavailable in Build New because their value
   payloads depend on an external custom Structure definition. */

const GIA_DICT_KEY_TYPES=[6,3,2,20,21,17,1];
const GIA_DICT_VALUE_TYPES=(Array.isArray(STRUCTURE_GIA_BUILD_TYPE_CODES)?STRUCTURE_GIA_BUILD_TYPE_CODES:[])
  .map(Number)
  .filter(typeCode=>typeCode!==25&&typeCode!==26);
const GIA_DICT_SIMPLE_TYPES=new Set([1,2,3,4,5,6,12,17,20,21]);
const GIA_DICT_LIST_TYPES=new Set([7,8,9,10,11,13,15,22,23,24]);
const GIA_DICT_REFERENCE_TYPES=new Set([20,21]);
const GIA_DICT_ID_TYPES=new Set([1,2,17]);
const GIA_DICT_REFERENCE_LIST_TYPES=new Set([22,23]);
const GIA_DICT_PACKED_VARINT_LIST_TYPES=new Set([7,8,9,13,24]);
const GIA_DICT_BUILTIN_STRING_STRING_ID=66;
const GIA_DICT_TYPE_ID_BASE=0x43C00000;
const GIA_DICT_OBJECT_ID_BASE=0x40000000;

function giaDictionaryFriendlyType(typeCode){
  const canonical=structureGiaTypeName(Number(typeCode));
  const aliases={
    Int32:'Integer',
    Int32List:'Integer List',
    Guid:'GUID',
    GuidList:'GUID List',
    ConfigReference:'Configuration ID',
    ConfigReferenceList:'Configuration ID List',
    EntityReference:'Prefab ID',
    EntityReferenceList:'Prefab ID List',
    Army:'Faction',
    ArmyList:'Faction List',
    Dict:'Dictionary'
  };
  return aliases[canonical]||canonical;
}

function giaDictionaryRandomSuffix(){
  let value;
  if(globalThis.crypto?.getRandomValues){
    const values=new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    value=values[0];
  }else{
    value=(Date.now()^Math.floor(Math.random()*0xFFFFFFFF))>>>0;
  }
  return 1+(value%0x000FFFFF);
}

function collectGiaDictionaryIds(){
  const dictIds=new Set();
  const objectIds=new Set();
  const visit=model=>{
    if(!model||typeof model!=='object')return;
    if(Number.isFinite(Number(model.typeId)))dictIds.add(Number(model.typeId));
    for(const entry of model.entries||[]){
      if(Number.isFinite(Number(entry.internalId)))objectIds.add(Number(entry.internalId));
      if(Number(model.valueTypeCode)===27)visit(entry.value);
    }
  };
  if(currentDocument?.kind==='gia-structure'){
    for(const item of currentDocument.items||[]){
      if(Number(item.typeCode)===27)visit(item.dictionaryModel);
    }
  }
  return {dictIds,objectIds};
}

function generateGiaDictionaryTypeId(){
  const {dictIds}=collectGiaDictionaryIds();
  for(let attempt=0;attempt<64;attempt+=1){
    const value=GIA_DICT_TYPE_ID_BASE+giaDictionaryRandomSuffix();
    if(!dictIds.has(value))return value;
  }
  return GIA_DICT_TYPE_ID_BASE+((Date.now()&0xFFFFF)||1);
}

function generateGiaDictionaryObjectId(){
  const {objectIds}=collectGiaDictionaryIds();
  for(let attempt=0;attempt<64;attempt+=1){
    const value=GIA_DICT_OBJECT_ID_BASE+giaDictionaryRandomSuffix();
    if(!objectIds.has(value))return value;
  }
  return GIA_DICT_OBJECT_ID_BASE+((Date.now()&0xFFFFF)||1);
}

function newGiaDictionaryModel(keyTypeCode=6,valueTypeCode=6){
  const key=Number(keyTypeCode);
  const value=Number(valueTypeCode);
  const builtin=key===6&&value===6;
  return {
    keyTypeCode:key,
    valueTypeCode:value,
    typeId:builtin?GIA_DICT_BUILTIN_STRING_STRING_ID:generateGiaDictionaryTypeId(),
    customType:!builtin,
    entries:[]
  };
}

function cloneGiaDictionaryModel(model,regenerateIds=false){
  const copy=deepCloneData(model||newGiaDictionaryModel());
  if(regenerateIds){
    if(!(Number(copy.keyTypeCode)===6&&Number(copy.valueTypeCode)===6)){
      copy.typeId=generateGiaDictionaryTypeId();
      copy.customType=true;
    }else{
      copy.typeId=GIA_DICT_BUILTIN_STRING_STRING_ID;
      copy.customType=false;
    }
    const visit=current=>{
      for(const entry of current.entries||[]){
        entry.internalId=generateGiaDictionaryObjectId();
        if(Number(current.valueTypeCode)===27&&entry.value)visit(entry.value);
      }
    };
    visit(copy);
  }
  return copy;
}

function defaultGiaDictionaryValue(typeCode){
  const type=Number(typeCode);
  if(type===6)return '';
  if(type===4)return false;
  if(type===5)return 0;
  if(type===12)return {x:0,y:0,z:0};
  if(GIA_DICT_LIST_TYPES.has(type))return [];
  if(type===27)return newGiaDictionaryModel();
  return '0';
}

function normalizeGiaDictionaryScalar(typeCode,raw){
  const type=Number(typeCode);
  if(type===6)return String(raw??'');
  if(type===4){
    if(raw===true||raw===1||/^(true|1)$/i.test(String(raw)))return true;
    if(raw===false||raw===0||/^(false|0)$/i.test(String(raw)))return false;
    throw new Error('Bool values must be True or False.');
  }
  if(type===5){
    const value=Number(raw);
    if(!Number.isFinite(value))throw new Error('Float values must be numbers.');
    return value;
  }
  if(type===12){
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      const vector={x:Number(raw.x),y:Number(raw.y),z:Number(raw.z)};
      if(Object.values(vector).every(Number.isFinite))return vector;
    }
    const parts=String(raw??'').split(',').map(part=>Number(part.trim()));
    if(parts.length===3&&parts.every(Number.isFinite))return {x:parts[0],y:parts[1],z:parts[2]};
    throw new Error('Vector3 values must contain X, Y, and Z numbers.');
  }
  if(type===3){
    const text=String(raw??'0').trim()||'0';
    if(!/^-?\d+$/.test(text))throw new Error('Integer values must be whole numbers.');
    const value=BigInt(text);
    if(value<-2147483648n||value>2147483647n)throw new Error('Integer values must fit Int32.');
    return value.toString();
  }
  if(GIA_DICT_ID_TYPES.has(type)||GIA_DICT_REFERENCE_TYPES.has(type)){
    const text=String(raw??'0').trim()||'0';
    try{
      const value=BigInt(text);
      if(value<0n||value>0xFFFFFFFFFFFFFFFFn)throw new Error();
      return value.toString();
    }catch{
      throw new Error(`${giaDictionaryFriendlyType(type)} values must be non-negative integer IDs.`);
    }
  }
  return raw;
}

function normalizeGiaDictionaryValue(typeCode,raw){
  const type=Number(typeCode);
  if(GIA_DICT_SIMPLE_TYPES.has(type))return normalizeGiaDictionaryScalar(type,raw);
  if(GIA_DICT_LIST_TYPES.has(type)){
    const elementType=STRUCTURE_GIA_TYPES.get(type)?.elementTypeCode;
    const list=Array.isArray(raw)?raw:[];
    return list.map(value=>normalizeGiaDictionaryScalar(elementType,value));
  }
  if(type===27){
    if(raw&&typeof raw==='object'&&Array.isArray(raw.entries))return raw;
    return newGiaDictionaryModel();
  }
  return raw;
}

function canonicalGiaDictionaryKey(typeCode,value){
  const type=Number(typeCode);
  if(type===6)return String(value??'');
  if(type===3)return BigInt(normalizeGiaDictionaryScalar(type,value)).toString();
  return BigInt(normalizeGiaDictionaryScalar(type,value)).toString();
}

function dictionaryHasKey(model,value,exceptIndex=-1){
  const canonical=canonicalGiaDictionaryKey(model.keyTypeCode,value);
  return (model.entries||[]).some((entry,index)=>
    index!==exceptIndex&&canonicalGiaDictionaryKey(model.keyTypeCode,entry.key)===canonical
  );
}

function nextGiaDictionaryKey(model){
  if(Number(model.keyTypeCode)===6){
    let index=1;
    while(true){
      const value=index===1?'Key':`Key ${index}`;
      if(!dictionaryHasKey(model,value))return value;
      index+=1;
    }
  }
  let value=1n;
  while(dictionaryHasKey(model,value.toString()))value+=1n;
  return value.toString();
}

function ensureGiaDictionaryModel(item){
  if(!item||Number(item.typeCode)!==27)return null;
  if(!item.dictionaryModel||typeof item.dictionaryModel!=='object'){
    const key=Number.isFinite(Number(item.dictionaryKeyTypeCode))?Number(item.dictionaryKeyTypeCode):6;
    const value=Number.isFinite(Number(item.dictionaryValueTypeCode))?Number(item.dictionaryValueTypeCode):6;
    item.dictionaryModel=newGiaDictionaryModel(key,value);
    if(item.dictionaryTypeId){
      item.dictionaryModel.typeId=Number(item.dictionaryTypeId);
      item.dictionaryModel.customType=Number(item.dictionaryTypeId)!==GIA_DICT_BUILTIN_STRING_STRING_ID;
    }
  }
  const model=item.dictionaryModel;
  if(!Array.isArray(model.entries))model.entries=[];
  if(!GIA_DICT_KEY_TYPES.includes(Number(model.keyTypeCode)))model.keyTypeCode=6;
  if(!GIA_DICT_VALUE_TYPES.includes(Number(model.valueTypeCode)))model.valueTypeCode=6;
  const builtin=Number(model.keyTypeCode)===6&&Number(model.valueTypeCode)===6;
  if(!Number.isFinite(Number(model.typeId))){
    model.typeId=builtin?GIA_DICT_BUILTIN_STRING_STRING_ID:generateGiaDictionaryTypeId();
  }
  model.customType=Number(model.typeId)!==GIA_DICT_BUILTIN_STRING_STRING_ID;
  item.dictionaryKeyTypeCode=Number(model.keyTypeCode);
  item.dictionaryValueTypeCode=Number(model.valueTypeCode);
  item.dictionaryTypeId=String(model.typeId);
  item.defaultValue=giaDictionarySummary(model);
  return model;
}

function giaDictionarySummary(model){
  return `${giaDictionaryFriendlyType(model?.keyTypeCode??6)} → ${giaDictionaryFriendlyType(model?.valueTypeCode??6)} · ${(model?.entries||[]).length} entr${(model?.entries||[]).length===1?'y':'ies'}`;
}

function encodeSignedInt32DictionaryVarint(value){
  return encodeVarint(BigInt.asUintN(64,BigInt(String(value))));
}

function dictionaryFloat32Bytes(value){
  const bytes=new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0,Number(value)||0,true);
  return bytes;
}

function simpleGiaTypeDescriptor(typeCode){
  const type=Number(typeCode);
  return concatBytes(
    encodeField(1,0,type),
    encodeField(2,2,new Uint8Array())
  );
}

function buildGiaDictionaryConfig(model){
  const key=Number(model.keyTypeCode);
  const value=Number(model.valueTypeCode);
  const builtin=Number(model.typeId)===GIA_DICT_BUILTIN_STRING_STRING_ID&&key===6&&value===6;
  const parts=[];
  if(!builtin)parts.push(encodeField(1,0,1));
  parts.push(encodeField(2,0,Number(model.typeId)));
  parts.push(encodeField(502,0,key));
  parts.push(encodeField(503,0,value));
  return concatBytes(...parts);
}

function buildGiaDictionaryDescriptor(model){
  return concatBytes(
    encodeField(1,0,27),
    encodeField(2,2,buildGiaDictionaryConfig(model))
  );
}

function encodeGiaDictionaryScalarPayload(typeCode,value){
  const type=Number(typeCode);
  const normalized=normalizeGiaDictionaryScalar(type,value);
  if(type===6){
    return normalized===''?new Uint8Array():encodeField(1,2,textEncoder.encode(normalized));
  }
  if(type===3){
    return normalized==='0'?new Uint8Array():encodeField(1,0,BigInt.asUintN(64,BigInt(normalized)));
  }
  if(type===4){
    return normalized?encodeField(1,0,1):new Uint8Array();
  }
  if(type===5){
    return Number(normalized)===0?new Uint8Array():encodeField(1,5,dictionaryFloat32Bytes(normalized));
  }
  if(type===12){
    const vector=normalized;
    const vectorBytes=(Number(vector.x)===0&&Number(vector.y)===0&&Number(vector.z)===0)
      ?new Uint8Array()
      :concatBytes(
          encodeField(1,5,dictionaryFloat32Bytes(vector.x)),
          encodeField(2,5,dictionaryFloat32Bytes(vector.y)),
          encodeField(3,5,dictionaryFloat32Bytes(vector.z))
        );
    return encodeField(1,2,vectorBytes);
  }
  if(GIA_DICT_REFERENCE_TYPES.has(type)){
    const id=BigInt(normalized);
    return encodeField(1,2,id===0n?new Uint8Array():encodeField(2,0,id));
  }
  if(GIA_DICT_ID_TYPES.has(type)){
    const id=BigInt(normalized);
    return id===0n?new Uint8Array():encodeField(1,0,id);
  }
  return new Uint8Array();
}

function encodeGiaDictionaryListPayload(typeCode,values){
  const type=Number(typeCode);
  const list=normalizeGiaDictionaryValue(type,values);
  if(!list.length)return new Uint8Array();
  const elementType=Number(STRUCTURE_GIA_TYPES.get(type)?.elementTypeCode);

  if(type===11){
    return concatBytes(...list.map(value=>encodeField(1,2,textEncoder.encode(String(value??'')))));
  }
  if(type===15){
    return concatBytes(...list.map(value=>{
      const vector=normalizeGiaDictionaryScalar(12,value);
      return encodeField(1,2,concatBytes(
        encodeField(1,5,dictionaryFloat32Bytes(vector.x)),
        encodeField(2,5,dictionaryFloat32Bytes(vector.y)),
        encodeField(3,5,dictionaryFloat32Bytes(vector.z))
      ));
    }));
  }
  if(type===10){
    const packed=concatBytes(...list.map(value=>dictionaryFloat32Bytes(normalizeGiaDictionaryScalar(5,value))));
    return encodeField(1,2,packed);
  }
  if(GIA_DICT_REFERENCE_LIST_TYPES.has(type)){
    return concatBytes(...list.map(value=>{
      const id=BigInt(normalizeGiaDictionaryScalar(elementType,value));
      return encodeField(1,2,id===0n?new Uint8Array():encodeField(2,0,id));
    }));
  }
  if(GIA_DICT_PACKED_VARINT_LIST_TYPES.has(type)){
    const packed=concatBytes(...list.map(value=>{
      if(type===8)return encodeSignedInt32DictionaryVarint(normalizeGiaDictionaryScalar(3,value));
      if(type===9)return encodeVarint(normalizeGiaDictionaryScalar(4,value)?1:0);
      return encodeVarint(BigInt(normalizeGiaDictionaryScalar(elementType,value)));
    }));
    return encodeField(1,2,packed);
  }
  return new Uint8Array();
}

function buildGiaTypedValueWrapper(typeCode,value,options={}){
  const type=Number(typeCode);
  if(type===27){
    const model=value&&typeof value==='object'?value:newGiaDictionaryModel();
    const payload=buildGiaDictionaryPayload(model,{pairCopy:Boolean(options.pairCopy)});
    return concatBytes(
      encodeField(1,0,27),
      encodeField(2,2,buildGiaDictionaryDescriptor(model)),
      encodeField(37,2,payload)
    );
  }
  if(!GIA_DICT_SIMPLE_TYPES.has(type)&&!GIA_DICT_LIST_TYPES.has(type)){
    throw new Error(`Dictionary value type ${giaDictionaryFriendlyType(type)} is not constructible without an external Structure shape.`);
  }
  const payload=GIA_DICT_LIST_TYPES.has(type)
    ?encodeGiaDictionaryListPayload(type,value)
    :encodeGiaDictionaryScalarPayload(type,value);
  return concatBytes(
    encodeField(1,0,type),
    encodeField(2,2,simpleGiaTypeDescriptor(type)),
    encodeField(type+10,2,payload)
  );
}

function buildGiaDictionaryPair(model,entry,options={}){
  const dictConfig=buildGiaDictionaryConfig(model);
  const keyWrapper=buildGiaTypedValueWrapper(model.keyTypeCode,entry.key);
  const valueWrapper=buildGiaTypedValueWrapper(model.valueTypeCode,entry.value,{pairCopy:true});
  const internalId=options.pairCopy?generateGiaDictionaryObjectId():Number(entry.internalId);
  const pairData=concatBytes(
    encodeField(1,2,keyWrapper),
    encodeField(1,2,valueWrapper),
    encodeField(501,0,Number(model.typeId)),
    encodeField(502,2,concatBytes(
      encodeField(2,0,28),
      encodeField(4,0,internalId)
    ))
  );
  return concatBytes(
    encodeField(1,0,25),
    encodeField(2,2,concatBytes(
      encodeField(1,0,25),
      encodeField(2,2,dictConfig)
    )),
    encodeField(35,2,pairData)
  );
}

function buildGiaDictionaryPayload(model,options={}){
  const pairs=[];
  const keys=[];
  const values=[];
  for(const entry of model.entries||[]){
    if(!Number.isFinite(Number(entry.internalId)))entry.internalId=generateGiaDictionaryObjectId();
    pairs.push(encodeField(1,2,buildGiaDictionaryPair(model,entry,options)));
    keys.push(encodeField(501,2,buildGiaTypedValueWrapper(model.keyTypeCode,entry.key)));
    values.push(encodeField(502,2,buildGiaTypedValueWrapper(model.valueTypeCode,entry.value,{pairCopy:Boolean(options.pairCopy)})));
  }
  return concatBytes(
    ...pairs,
    ...keys,
    ...values,
    encodeField(503,0,Number(model.keyTypeCode)),
    encodeField(504,0,Number(model.valueTypeCode))
  );
}

function buildGiaDictionaryDefaultWrapper(model){
  return concatBytes(
    encodeField(1,0,27),
    encodeField(2,2,buildGiaDictionaryDescriptor(model)),
    encodeField(37,2,buildGiaDictionaryPayload(model))
  );
}

function patchGiaDictionaryFieldMessage(message,item){
  const model=ensureGiaDictionaryModel(item);
  const fields=parseFields(message);
  const descriptorField=findField(fields,1,2);
  const defaultField=findField(fields,3,2);
  return replaceMultipleFields(message,[
    [descriptorField,buildGiaDictionaryDescriptor(model)],
    [defaultField,buildGiaDictionaryDefaultWrapper(model)]
  ]);
}

function patchGiaDictionaryPortMessage(message,model){
  try{
    const fields=parseFields(message);
    const portTypeField=findField(fields,4,2);
    const portTypeFields=parseFields(portTypeField.value);
    const dictMetaField=findField(portTypeFields,105,2);
    let dictMeta=dictMetaField.value;
    dictMeta=replaceOrInsertVarintField(dictMeta,3,Number(model.keyTypeCode),false);
    dictMeta=replaceOrInsertVarintField(dictMeta,4,Number(model.valueTypeCode),false);
    const metaFields=parseFields(dictMeta);
    const parts=[];
    for(const field of metaFields){
      if(field.number===5&&field.wireType===0)continue;
      parts.push(dictMeta.slice(field.start,field.end));
    }
    dictMeta=concatBytes(...parts);
    const patchedPortType=replaceField(portTypeField.value,dictMetaField,dictMeta);
    return replaceField(message,portTypeField,patchedPortType);
  }catch{
    return message;
  }
}

function decodeDictionaryFloat32(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==4)return 0;
  return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getFloat32(0,true);
}

function decodeDictionaryPackedVarints(bytes){
  const values=[];
  let position=0;
  while(position<bytes.length){
    const [value,next]=readVarint(bytes,position,bytes.length);
    values.push(typeof value==='bigint'?value:BigInt(value));
    position=next;
  }
  return values;
}

function readGiaTypedValueWrapper(wrapperBytes,typeCode){
  const type=Number(typeCode);
  if(type===27){
    return readGiaDictionaryModelFromWrapper(wrapperBytes);
  }
  if(type===25||type===26){
    return {unsupportedStructure:true,raw:Array.from(wrapperBytes)};
  }
  try{
    const fields=parseFields(wrapperBytes);
    const typedField=optionalField(fields,type+10,2);
    if(!typedField)return defaultGiaDictionaryValue(type);
    const payload=typedField.value;
    const payloadFields=parseFields(payload);
    if(type===6){
      const field=optionalField(payloadFields,1,2);
      return field?decodeUtf8(field.value):'';
    }
    if(type===3){
      const field=optionalField(payloadFields,1,0);
      if(!field)return '0';
      return BigInt.asIntN(32,BigInt(field.value)).toString();
    }
    if(type===4){
      const field=optionalField(payloadFields,1,0);
      return Boolean(field&&Number(field.value));
    }
    if(type===5){
      const field=optionalField(payloadFields,1,5);
      return field?decodeDictionaryFloat32(field.value):0;
    }
    if(type===12){
      const field=optionalField(payloadFields,1,2);
      if(!field)return {x:0,y:0,z:0};
      const vf=parseFields(field.value);
      const readAxis=number=>{
        const axis=optionalField(vf,number,5);
        return axis?decodeDictionaryFloat32(axis.value):0;
      };
      return {x:readAxis(1),y:readAxis(2),z:readAxis(3)};
    }
    if(GIA_DICT_REFERENCE_TYPES.has(type)){
      const field=optionalField(payloadFields,1,2);
      if(!field)return '0';
      const id=optionalField(parseFields(field.value),2,0);
      return id?String(id.value):'0';
    }
    if(GIA_DICT_ID_TYPES.has(type)){
      const field=optionalField(payloadFields,1,0);
      return field?String(field.value):'0';
    }
    if(GIA_DICT_LIST_TYPES.has(type)){
      const elementType=Number(STRUCTURE_GIA_TYPES.get(type)?.elementTypeCode);
      if(type===11){
        return payloadFields.filter(field=>field.number===1&&field.wireType===2).map(field=>decodeUtf8(field.value));
      }
      if(type===15){
        return payloadFields.filter(field=>field.number===1&&field.wireType===2).map(field=>{
          const vf=parseFields(field.value);
          const axis=number=>{
            const f=optionalField(vf,number,5);
            return f?decodeDictionaryFloat32(f.value):0;
          };
          return {x:axis(1),y:axis(2),z:axis(3)};
        });
      }
      if(type===10){
        const packed=payloadFields.find(field=>field.number===1&&field.wireType===2);
        if(!packed)return [];
        const output=[];
        for(let offset=0;offset+4<=packed.value.length;offset+=4){
          output.push(decodeDictionaryFloat32(packed.value.slice(offset,offset+4)));
        }
        return output;
      }
      if(GIA_DICT_REFERENCE_LIST_TYPES.has(type)){
        return payloadFields.filter(field=>field.number===1&&field.wireType===2).map(field=>{
          const id=optionalField(parseFields(field.value),2,0);
          return id?String(id.value):'0';
        });
      }
      if(GIA_DICT_PACKED_VARINT_LIST_TYPES.has(type)){
        const output=[];
        for(const field of payloadFields.filter(field=>field.number===1)){
          const rawValues=field.wireType===2?decodeDictionaryPackedVarints(field.value):[BigInt(field.value)];
          for(const raw of rawValues){
            if(type===8)output.push(BigInt.asIntN(32,raw).toString());
            else if(type===9)output.push(raw!==0n);
            else output.push(raw.toString());
          }
        }
        return output;
      }
    }
  }catch{}
  return defaultGiaDictionaryValue(type);
}

function readGiaDictionaryModelFromWrapper(wrapperBytes){
  try{
    const fields=parseFields(wrapperBytes);
    const descriptorField=optionalField(fields,2,2);
    const payloadField=optionalField(fields,37,2);
    if(!descriptorField||!payloadField)return null;
    const descriptorFields=parseFields(descriptorField.value);
    const configField=optionalField(descriptorFields,2,2);
    const configFields=configField?parseFields(configField.value):[];
    const typeIdField=optionalField(configFields,2,0);
    const customField=optionalField(configFields,1,0);
    const payloadFields=parseFields(payloadField.value);
    const keyTypeField=optionalField(payloadFields,503,0);
    const valueTypeField=optionalField(payloadFields,504,0);
    if(!keyTypeField||!valueTypeField)return null;
    const model={
      keyTypeCode:Number(keyTypeField.value),
      valueTypeCode:Number(valueTypeField.value),
      typeId:typeIdField?Number(typeIdField.value):GIA_DICT_BUILTIN_STRING_STRING_ID,
      customType:Boolean(customField&&Number(customField.value)),
      entries:[]
    };
    const keys=payloadFields.filter(field=>field.number===501&&field.wireType===2);
    const values=payloadFields.filter(field=>field.number===502&&field.wireType===2);
    const pairIds=payloadFields.filter(field=>field.number===1&&field.wireType===2).map(field=>{
      try{
        const pairFields=parseFields(field.value);
        const pairData=findField(pairFields,35,2);
        const dataFields=parseFields(pairData.value);
        const meta=findField(dataFields,502,2);
        const id=optionalField(parseFields(meta.value),4,0);
        return id?Number(id.value):generateGiaDictionaryObjectId();
      }catch{return generateGiaDictionaryObjectId();}
    });
    const count=Math.min(keys.length,values.length);
    for(let index=0;index<count;index+=1){
      model.entries.push({
        key:readGiaTypedValueWrapper(keys[index].value,model.keyTypeCode),
        value:readGiaTypedValueWrapper(values[index].value,model.valueTypeCode),
        internalId:pairIds[index]||generateGiaDictionaryObjectId()
      });
    }
    return model;
  }catch{return null;}
}

function readGiaDictionaryModelFromField(fieldMessage){
  try{
    const fields=parseFields(fieldMessage);
    const defaultField=findField(fields,3,2);
    return readGiaDictionaryModelFromWrapper(defaultField.value);
  }catch{return null;}
}

function validateGiaDictionaryModel(model,path='Dictionary'){
  if(!model||typeof model!=='object')throw new Error(`${path} configuration is missing.`);
  if(!GIA_DICT_KEY_TYPES.includes(Number(model.keyTypeCode)))throw new Error(`${path} has an invalid key type.`);
  if(!GIA_DICT_VALUE_TYPES.includes(Number(model.valueTypeCode)))throw new Error(`${path} has an invalid value type.`);
  if(Number(model.valueTypeCode)===25||Number(model.valueTypeCode)===26){
    throw new Error(`${path} cannot create Structure or Structure List values without the referenced custom Structure definition.`);
  }
  const seen=new Set();
  (model.entries||[]).forEach((entry,index)=>{
    const key=canonicalGiaDictionaryKey(model.keyTypeCode,entry.key);
    if(seen.has(key))throw new Error(`${path} contains duplicate key ${JSON.stringify(String(entry.key))}.`);
    seen.add(key);
    normalizeGiaDictionaryValue(model.valueTypeCode,entry.value);
    if(Number(model.valueTypeCode)===27){
      validateGiaDictionaryModel(entry.value,`${path} value ${index+1}`);
    }
  });
}

function updateGiaDictionaryItemMetadata(item){
  const model=ensureGiaDictionaryModel(item);
  if(!model)return;
  item.dictionaryKeyTypeCode=Number(model.keyTypeCode);
  item.dictionaryValueTypeCode=Number(model.valueTypeCode);
  item.dictionaryTypeId=String(model.typeId);
  item.defaultValue=giaDictionarySummary(model);
}

if(typeof readStructureGiaDefinition==='function'&&!globalThis.__miliastraGiaDictionaryReader){
  globalThis.__miliastraGiaDictionaryReader=true;
  const previousReadStructureGiaDefinition=readStructureGiaDefinition;
  readStructureGiaDefinition=function(message){
    const result=previousReadStructureGiaDefinition(message);
    try{
      const byIndex=new Map();
      for(const field of parseFields(message).filter(field=>field.number===3&&field.wireType===2)){
        try{
          const memberFields=parseFields(field.value);
          const typeField=optionalField(memberFields,502,0);
          const indexField=optionalField(memberFields,503,0);
          if(typeField&&indexField&&Number(typeField.value)===27){
            const model=readGiaDictionaryModelFromField(field.value);
            if(model)byIndex.set(Number(indexField.value),model);
          }
        }catch{}
      }
      for(const member of result.members||[]){
        const model=byIndex.get(Number(member.index));
        if(model){
          member.dictionaryModel=model;
          member.dictionaryKeyTypeCode=Number(model.keyTypeCode);
          member.dictionaryValueTypeCode=Number(model.valueTypeCode);
          member.dictionaryTypeId=String(model.typeId);
          member.defaultValue=giaDictionarySummary(model);
        }
      }
    }catch{}
    return result;
  };
}

if(typeof StructureGiaDocument==='function'&&!globalThis.__miliastraGiaDictionaryModelLifecycle){
  globalThis.__miliastraGiaDictionaryModelLifecycle=true;
  const previousNormalize=StructureGiaDocument.prototype.normalize;
  StructureGiaDocument.prototype.normalize=function(){
    const result=previousNormalize.call(this);
    if(this.structureBuildMode){
      for(const item of this.items||[]){
        if(Number(item.typeCode)===27)updateGiaDictionaryItemMetadata(item);
      }
    }
    return result;
  };

  const previousCloneItem=StructureGiaDocument.prototype.cloneItem;
  StructureGiaDocument.prototype.cloneItem=function(template=null){
    const item=previousCloneItem.call(this,template);
    const source=template||this.items?.[this.items.length-1];
    if(this.structureBuildMode&&Number(item.typeCode)===27){
      item.dictionaryModel=source?.dictionaryModel
        ?cloneGiaDictionaryModel(source.dictionaryModel,true)
        :newGiaDictionaryModel();
      updateGiaDictionaryItemMetadata(item);
    }
    return item;
  };

  const previousBuildFile=StructureGiaDocument.prototype.buildFile;
  StructureGiaDocument.prototype.buildFile=function(){
    if(this.structureBuildMode){
      for(const item of this.items||[]){
        if(Number(item.typeCode)===27){
          const model=ensureGiaDictionaryModel(item);
          validateGiaDictionaryModel(model,`Dictionary field "${item.name}"`);
        }
      }
    }
    return previousBuildFile.call(this);
  };
}

if(typeof patchStructureFieldTemplate==='function'&&!globalThis.__miliastraGiaDictionaryFieldSerializer){
  globalThis.__miliastraGiaDictionaryFieldSerializer=true;
  const previousPatchStructureFieldTemplate=patchStructureFieldTemplate;
  patchStructureFieldTemplate=function(typeCode,fieldName,fieldIndex,listValues=[]){
    let message=previousPatchStructureFieldTemplate(typeCode,fieldName,fieldIndex,listValues);
    if(Number(typeCode)!==27)return message;
    const item=currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode
      ?currentDocument.items?.[Number(fieldIndex)-1]
      :null;
    if(!item)return message;
    return patchGiaDictionaryFieldMessage(message,item);
  };
}

if(typeof patchStructurePortTemplate==='function'&&!globalThis.__miliastraGiaDictionaryPortSerializer){
  globalThis.__miliastraGiaDictionaryPortSerializer=true;
  const previousPatchStructurePortTemplate=patchStructurePortTemplate;
  patchStructurePortTemplate=function(templateKind,typeCode,fieldName,portIndex,portId){
    let message=previousPatchStructurePortTemplate(templateKind,typeCode,fieldName,portIndex,portId);
    if(Number(typeCode)!==27)return message;
    const item=currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode
      ?currentDocument.items?.find(candidate=>Number(candidate.typeCode)===27&&candidate.name===fieldName)
      :null;
    if(!item)return message;
    return patchGiaDictionaryPortMessage(message,ensureGiaDictionaryModel(item));
  };
}

function ensureGiaDictionaryPanel(){
  const inspector=document.getElementById('structureInspector');
  if(!inspector)return null;
  let panel=document.getElementById('structureGiaDictionaryPanel');
  if(panel)return panel;
  panel=document.createElement('div');
  panel.id='structureGiaDictionaryPanel';
  panel.className='hidden';
  const help=document.getElementById('structureGiaHelp');
  if(help?.parentNode)help.parentNode.insertBefore(panel,help);
  else inspector.appendChild(panel);
  return panel;
}

function makeGiaDictionarySelect(typeCodes,value){
  const select=document.createElement('select');
  for(const typeCode of typeCodes){
    const option=document.createElement('option');
    option.value=String(typeCode);
    option.textContent=giaDictionaryFriendlyType(typeCode);
    select.appendChild(option);
  }
  select.value=String(value);
  return select;
}

function makeGiaDictionaryScalarEditor(typeCode,value,onCommit,options={}){
  const type=Number(typeCode);
  if(type===4){
    const select=document.createElement('select');
    [['false','False'],['true','True']].forEach(([optionValue,label])=>{
      const option=document.createElement('option');
      option.value=optionValue;option.textContent=label;select.appendChild(option);
    });
    select.value=value?'true':'false';
    select.addEventListener('change',event=>{
      event.stopPropagation();
      onCommit(select.value==='true');
    });
    return select;
  }
  if(type===12){
    const grid=document.createElement('div');
    grid.className='structure-vector-grid';
    const vector=normalizeGiaDictionaryScalar(12,value);
    ['x','y','z'].forEach(axis=>{
      const input=document.createElement('input');
      input.type='number';input.step='any';input.value=String(vector[axis]);input.title=axis.toUpperCase();
      input.addEventListener('change',event=>{
        event.stopPropagation();
        const next={...vector,[axis]:Number(input.value)};
        try{onCommit(normalizeGiaDictionaryScalar(12,next));}catch(error){alert(error.message||String(error));renderGia();}
      });
      grid.appendChild(input);
    });
    return grid;
  }
  const input=document.createElement('input');
  input.type='text';
  if(type===3||GIA_DICT_ID_TYPES.has(type)||GIA_DICT_REFERENCE_TYPES.has(type))input.inputMode='numeric';
  else if(type===5)input.inputMode='decimal';
  input.value=String(value??defaultGiaDictionaryValue(type));
  input.addEventListener('change',event=>{
    event.stopPropagation();
    try{
      onCommit(normalizeGiaDictionaryScalar(type,input.value));
    }catch(error){
      alert(error.message||String(error));
      renderGia();
    }
  });
  if(options.isKey)input.placeholder=type===6?'Key':'1';
  return input;
}

function renderGiaDictionaryListEditor(typeCode,values,onCommit){
  const host=document.createElement('div');
  host.className='nested';
  const list=document.createElement('div');
  list.className='structure-list-editor';
  const type=Number(typeCode);
  const elementType=Number(STRUCTURE_GIA_TYPES.get(type)?.elementTypeCode);
  const normalized=Array.isArray(values)?values:[];

  if(!normalized.length){
    const empty=document.createElement('div');
    empty.className='structure-list-empty';
    empty.textContent='Empty list. Click + Add Item.';
    list.appendChild(empty);
  }

  normalized.forEach((value,index)=>{
    const row=document.createElement('div');row.className='structure-list-row';
    const valueHost=document.createElement('div');valueHost.className='structure-list-value';
    valueHost.appendChild(makeGiaDictionaryScalarEditor(elementType,value,next=>{
      const copy=deepCloneData(normalized);copy[index]=next;onCommit(copy);
    }));
    const actions=document.createElement('div');actions.className='structure-list-actions';
    const up=document.createElement('button');up.className='small';up.textContent='↑';up.disabled=index===0;
    const down=document.createElement('button');down.className='small';down.textContent='↓';down.disabled=index===normalized.length-1;
    const duplicate=document.createElement('button');duplicate.className='small';duplicate.textContent='⧉';
    const remove=document.createElement('button');remove.className='small danger';remove.textContent='×';
    up.addEventListener('click',event=>{event.stopPropagation();const copy=deepCloneData(normalized);[copy[index-1],copy[index]]=[copy[index],copy[index-1]];onCommit(copy);});
    down.addEventListener('click',event=>{event.stopPropagation();const copy=deepCloneData(normalized);[copy[index],copy[index+1]]=[copy[index+1],copy[index]];onCommit(copy);});
    duplicate.addEventListener('click',event=>{event.stopPropagation();const copy=deepCloneData(normalized);copy.splice(index+1,0,deepCloneData(copy[index]));onCommit(copy);});
    remove.addEventListener('click',event=>{event.stopPropagation();const copy=deepCloneData(normalized);copy.splice(index,1);onCommit(copy);});
    actions.append(up,down,duplicate,remove);row.append(valueHost,actions);list.appendChild(row);
  });

  const actions=document.createElement('div');actions.className='add-row';
  const add=document.createElement('button');add.className='small';add.textContent='+ Add Item';
  add.addEventListener('click',event=>{
    event.stopPropagation();
    const copy=deepCloneData(normalized);copy.push(defaultGiaDictionaryValue(elementType));onCommit(copy);
  });
  actions.appendChild(add);host.append(list,actions);return host;
}

function renderGiaDictionaryValueEditor(typeCode,value,onCommit,context={}){
  const type=Number(typeCode);
  if(GIA_DICT_SIMPLE_TYPES.has(type))return makeGiaDictionaryScalarEditor(type,value,onCommit,context);
  if(GIA_DICT_LIST_TYPES.has(type))return renderGiaDictionaryListEditor(type,value,onCommit);
  if(type===27){
    const nested=value&&typeof value==='object'?value:newGiaDictionaryModel();
    return renderGiaDictionaryEditor(nested,{nested:true,depth:(context.depth||0)+1,onChange:onCommit});
  }
  const note=document.createElement('div');note.className='help';note.textContent='This value requires an external Structure definition and is not constructible in Build New.';return note;
}

function setGiaDictionaryMapping(model,keyTypeCode,valueTypeCode){
  model.keyTypeCode=Number(keyTypeCode);
  model.valueTypeCode=Number(valueTypeCode);
  const builtin=model.keyTypeCode===6&&model.valueTypeCode===6;
  model.typeId=builtin?GIA_DICT_BUILTIN_STRING_STRING_ID:generateGiaDictionaryTypeId();
  model.customType=!builtin;
  model.entries=[];
}

function renderGiaDictionaryEditor(model,options={}){
  const card=document.createElement('div');
  card.className=options.nested?'nested':'meta';
  const header=document.createElement('div');header.className='json-root-header';
  const keySelect=makeGiaDictionarySelect(GIA_DICT_KEY_TYPES,model.keyTypeCode);
  const valueSelect=makeGiaDictionarySelect(GIA_DICT_VALUE_TYPES,model.valueTypeCode);

  const changeMapping=()=>{
    const keyType=Number(keySelect.value);const valueType=Number(valueSelect.value);
    if(keyType===Number(model.keyTypeCode)&&valueType===Number(model.valueTypeCode))return;
    if(model.entries?.length&&!confirm('Changing Dictionary key/value types will clear existing entries. Continue?')){
      keySelect.value=String(model.keyTypeCode);valueSelect.value=String(model.valueTypeCode);return;
    }
    pushHistory('Change GIA Dictionary mapping');
    setGiaDictionaryMapping(model,keyType,valueType);
    if(typeof options.onChange==='function')options.onChange(model);
    renderGia();
  };
  keySelect.addEventListener('change',event=>{event.stopPropagation();changeMapping();});
  valueSelect.addEventListener('change',event=>{event.stopPropagation();changeMapping();});
  header.appendChild(makeField('Key Type',keySelect));
  header.appendChild(makeField('Value Type',valueSelect));
  const typeId=document.createElement('input');typeId.disabled=true;typeId.value=String(model.typeId);
  header.appendChild(makeField('Dictionary Type ID',typeId));
  card.appendChild(header);

  const entriesHost=document.createElement('div');
  (model.entries||[]).forEach((entry,index)=>{
    const row=document.createElement('div');row.className='json-entry';
    const keyHost=document.createElement('div');keyHost.className='json-entry-key';
    const keyLabel=document.createElement('div');keyLabel.className='mini-label';keyLabel.textContent=`Key · ${giaDictionaryFriendlyType(model.keyTypeCode)}`;keyHost.appendChild(keyLabel);
    keyHost.appendChild(makeGiaDictionaryScalarEditor(model.keyTypeCode,entry.key,next=>{
      try{
        if(dictionaryHasKey(model,next,index))throw new Error('Dictionary keys must be unique.');
        pushHistory('Edit GIA Dictionary key');entry.key=next;if(typeof options.onChange==='function')options.onChange(model);renderGia();
      }catch(error){alert(error.message||String(error));renderGia();}
    },{isKey:true}));

    const valueHost=document.createElement('div');valueHost.className='json-entry-value';
    const valueLabel=document.createElement('div');valueLabel.className='mini-label';valueLabel.textContent=`Value · ${giaDictionaryFriendlyType(model.valueTypeCode)}`;valueHost.appendChild(valueLabel);
    valueHost.appendChild(renderGiaDictionaryValueEditor(model.valueTypeCode,entry.value,next=>{
      pushHistory('Edit GIA Dictionary value');entry.value=next;if(typeof options.onChange==='function')options.onChange(model);renderGia();
    },{depth:options.depth||0}));

    const actions=document.createElement('div');actions.className='quick-actions';
    const duplicate=document.createElement('button');duplicate.className='small';duplicate.textContent='Duplicate';
    const up=document.createElement('button');up.className='small';up.textContent='↑';up.disabled=index===0;
    const down=document.createElement('button');down.className='small';down.textContent='↓';down.disabled=index===model.entries.length-1;
    const remove=document.createElement('button');remove.className='small danger';remove.textContent='Remove';
    duplicate.addEventListener('click',event=>{
      event.stopPropagation();pushHistory('Duplicate GIA Dictionary entry');
      const copy=deepCloneData(entry);copy.internalId=generateGiaDictionaryObjectId();copy.key=nextGiaDictionaryKey(model);model.entries.splice(index+1,0,copy);if(typeof options.onChange==='function')options.onChange(model);renderGia();
    });
    up.addEventListener('click',event=>{event.stopPropagation();pushHistory('Move GIA Dictionary entry');[model.entries[index-1],model.entries[index]]=[model.entries[index],model.entries[index-1]];if(typeof options.onChange==='function')options.onChange(model);renderGia();});
    down.addEventListener('click',event=>{event.stopPropagation();pushHistory('Move GIA Dictionary entry');[model.entries[index],model.entries[index+1]]=[model.entries[index+1],model.entries[index]];if(typeof options.onChange==='function')options.onChange(model);renderGia();});
    remove.addEventListener('click',event=>{event.stopPropagation();pushHistory('Delete GIA Dictionary entry');model.entries.splice(index,1);if(typeof options.onChange==='function')options.onChange(model);renderGia();});
    actions.append(duplicate,up,down,remove);row.append(keyHost,valueHost,actions);entriesHost.appendChild(row);
  });
  card.appendChild(entriesHost);

  const actions=document.createElement('div');actions.className='add-row';
  const add=document.createElement('button');add.className='small';add.textContent='Add Entry';
  add.addEventListener('click',event=>{
    event.stopPropagation();pushHistory('Add GIA Dictionary entry');
    model.entries.push({key:nextGiaDictionaryKey(model),value:defaultGiaDictionaryValue(model.valueTypeCode),internalId:generateGiaDictionaryObjectId()});
    if(typeof options.onChange==='function')options.onChange(model);renderGia();
  });
  actions.appendChild(add);card.appendChild(actions);
  return card;
}

function giaDictionaryMetadataRow(label,value){
  const row=document.createElement('div');
  row.className='meta-row';
  const name=document.createElement('span');
  name.textContent=label;
  const output=document.createElement('code');
  output.textContent=String(value);
  row.append(name,output);
  return row;
}

function renderImportedGiaDictionarySummary(model){
  const host=document.createElement('div');host.className='meta';
  host.appendChild(giaDictionaryMetadataRow('Dictionary Key Type',giaDictionaryFriendlyType(model.keyTypeCode)));
  host.appendChild(giaDictionaryMetadataRow('Dictionary Value Type',giaDictionaryFriendlyType(model.valueTypeCode)));
  host.appendChild(giaDictionaryMetadataRow('Dictionary Type ID',model.typeId));
  host.appendChild(giaDictionaryMetadataRow('Default Entries',(model.entries||[]).length));
  if(model.entries?.length){
    const list=document.createElement('div');list.className='structure-list-editor';
    model.entries.forEach(entry=>{
      const row=document.createElement('div');row.className='structure-list-row';
      const value=document.createElement('div');value.className='structure-list-value';
      const keyText=typeof entry.key==='object'?JSON.stringify(entry.key):String(entry.key);
      let valueText;
      if(entry.value?.unsupportedStructure)valueText=`${giaDictionaryFriendlyType(model.valueTypeCode)} value (preserved)`;
      else if(Number(model.valueTypeCode)===27)valueText=giaDictionarySummary(entry.value);
      else valueText=typeof entry.value==='object'?JSON.stringify(entry.value):String(entry.value);
      value.textContent=`${keyText} → ${valueText}`;row.appendChild(value);list.appendChild(row);
    });
    host.appendChild(list);
  }
  return host;
}

function renderGiaDictionaryPanel(){
  const panel=ensureGiaDictionaryPanel();
  if(!panel)return;
  panel.innerHTML='';
  if(currentDocument?.kind!=='gia-structure'||selectedIndex===null){panel.classList.add('hidden');return;}
  const item=currentDocument.items?.[selectedIndex];
  if(!item||Number(item.typeCode)!==27){panel.classList.add('hidden');return;}

  if(currentDocument.structureBuildMode&&elements.structureFieldType){
    const dictionaryOption=[...elements.structureFieldType.options].find(option=>Number(option.value)===27);
    if(dictionaryOption){
      dictionaryOption.textContent='Dictionary';
      dictionaryOption.title='Configurable GIA Dictionary';
    }
  }

  elements.structureScalarDefaultField?.classList.add('hidden');
  elements.structureListDefaultPanel?.classList.add('hidden');
  const model=currentDocument.structureBuildMode?ensureGiaDictionaryModel(item):(item.dictionaryModel||null);
  if(!model){panel.classList.add('hidden');return;}

  if(currentDocument.structureBuildMode){
    panel.appendChild(renderGiaDictionaryEditor(model,{onChange:()=>updateGiaDictionaryItemMetadata(item)}));
    const note=document.createElement('div');note.className='help';
    note.textContent='Dictionary Build New supports every valid key type and every constructible value type, including Lists and nested Dictionaries. Structure and Structure List values are intentionally excluded because their fields come from an external custom Structure definition.';
    panel.appendChild(note);
    if(elements.structureGiaHelp){
      elements.structureGiaHelp.textContent='Build mode: configure the Dictionary key type, value type, and default entries here. Structure and Structure List values stay unavailable because their custom field shapes are external to this Structure.';
    }
    updateGiaDictionaryItemMetadata(item);
  }else{
    panel.appendChild(renderImportedGiaDictionarySummary(model));
  }
  panel.classList.remove('hidden');

  const legacy=document.getElementById('structureReferenceMetadataPanel');
  if(legacy&&currentDocument.structureBuildMode)legacy.classList.add('hidden');
}

if(typeof renderGia==='function'&&!globalThis.__miliastraGiaDictionaryRenderer){
  globalThis.__miliastraGiaDictionaryRenderer=true;
  const previousRenderGia=renderGia;
  renderGia=function(...args){
    const result=previousRenderGia(...args);
    renderGiaDictionaryPanel();
    return result;
  };
}

if(typeof copyGiaItem==='function'&&!globalThis.__miliastraGiaDictionaryClipboard){
  globalThis.__miliastraGiaDictionaryClipboard=true;
  const previousCopyGiaItem=copyGiaItem;
  copyGiaItem=async function(){
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode&&selectedIndex!==null){
      const source=currentDocument.items?.[selectedIndex];
      if(Number(source?.typeCode)===27){
        await copyEditorFragment('gia-structure-field',{
          name:source.name,
          typeCode:27,
          listValues:[],
          dictionaryModel:deepCloneData(ensureGiaDictionaryModel(source))
        },'Structure Dictionary field');
        return;
      }
    }
    return previousCopyGiaItem();
  };

  const previousPasteGiaItem=pasteGiaItem;
  pasteGiaItem=async function(){
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode){
      const fragment=await readEditorFragment();
      if(fragment?.kind==='gia-structure-field'&&Number(fragment.data?.typeCode)===27&&fragment.data?.dictionaryModel){
        if(selectedIndex!==null&&!applyGiaFields(false))return;
        pushHistory('Paste GIA Dictionary field');
        const nameBase=variableCopyName(fragment.data.name||'Dictionary');
        const used=new Set((currentDocument.items||[]).map(item=>String(item.name||'').trim()));
        let name=nameBase;let suffix=2;
        while(used.has(name)){
          const tail=` ${suffix++}`;name=nameBase.slice(0,Math.max(1,VARIABLE_NAME_MAX_LENGTH-tail.length))+tail;
        }
        const item={
          index:currentDocument.items.length+1,
          name,
          originalName:name,
          typeCode:27,
          typeName:structureGiaTypeName(27),
          listValues:[],
          dictionaryModel:cloneGiaDictionaryModel(fragment.data.dictionaryModel,true),
          defaultValue:''
        };
        updateGiaDictionaryItemMetadata(item);
        const insertAt=selectedIndex===null?currentDocument.items.length:selectedIndex+1;
        currentDocument.items.splice(insertAt,0,item);currentDocument.normalize();selectedIndex=insertAt;renderGia();updateMeta();setStatus('Pasted Dictionary field.','success');return;
      }
      if(fragment)editorClipboard=fragment;
    }
    return previousPasteGiaItem();
  };

  const previousDuplicateGiaItem=duplicateGiaItem;
  duplicateGiaItem=function(){
    if(currentDocument?.kind==='gia-structure'&&currentDocument.structureBuildMode&&selectedIndex!==null){
      const source=currentDocument.items?.[selectedIndex];
      if(Number(source?.typeCode)===27){
        if(!applyGiaFields(false))return;
        pushHistory('Duplicate GIA Dictionary field');
        const used=new Set((currentDocument.items||[]).map(item=>String(item.name||'').trim()));
        let name=variableCopyName(source.name);let suffix=2;
        while(used.has(name)){
          const tail=` ${suffix++}`;name=variableCopyName(source.name).slice(0,Math.max(1,VARIABLE_NAME_MAX_LENGTH-tail.length))+tail;
        }
        const copy={...deepCloneData(source),name,originalName:name,index:source.index+1,dictionaryModel:cloneGiaDictionaryModel(ensureGiaDictionaryModel(source),true)};
        updateGiaDictionaryItemMetadata(copy);
        currentDocument.items.splice(selectedIndex+1,0,copy);currentDocument.normalize();selectedIndex+=1;renderGia();updateMeta();focusGiaPrimaryField(true);return;
      }
    }
    return previousDuplicateGiaItem();
  };
}

function updateGiaDictionaryBuildNotes(){
  const note=[...document.querySelectorAll('.build-note')].find(element=>
    element.textContent.includes('StructList is confirmed as GIA type code 26')
  );
  const muted=note?.querySelector('.muted');
  if(muted){
    muted.textContent='Structure and Structure List remain excluded from Build New because they depend on an external custom Structure definition. Dictionary fields support configurable key/value mappings and default entries for all other constructible types.';
  }
}

updateGiaDictionaryBuildNotes();
renderGiaDictionaryPanel();
})();
