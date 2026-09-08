// Runs in the existing editor scope, after its pinned modules.
(()=>{
  const supported=()=>['gia-single','gia-tab','gia-deck'].includes(currentDocument?.kind)&&currentDocument.items?.length;
  const templateButton=document.createElement('button');templateButton.textContent='Generate rows';templateButton.type='button';templateButton.title='Append numbered rows from a selected item';
  document.getElementById('giaToolbar')?.prepend(templateButton);
  const dialog=document.createElement('dialog');dialog.style.cssText='background:#111c2d;color:#eff5ff;border:1px solid #456384;border-radius:12px;padding:24px;width:min(600px,90vw)';
  dialog.innerHTML='<form method="dialog"><h2 style="margin-top:0">Generate list rows</h2><p style="color:#a7b9d1;line-height:1.5">Duplicate the selected item with numbered names. Its values and appearance are copied to each new row.</p><label style="display:block;margin:12px 0">Name pattern <input data-pattern value="Item {n}" style="width:100%;margin-top:5px"></label><div style="display:flex;gap:12px"><label>Count<input data-count type="number" min="1" max="1000" value="10" style="width:100%"></label><label>Start at<input data-start type="number" value="1" style="width:100%"></label><label>Step<input data-step type="number" value="1" style="width:100%"></label></div><p style="color:#92b8e8" data-preview></p><p role="alert" data-error style="color:#ff9ca8"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button value="cancel">Cancel</button><button type="button" class="primary" data-apply>Append rows</button></div></form>';
  document.body.append(dialog);
  const input=selector=>dialog.querySelector(selector);
  const names=()=>{
    const count=Number(input('[data-count]').value),start=Number(input('[data-start]').value),step=Number(input('[data-step]').value),pattern=input('[data-pattern]').value;
    if(!Number.isInteger(count)||count<1||count>1000)throw new Error('Count must be between 1 and 1,000.');
    if(!Number.isFinite(start)||!Number.isFinite(step))throw new Error('Enter a valid start and step.');
    if((currentDocument?.items.length||0)+count>10000)throw new Error('The list would exceed 10,000 rows.');
    return Array.from({length:count},(_,i)=>pattern.replaceAll('{n}',String(start+i*step)));
  };
  dialog.addEventListener('input',()=>{try{const n=names();input('[data-preview]').textContent=n.slice(0,3).join(' · ')+(n.length>3?' · …':'');input('[data-error]').textContent='';}catch(e){input('[data-error]').textContent=e.message;}});
  templateButton.onclick=()=>{
    if(!supported()){setStatus('Open or create a choice list, tab, or deck with at least one row first.','error');return;}
    input('[data-error]').textContent='';input('[data-preview]').textContent='Use {n} for the row number.';dialog.showModal();
  };
  input('[data-apply]').onclick=()=>{
    try{
      if(!supported())throw new Error('No supported template row is selected.');
      applyGiaFields?.();
      const rowNames=names(),template=currentDocument.items[selectedIndex??0];
      if(!template)throw new Error('Select a template row.');
      const rows=rowNames.map(name=>{
        const row=structuredClone(template);
        if(currentDocument.kind==='gia-deck'){row.internalName=name;if('title' in row)row.title=name;}
        else row.internalName=name;
        return row;
      });
      pushHistory('Generate list rows');currentDocument.items.push(...rows);currentDocument.normalize?.();selectedIndex=currentDocument.items.length-rows.length;
      renderGia();dialog.close();setStatus(`Appended ${rows.length} rows from the selected template.`,'success');
    }catch(e){input('[data-error]').textContent=e.message;}
  };
  globalThis.MiliastraBridge={
    async create(kind){
      await globalThis.miliastraEnhancementsReady;
      if(kind==='menu'){switchView('build');return;}
      const ids={single:'newSingleButton',deck:'newDeckButton',tab:'newTabButton',structure:'newStructureGiaButton',status:'newStatusDisplayButton'};
      const button=document.getElementById(ids[kind]);if(!button)throw new Error('This component template is unavailable.');button.click();
    },
    async open(file){await globalThis.miliastraEnhancementsReady;await openFile(file);},
    browse(){document.getElementById('fileInput').click();}
  };
  // Prevent a full game, a truncated payload, or a false .gia extension from
  // reaching the legacy component detector's recursive shape search.
  Promise.resolve(globalThis.miliastraEnhancementsReady).then(()=>{
    const previousDetect=detectGia;
    detectGia=function(fileName,bytes){
      if(bytes.length<24)throw new Error('Invalid GIA envelope.');
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(view.getUint32(12)===2)throw new Error('Open full .gil files in Game workspace.');
      if(view.getUint32(12)!==3||view.getUint32(8)!==0x326||view.getUint32(bytes.length-4)!==0x679||view.getUint32(0)!==bytes.length-4||view.getUint32(16)!==bytes.length-24)throw new Error('Invalid GIA header, footer, or payload length.');
      return previousDetect(fileName,bytes);
    };
  });
})();
