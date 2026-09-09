import * as W from './game-wire.mjs';
import {GameDocument,uiLists,editUIRow,writeUIRows} from './game-document.mjs';
import {TYPES,LISTS,readValue,valueJSON,flattenValues} from './game-values.mjs';
import {parseList,toCSV,sequence} from './list-data.mjs';
import {demoFile} from './demo.mjs';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(label,action,cls='')=>{const b=el('button',cls,label);b.type='button';b.onclick=()=>guard(action);return b;};
const categories={all:'All objects',scene:'Scene',prefab:'Prefabs',ui:'UI controls',decoration:'Decorations',asset:'Assets'};
let doc=null,selected=null,category='scene',page=0,variableQuery='',variablePage=0,view='game',bulkAction=null,loading=0,isDemo=false,exportedSignature='',builderReady=null,controlId=0;
const size=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
function status(text,kind=''){ $('status').textContent=text;$('status').className=kind; }
function guard(action){try{const result=action();if(result?.catch)result.catch(e=>status(e.message,'error'));}catch(e){status(e.message,'error');}}
const byteIdentities=new WeakMap();let nextIdentity=0;
function signature(){return doc?JSON.stringify([...doc.changes].map(([k,v])=>{if(!byteIdentities.has(v.bytes))byteIdentities.set(v.bytes,++nextIdentity);return[k,byteIdentities.get(v.bytes)];})):'';}
function invalidInput(){const input=document.querySelector('[aria-invalid="true"]');if(input){input.focus();throw new Error('Fix the highlighted value before continuing.');}}
function refreshActions(){
  $('undo').disabled=!doc?.history.length;$('redo').disabled=!doc?.future.length;
  $('export-file').disabled=!doc||isDemo;
  $('change-count').textContent=doc?.changes.size?`${doc.changes.size} modified object${doc.changes.size===1?'':'s'}`:'No changes';
}
function download(name,data,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([data],{type})),link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function openFile(file){
  if(!file)return;
  if(file.name.toLowerCase().endsWith('.json')){await builderCommand('open',file);return;}
  if(!/\.(gil|gia)$/i.test(file.name))throw new Error('Choose a .gil, .gia, or variable .json file.');
  if(file.size>256*1024*1024)throw new Error('Files larger than 256 MB are not supported.');
  invalidInput();
  if(doc?.changes.size && !confirm('Open another file? Export first if you want to keep this workspace’s changes.'))return;
  const token=++loading;status(`Reading ${file.name}…`);$('open-file').disabled=true;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    await new Promise(resolve=>setTimeout(resolve,20));
    const next=new GameDocument(file.name,bytes);if(token!==loading)return;
    doc=next;isDemo=false;exportedSignature='';activateDocument();
  }finally{if(token===loading)$('open-file').disabled=false;}
}
function activateDocument(){
  category=doc.records.some(r=>r.kind==='scene')?'scene':'all';page=0;selected=null;variableQuery='';variablePage=0;
  $('object-search').value='';$('only-lists').checked=false;
  $('welcome').hidden=true;$('workspace').hidden=false;$('file-name').textContent=doc.name;
  document.querySelector('.file-icon').textContent=doc.container.type===2?'GIL':'GIA';
  $('file-meta').textContent=`${size(doc.container.original.length)} · ${doc.records.length.toLocaleString()} objects · ${doc.records.reduce((n,r)=>n+r.variables.length,0)} variables${isDemo?' · Synthetic example; game export disabled':''}`;
  const first=doc.records.find(r=>r.kind===category&&r.listCount)||doc.records.find(r=>category==='all'||r.kind===category);
  document.getElementById('edit-component')?.remove();
  if(doc.container.type===3){const b=btn('Edit in UI builder',()=>builderCommand('open',new File([doc.export()],doc.name,{type:'application/octet-stream'})));b.id='edit-component';$('open-file').before(b);}
  selected=first?.key||null;renderCategories();renderObjects();renderSelected();renderSections();refreshActions();showView('game');
  status(isDemo?'Example loaded. Try editing a list or generating more rows.':`Opened ${doc.levelName}. ${doc.warnings.length?`${doc.warnings.length} indexing notes in Format guide.`:'Original bytes preserved.'}`,'success');
}
function renderCategories(){
  const host=$('categories');host.replaceChildren();
  for(const [key,label] of Object.entries(categories)){
    const count=key==='all'?doc.records.length:doc.records.filter(r=>r.kind===key).length;if(!count&&key!=='all')continue;
    const b=btn(label,()=>{invalidInput();category=key;page=0;renderCategories();renderObjects();},`category${category===key?' active':''}`);b.setAttribute('aria-pressed',String(category===key));b.append(el('span','',count.toLocaleString()));host.append(b);
  }
}
function renderObjects(){
  if(!doc)return;
  const q=$('object-search').value.trim().toLowerCase(),onlyLists=$('only-lists').checked;
  const records=doc.records.filter(r=>(category==='all'||r.kind===category)&&(!onlyLists||r.listCount>0)&&(!q||`${r.name} ${r.id} ${r.templateId||''} ${r.variables.map(v=>v.name).join(' ')}`.toLowerCase().includes(q)));
  const max=Math.max(1,Math.ceil(records.length/60));page=Math.min(page,max-1);
  $('result-count').textContent=`${records.length.toLocaleString()} matching objects`;$('object-page').textContent=`${page+1} / ${max}`;
  $('objects-prev').disabled=page===0;$('objects-next').disabled=page===max-1;
  const host=$('object-list');host.replaceChildren();
  for(const r of records.slice(page*60,(page+1)*60)){
    const b=btn('',()=>{invalidInput();selected=r.key;variableQuery='';variablePage=0;renderObjects();renderSelected();},`object-button${selected===r.key?' active':''}`);b.setAttribute('aria-pressed',String(selected===r.key));
    b.append(el('span','object-glyph',r.kind==='ui'?'▤':r.kind==='prefab'?'◇':'▫'));
    const label=el('span');label.append(el('strong','',r.name),el('small','',`${r.id}${r.listCount?` · ${r.listCount} list${r.listCount===1?'':'s'}`:''}`));b.append(label);
    if(doc.changes.has(r.key))b.append(el('span','object-dot','●'));host.append(b);
  }
  if(!records.length)host.append(el('p','blank-state','No matching objects. Try another search or turn off the list filter.'));
}
function active(){return doc?.records.find(r=>r.key===selected);}
function changed(label){status(label,'success');refreshActions();renderObjects();}
function renderSelected(){
  const host=$('object-editor'),record=active();host.replaceChildren();
  if(!record){host.append(el('div','blank-state','Select an object to inspect its data.'));return;}
  const head=el('div','object-heading');head.append(el('span','eyebrow',(categories[record.kind]||'Asset').toUpperCase()),el('h1','',record.name));
  const meta=el('div','metadata');meta.append(el('span','',`ID ${record.id}`));
  if(record.templateId)meta.append(el('span','',`Template ${record.templateId}`));
  if(record.parentId&&record.parentId!=='0'){
    const parent=doc.records.find(r=>r.id===record.parentId&&r.kind==='ui');
    if(parent)meta.append(btn(`Parent: ${parent.name}`,()=>{invalidInput();selected=parent.key;renderSelected();renderObjects();},'quiet'));
  }
  meta.append(el('span','',`${size(doc.bytes(record).length)} · ${doc.changes.has(record.key)?'Modified':'Original'}`));head.append(meta);host.append(head);
  if(record.kind==='ui'){const body=el('div','variables');body.style.paddingTop='20px';host.append(body);renderUI(record,body);return;}
  const controls=el('div','object-tools'),filter=el('input');filter.type='search';filter.placeholder='Filter variable names or nested fields…';filter.setAttribute('aria-label','Filter variables');filter.value=variableQuery;
  filter.oninput=()=>{variableQuery=filter.value;variablePage=0;renderVariables(record,$('variable-cards'));};controls.append(filter);host.append(controls);
  const body=el('div','variables');body.id='variable-cards';host.append(body);renderVariables(record,body);
}
function card(name,type){const box=el('section','variable-card'),head=el('div','variable-head'),body=el('div','variable-body');head.append(el('h2','',name),el('span','pill',type));box.append(head,body);return{box,body};}
function renderVariables(record,host){
  host.replaceChildren();const variables=doc.variables(record),q=variableQuery.toLowerCase();
  const shown=variables.filter(v=>!q||v.name.toLowerCase().includes(q)||(v.model&&flattenValues(v.model).some(n=>n.label.toLowerCase().includes(q))));
  if(record.warning)host.append(el('p','read-note',record.warning));
  if(!shown.length){host.append(el('div','blank-state',variables.length?'No matching variables.':'No supported custom-variable block is stored on this object. Other data remains preserved.'));return;}
  const pages=Math.ceil(shown.length/10);variablePage=Math.min(variablePage,pages-1);
  const pager=el('div','list-toolbar');const previous=btn('← Previous',()=>{invalidInput();variablePage--;renderVariables(record,host);}),next=btn('Next →',()=>{invalidInput();variablePage++;renderVariables(record,host);});previous.disabled=variablePage===0;next.disabled=variablePage===pages-1;pager.append(el('span','list-count',`${shown.length} variables · Page ${variablePage+1} of ${pages}`),previous,next);host.append(pager);
  for(const variable of shown.slice(variablePage*10,(variablePage+1)*10)){
    const c=card(variable.name,TYPES[variable.type]||`Type ${variable.type}`);host.append(c.box);
    if(!variable.model){c.body.append(el('p','read-note',variable.warning));continue;}
    renderValue(record,variable,variable.model,[],c.body,variable.name);
  }
}
function editorControl(type,value,label,onChange,disabled=false){
  let input;
  if(type===4){input=el('select');for(const v of [true,false]){const o=el('option','',String(v));o.value=String(v);input.append(o);}input.value=String(value);}
  else {input=el('input');input.type=type===6?'text':'number';if(type!==6)input.step=type===3?'1':'any';input.value=String(value);}
  input.setAttribute('aria-label',label);input.disabled=disabled;input.id=`value-${++controlId}`;
  input.onchange=()=>{
    try {input.removeAttribute('aria-invalid');input.setCustomValidity('');const v=type===6?input.value:type===4?input.value==='true':input.value.trim()===''?NaN:Number(input.value);onChange(v);}
    catch(e){input.setAttribute('aria-invalid','true');input.setCustomValidity(e.message);status(`${label}: ${e.message}`,'error');}
  };
  return input;
}
function renderValue(record,variable,model,path,host,label){
  const editable=doc.container.version===1;
  if(model.children){
    if(model.type===26)host.append(el('p','read-note',`${model.children.length} existing rows. Edit their values below. Adding rows is disabled because these structures contain project-specific metadata.`));
    let childPage=0;const childHost=el('div');
    const draw=()=>{childHost.replaceChildren();const count=Math.ceil(model.children.length/20);
      if(count>1){const nav=el('div','list-toolbar');const back=btn('←',()=>{invalidInput();childPage--;draw();}),next=btn('→',()=>{invalidInput();childPage++;draw();});back.disabled=childPage===0;next.disabled=childPage===count-1;nav.append(back,el('span','',`Rows ${childPage*20+1}–${Math.min((childPage+1)*20,model.children.length)}`),next);childHost.append(nav);}
      model.children.slice(childPage*20,(childPage+1)*20).forEach((child,local)=>{const i=childPage*20+local;const name=child.name||`Item ${i+1}`;if(child.children)childHost.append(el('h3','nested-heading',name));renderValue(record,variable,child,[...path,[model.type+10,0],[1,i]],childHost,`${label} / ${name}`);});
      if(!model.children.length)childHost.append(el('p','readonly',`Empty ${TYPES[model.type].toLowerCase()} · Structure ${model.structId}. An existing value shape is required to edit.`));
    };host.append(childHost);draw();return;
  }
  if(Array.isArray(model.value)&&model.editable){renderList(record,variable,model,path,host,label);return;}
  if([3,4,5,6].includes(model.type)&&model.editable){
    const row=el('div','scalar-row'),caption=el('label','',label),input=editorControl(model.type,model.value,label,value=>{doc.editValue(record,variable.path,path,value,`Edited ${label}`);model.value=value;changed(`Updated ${label}.`);},!editable);
    caption.htmlFor=input.id;caption.append(el('small','',TYPES[model.type]));row.append(caption,input);host.append(row);return;
  }
  const detail=el('details'),summary=el('summary','',`${label} · ${TYPES[model.type]||'Unknown type'} · Read-only`);detail.append(summary);
  if(model.type===27)detail.append(el('p','read-note','This dictionary stores both entry structures and key/value mirrors. Its data is preserved; editing is not enabled.'));
  detail.append(el('pre','readonly',JSON.stringify(valueJSON(model),null,2)));host.append(detail);
}
function renderList(record,variable,model,path,host,label){
  const box=el('div');host.append(box);let values=[...model.value],listPage=0;
  const save=next=>{invalidInput();doc.editValue(record,variable.path,path,next,`Edited ${label}`);values=next;model.value=next;changed(`Updated ${label}: ${next.length} items.`);};
  const draw=()=>{
    box.replaceChildren();const toolbar=el('div','list-toolbar');
    const defaultValue=model.element===6?'':model.element===4?false:0;
    toolbar.append(btn('+ Add item',()=>{save([...values,defaultValue]);listPage=Math.floor((values.length-1)/100);draw();}),btn('Paste / import',()=>openBulk(label,values,model.element,next=>{save(next);listPage=0;draw();})),btn('JSON ↓',()=>download(`${variable.name}.json`,JSON.stringify(values,null,2),'application/json')),btn('CSV ↓',()=>download(`${variable.name}.csv`,toCSV(values),'text/csv')),el('span','list-count',`${values.length.toLocaleString()} items`));box.append(toolbar);
    const gen=el('details');gen.append(el('summary','','Generate rows'));const controls=generator(model.element,values.length,generated=>{save([...values,...generated]);draw();});gen.append(controls);box.append(gen);
    if(!values.length){box.append(el('div','empty-list','This list is empty. Add an item, paste data, or generate rows.'));return;}
    listPage=Math.min(listPage,Math.floor((values.length-1)/100));
    if(values.length>100){const nav=el('div','list-toolbar'),prev=btn('←',()=>{invalidInput();listPage--;draw();}),next=btn('→',()=>{invalidInput();listPage++;draw();});prev.disabled=listPage===0;next.disabled=(listPage+1)*100>=values.length;nav.append(prev,el('span','',`${listPage*100+1}–${Math.min((listPage+1)*100,values.length)} of ${values.length}`),next);box.append(nav);}
    const wrap=el('div','list-table-wrap'),table=el('table','list-table');const head=el('thead'),tr=el('tr');['#',TYPES[model.element],'Actions'].forEach(t=>tr.append(el('th','',t)));head.append(tr);table.append(head);const body=el('tbody');
    values.slice(listPage*100,(listPage+1)*100).forEach((value,local)=>{const i=listPage*100+local,row=el('tr'),cell=el('td'),input=editorControl(model.element,value,`${label}, item ${i+1}`,v=>{const next=[...values];next[i]=v;doc.editValue(record,variable.path,path,next,`Edited ${label}`);values=next;model.value=next;changed(`Updated ${label}, item ${i+1}.`);},doc.container.version!==1);cell.append(input);row.append(el('td','',String(i+1)),cell,actions(i,values.length,(action)=>{const next=[...values];if(action==='copy')next.splice(i+1,0,next[i]);if(action==='delete')next.splice(i,1);if(action==='up')[next[i-1],next[i]]=[next[i],next[i-1]];if(action==='down')[next[i],next[i+1]]=[next[i+1],next[i]];save(next);draw();}));body.append(row);});table.append(body);wrap.append(table);box.append(wrap);
  };draw();
}
function actions(i,count,run,min=0){const cell=el('td','row-actions');for(const [action,label,title] of [['up','↑','Move up'],['down','↓','Move down'],['copy','⧉','Duplicate'],['delete','×','Remove']]){const b=btn(label,()=>run(action));b.title=title;b.setAttribute('aria-label',`${title} row ${i+1}`);b.disabled=doc.container.version!==1||(action==='up'&&i===0)||(action==='down'&&i===count-1)||(action==='delete'&&count<=min);cell.append(b);}return cell;}
function generator(element,currentCount,apply){
  const controls=el('div','generator');
  const input=(label,value,type='number')=>{const l=el('label','',label),i=el('input');i.type=type;i.value=value;if(type==='number')i.step='any';l.append(i);controls.append(l);return i;};
  const count=input('Count','10'),start=input('Start at','1'),step=input('Step','1'),pattern=element===6?input('Label pattern','Item {n}','text'):null;
  controls.append(btn('Append rows',()=>{const n=Number(count.value);if(n+currentCount>10000)throw new Error('The resulting list would exceed 10,000 rows.');apply(sequence({count:n,start:Number(start.value),step:Number(step.value),pattern:pattern?.value,element}));}));
  controls.append(el('p','',element===6?'Use {n} for the sequence number. Existing values stay in place.':element===4?'Generated Boolean rows start as false.':'Generate a numeric sequence and append it to the current list.'));return controls;
}
function openBulk(label,values,element,apply){
  invalidInput();$('bulk-title').textContent=label;$('bulk-help').textContent='Replace this list with pasted data. Undo restores the previous values.';$('bulk-format').value='json';$('bulk-text').value=JSON.stringify(values,null,2);$('bulk-error').textContent='';
  bulkAction=()=>{const next=parseList($('bulk-text').value,$('bulk-format').value,element);apply(next);$('bulk-dialog').close();};$('bulk-dialog').showModal();
}
function renderUI(record,host){
  const lists=uiLists(doc.bytes(record));
  if(!lists.length){
    const children=doc.records.filter(r=>r.kind==='ui'&&r.parentId===record.id);
    host.append(el('p','read-note','This control has no directly editable List rows. Its layout and other properties are preserved.'));
    if(children.length){host.append(el('h2','nested-heading',`${children.length} child controls`));const childHost=el('div','data-preview');for(const child of children){childHost.append(btn(`${child.name}${child.listCount?' · List':''}`,()=>{invalidInput();selected=child.key;renderObjects();renderSelected();},'preview-item'));}host.append(childHost);}
    return;
  }
  lists.forEach((initial,listIndex)=>{
    const c=card('List items','UI List');host.append(c.box);let rows=initial.rows.map(r=>r.raw),listPage=0;
    const currentList=()=>uiLists(doc.bytes(record))[listIndex];
    const save=next=>{invalidInput();const list=currentList();doc.change(record,W.patch(doc.bytes(record),list.path,writeUIRows(list,next)),`Edited ${record.name} rows`);rows=next;changed(`Updated ${record.name}: ${rows.length} rows.`);};
    const draw=()=>{
      c.body.replaceChildren();const list=currentList();rows=list.rows.map(r=>r.raw);const ids=[...new Set(list.rows.flatMap(r=>r.fields.map(f=>f.id)))];
      const toolbar=el('div','list-toolbar');toolbar.append(btn('Paste row names',()=>openBulk('Replace row names',list.rows.map(r=>r.name),6,names=>{if(names.length!==rows.length)throw new Error('Supply one name for every existing row. Use Generate rows to create more.');if(names.some(n=>typeof n!=='string'))throw new Error('Each row name must be text.');save(list.rows.map((r,i)=>editUIRow(r,names[i],{})));draw();})),btn('Row data JSON ↓',()=>download(`${record.name}.json`,JSON.stringify(list.rows.map(r=>({name:r.name,values:Object.fromEntries(r.fields.map(f=>[f.id,f.value]))})),null,2),'application/json')),el('span','list-count',`${rows.length} rows`));c.body.append(toolbar);
      c.body.append(el('p','ui-heading-note','Formal fields are labeled by their stored IDs. Variable-reference text is preserved exactly.'));
      const gen=el('details');gen.append(el('summary','','Generate from a row template'));const choose=el('select');choose.setAttribute('aria-label','Template row');list.rows.forEach((r,i)=>{const option=el('option','',`${i+1}. ${r.name}`);option.value=String(i);choose.append(option);});gen.append(choose,generator(6,rows.length,names=>{const template=list.rows[Number(choose.value)];if(!template)throw new Error('Choose an existing template row.');save([...rows,...names.map(name=>editUIRow(template,name,{}))]);draw();}));c.body.append(gen);
      if(!rows.length){c.body.append(el('p','read-note','No template row is available. Create a new component in UI builder.'));return;}
      listPage=Math.min(listPage,Math.floor((rows.length-1)/100));if(rows.length>100){const nav=el('div','list-toolbar'),back=btn('←',()=>{listPage--;draw();}),next=btn('→',()=>{listPage++;draw();});back.disabled=listPage===0;next.disabled=(listPage+1)*100>=rows.length;nav.append(back,el('span','',`Page ${listPage+1}`),next);c.body.append(nav);}
      const wrap=el('div','list-table-wrap'),table=el('table','list-table'),thead=el('thead'),header=el('tr');['#','Row name',...ids.map(id=>`Formal ${id}`),'Actions'].forEach(v=>header.append(el('th','',v)));thead.append(header);table.append(thead);const body=el('tbody');
      list.rows.slice(listPage*100,(listPage+1)*100).forEach((row,local)=>{const i=listPage*100+local,tr=el('tr'),nameCell=el('td');nameCell.append(editorControl(6,row.name,`Row ${i+1} name`,value=>{const fresh=currentList(),next=fresh.rows.map(r=>r.raw);next[i]=editUIRow(fresh.rows[i],value,{});save(next);},doc.container.version!==1));tr.append(el('td','',String(i+1)),nameCell);
        for(const id of ids){const cell=el('td'),item=row.fields.find(f=>f.id===id);if(item)cell.append(editorControl(item.type===1?3:item.type===2?5:6,item.value,`Row ${i+1}, Formal ${id}`,value=>{const fresh=currentList(),next=fresh.rows.map(r=>r.raw);next[i]=editUIRow(fresh.rows[i],fresh.rows[i].name,{[id]:value});save(next);},doc.container.version!==1));else cell.append(el('span','readonly','Preserved'));tr.append(cell);}
        tr.append(actions(i,rows.length,action=>{const next=[...rows];if(action==='copy')next.splice(i+1,0,next[i]);if(action==='delete')next.splice(i,1);if(action==='up')[next[i-1],next[i]]=[next[i],next[i-1]];if(action==='down')[next[i],next[i+1]]=[next[i+1],next[i]];save(next);draw();},1));body.append(tr);});table.append(body);wrap.append(table);c.body.append(wrap);
      const preview=el('details');preview.append(el('summary','','Data preview'));const tiles=el('div','data-preview');for(const row of list.rows.slice(0,24)){const tile=el('div','preview-item');tile.append(el('strong','',row.name));for(const item of row.fields.slice(0,2))tile.append(el('small','',String(item.value)));tiles.append(tile);}preview.append(el('p','ui-heading-note','A preview of row data, not the game’s visual layout. Showing up to 24 rows.'),tiles);c.body.append(preview);
    };draw();
  });
}
function renderSections(){
  const host=$('section-report');host.replaceChildren();if(!doc)return;
  host.append(el('h2','',`Sections in ${doc.name}`));const table=el('table'),head=el('tr');['Field','Section','Size'].forEach(v=>head.append(el('th','',v)));table.append(head);
  for(const section of doc.sections){const row=el('tr');[section.number,section.name,size(section.size)].forEach(v=>row.append(el('td','',String(v))));table.append(row);}host.append(table);
  const detail=el('details');detail.append(el('summary','','Inspect original protobuf fields (read-only)'));let expanded=false;detail.addEventListener('toggle',()=>{if(detail.open&&!expanded){expanded=true;detail.append(wireTree(doc.payload,0));}});host.append(detail);
  for(const warning of doc.warnings)host.append(el('p','read-note',warning));
}
function wireTree(bytes,depth){
  const host=el('div');host.style.paddingLeft='14px';
  if(depth>=20){host.append(el('p','readonly','Depth limit reached. Raw bytes remain preserved.'));return host;}
  let fields;try{fields=W.parse(bytes);}catch{host.append(el('p','readonly',`Opaque bytes: ${Array.from(bytes.subarray(0,96),v=>v.toString(16).padStart(2,'0')).join(' ')}${bytes.length>96?' …':''}`));return host;}
  let offset=0;
  const more=()=>{
    for(const f of fields.slice(offset,offset+100)){
      if(f.wire===0){host.append(el('p','readonly',`Field ${f.number}[${f.occurrence}] · varint · ${f.value}`));continue;}
      if(f.wire!==2){host.append(el('p','readonly',`Field ${f.number}[${f.occurrence}] · ${f.wire===5?'fixed32':'fixed64'} · ${Array.from(f.value,v=>v.toString(16).padStart(2,'0')).join(' ')}`));continue;}
      const detail=el('details');detail.append(el('summary','',`Field ${f.number}[${f.occurrence}] · ${size(f.value.length)}${depth===0?' · '+(doc.sections.find(s=>s.number===f.number)?.name||''):''}`));let opened=false;
      detail.addEventListener('toggle',()=>{if(!detail.open||opened)return;opened=true;try{const text=W.string(f.value);if(text&&!/[\u0000-\u0008\u000e-\u001f]/.test(text))detail.append(el('pre','readonly',`UTF-8 interpretation: ${text.slice(0,2000)}${text.length>2000?'…':''}`));}catch{}detail.append(wireTree(f.value,depth+1));});host.append(detail);
    }
    offset+=100;if(offset<fields.length){const next=btn(`Show next ${Math.min(100,fields.length-offset)} fields (${fields.length-offset} remaining)`,()=>{next.remove();more();});host.append(next);}
  };more();return host;
}
async function loadBuilder(){
  if(builderReady)return builderReady;
  builderReady=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{builderReady=null;reject(new Error('Component tools did not finish loading. Open them in a full tab.'));},30000);
    const poll=()=>{
      try{const inner=$('builder-frame').contentWindow?.document.getElementById('app')?.contentWindow;if(inner?.MiliastraBridge){clearTimeout(timeout);$('builder-loading').hidden=true;resolve(inner.MiliastraBridge);return;}}catch{}
      setTimeout(poll,100);
    };
    $('builder-frame').src='./components.html';poll();
  });return builderReady;
}
async function builderCommand(command,value){showView('builder');const bridge=await loadBuilder();await bridge[command](value);}
function showView(name){
  view=name;for(const key of ['game','builder','format'])$(`${key}-view`).hidden=key!==name;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
  if(name==='builder')guard(()=>loadBuilder());
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>guard(()=>builderCommand('create',b.dataset.build)));
$('builder-new').onclick=()=>guard(()=>builderCommand('create','menu'));
$('builder-open').onclick=()=>guard(()=>builderCommand('browse'));
$('open-file').onclick=$('drop-zone').onclick=()=>$('file-input').click();
$('file-input').onchange=()=>{const file=$('file-input').files[0];$('file-input').value='';guard(()=>openFile(file));};
$('demo').onclick=()=>guard(()=>{if(doc?.changes.size&&!confirm('Replace this workspace with an example?'))return;doc=new GameDocument('Example workspace (synthetic)',demoFile());isDemo=true;activateDocument();});
$('object-search').oninput=$('only-lists').onchange=()=>{page=0;renderObjects();};
$('objects-prev').onclick=()=>{page--;renderObjects();};$('objects-next').onclick=()=>{page++;renderObjects();};
$('undo').onclick=()=>guard(()=>{doc?.undo();renderSelected();renderObjects();refreshActions();status('Undid the last change.');});
$('redo').onclick=()=>guard(()=>{doc?.redo();renderSelected();renderObjects();refreshActions();status('Redid the last change.');});
$('export-file').onclick=()=>guard(()=>{invalidInput();if(!doc||isDemo)return;const bytes=doc.export(),ext=doc.container.type===2?'gil':'gia',base=doc.name.replace(/\.(gil|gia)$/i,'');download(`${base}${doc.changes.size?' - edited':' - copy'}.${ext}`,bytes);exportedSignature=signature();status(`Exported ${size(bytes.length)}. ${doc.changes.size?'Check the edited copy in Miliastra before replacing your game.':'The exported bytes match the original.'}`,'success');});
$('report').onclick=()=>guard(()=>download('miliastra-inventory.json',JSON.stringify(doc.report(),null,2),'application/json'));
$('bulk-apply').onclick=()=>{try{bulkAction?.();}catch(e){$('bulk-error').textContent=e.message;}};
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('dragging');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('dragging');}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('dragging');const file=e.dataTransfer?.files[0];if(file)guard(()=>openFile(file));});
window.addEventListener('beforeunload',e=>{if(doc?.changes.size&&signature()!==exportedSignature){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(view!=='game'||(!e.ctrlKey&&!e.metaKey))return;const key=e.key.toLowerCase();if(key==='s'){e.preventDefault();document.activeElement?.blur();$('export-file').click();}if(key==='o'){e.preventDefault();$('file-input').click();}if(key==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}});
