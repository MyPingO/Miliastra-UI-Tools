(()=>{
'use strict';

const dictionaryKeyTypeOptions=[
  {value:'String',label:'String'},
  {value:'Int32',label:'Integer'},
  {value:'Guid',label:'GUID'},
  {value:'ConfigReference',label:'Configuration ID'},
  {value:'EntityReference',label:'Prefab ID'},
  {value:'Army',label:'Faction'},
  {value:'Entity',label:'Entity'}
];

const numericDictionaryKeyTypes=new Set(
  dictionaryKeyTypeOptions
    .map(option=>option.value)
    .filter(value=>value!=='String')
);

function replaceDictionaryKeyTypeOptions(select,currentValue){
  if(!(select instanceof HTMLSelectElement))return;
  const selectedValue=String(currentValue??select.value??'String');
  select.innerHTML='';
  dictionaryKeyTypeOptions.forEach(({value,label})=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=label;
    select.append(option);
  });
  select.value=dictionaryKeyTypeOptions.some(option=>option.value===selectedValue)
    ?selectedValue
    :'String';
}

function dictionaryKeyFieldSelect(root){
  return [...root.querySelectorAll('.field')]
    .find(field=>field.querySelector(':scope > label')?.textContent.trim()==='Key Type')
    ?.querySelector('select')||null;
}

function canonicalDictionaryKeyValue(dictionary,value){
  const text=String(value??'').trim();
  if(dictionary?.key_type==='String')return text;
  if(dictionary?.key_type==='Int32'){
    const numericValue=Number(text);
    return Number.isFinite(numericValue)?String(Math.trunc(numericValue)):text;
  }
  if(numericDictionaryKeyTypes.has(dictionary?.key_type)){
    try{return BigInt(text||'0').toString();}catch{return text;}
  }
  return text;
}

function nextNumericDictionaryKey(dictionary,usedKeys,startValue){
  let candidate;
  try{candidate=BigInt(String(startValue??'0').trim()||'0')+1n;}
  catch{candidate=0n;}
  while(usedKeys.has(candidate.toString()))candidate+=1n;
  return candidate.toString();
}

function normalizeNewDictionaryKeys(value,visited=new Set()){
  if(!value||typeof value!=='object'||visited.has(value))return;
  visited.add(value);

  if(value.type==='Dict'&&Array.isArray(value.value)){
    const dictionary=value;
    const usedKeys=new Set();
    dictionary.value.forEach((entry,index)=>{
      if(!entry?.key)return;
      const currentValue=entry.key.value;
      const canonicalValue=canonicalDictionaryKeyValue(dictionary,currentValue);
      if(!usedKeys.has(canonicalValue)){
        usedKeys.add(canonicalValue);
        return;
      }

      if(dictionary.key_type==='String'){
        const base=String(currentValue??'')||`Key ${index+1}`;
        let suffixNumber=2;
        let candidate=`${base} ${suffixNumber}`;
        while(usedKeys.has(candidate)){
          suffixNumber+=1;
          candidate=`${base} ${suffixNumber}`;
        }
        entry.key.value=candidate;
        usedKeys.add(candidate);
      }else{
        const candidate=nextNumericDictionaryKey(dictionary,usedKeys,currentValue);
        entry.key.value=candidate;
        usedKeys.add(canonicalDictionaryKeyValue(dictionary,candidate));
      }
    });
  }

  if(Array.isArray(value)){
    value.forEach(item=>normalizeNewDictionaryKeys(item,visited));
    return;
  }
  Object.values(value).forEach(item=>normalizeNewDictionaryKeys(item,visited));
}

function installDictionaryBuilderKeyTypes(){
  const button=document.getElementById('newDictButton');
  if(!button||button.dataset.fullDictionaryKeyTypes==='1')return;
  button.dataset.fullDictionaryKeyTypes='1';
  button.addEventListener('click',()=>{
    queueMicrotask(()=>{
      const modal=document.getElementById('builderModal');
      const select=modal?dictionaryKeyFieldSelect(modal):null;
      if(select)replaceDictionaryKeyTypeOptions(select,select.value);
    });
  });
}

function installDictionaryEditorKeyTypes(){
  if(typeof renderJson==='function'&&!globalThis.__miliastraFullDictionaryKeyRenderJson){
    globalThis.__miliastraFullDictionaryKeyRenderJson=true;
    const previousRenderJson=renderJson;
    renderJson=function(...args){
      if(currentDocument?.source==='new'&&currentDocument.object){
        normalizeNewDictionaryKeys(currentDocument.object);
      }
      return previousRenderJson(...args);
    };
  }

  if(typeof renderDictionary==='function'&&!globalThis.__miliastraFullDictionaryKeyEditor){
    globalThis.__miliastraFullDictionaryKeyEditor=true;
    const previousRenderDictionary=renderDictionary;
    renderDictionary=function(dictionary,nested=false){
      const card=previousRenderDictionary(dictionary,nested);
      const keySelect=dictionaryKeyFieldSelect(card);
      if(keySelect)replaceDictionaryKeyTypeOptions(keySelect,dictionary.key_type);

      if(currentDocument?.source!=='new')return card;
      const entriesHost=card.children[1];
      if(!entriesHost)return card;

      [...entriesHost.children].forEach((entryCard,index)=>{
        const control=entryCard.querySelector(':scope > .json-entry-key input, :scope > .json-entry-key textarea, :scope > .json-entry-key select');
        const entry=dictionary.value?.[index];
        if(!control||!entry?.key)return;
        control.dataset.fullKeyLastUnique=String(entry.key.value??'');

        const validateUniqueKey=()=>{
          const candidate=entry.key.value;
          const canonicalCandidate=canonicalDictionaryKeyValue(dictionary,candidate);
          const duplicate=dictionary.value.some((other,otherIndex)=>
            otherIndex!==index&&
            canonicalDictionaryKeyValue(dictionary,other?.key?.value)===canonicalCandidate
          );
          if(!duplicate){
            control.dataset.fullKeyLastUnique=String(candidate??'');
            return;
          }
          const previousValue=control.dataset.fullKeyLastUnique??'';
          entry.key.value=previousValue;
          control.value=previousValue;
          if(typeof setStatus==='function'){
            setStatus(`Dictionary key “${candidate}” is already in use.`,'error');
          }
        };
        control.addEventListener('input',validateUniqueKey);
        control.addEventListener('change',validateUniqueKey);
      });
      return card;
    };
  }
}

installDictionaryBuilderKeyTypes();
installDictionaryEditorKeyTypes();
})();
