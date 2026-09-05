(()=>{
'use strict';
const assetRoot=new URL('./assets/',window.parent.location.href);
const base=new URL('status-v2.part',assetRoot).href;
(async()=>{
  try{
    const [responses,labelRes]=await Promise.all([
      Promise.all([1,2,3,4,5,6].map(i=>fetch(`${base}${i}.txt?v=20260905g`,{cache:'no-store'}))),
      fetch(new URL('type-labels.js?v=20260905g',assetRoot),{cache:'no-store'})
    ]);
    if(responses.some(r=>!r.ok))throw new Error('Failed to load Status Display editor modules');
    let code=(await Promise.all(responses.map(r=>r.text()))).join('');

    /* Miliastra does not restore Link Unit Status references when a Status
       Display Area GIA is imported, even when the GIA was exported by
       Miliastra itself. Do not expose a control that appears functional.
       Existing serialized references are still parsed/preserved untouched. */
    code=code
      .replace('  <button data-add>+ Unit Status</button>\n','')
      .replace(
        '<div class="sd-subtitle">Link Unit Status</div>\n<div class="sd-refs"></div>',
        '<div class="sd-note">Unit Status links must be configured manually in Miliastra after import.</div>\n<div class="sd-refs" style="display:none"></div>'
      )
      .replace("card.querySelector('[data-add]').addEventListener('click',()=>{","card.querySelector('[data-add]')?.addEventListener('click',()=>{")
      .replace(
        "  const sections=[...document.querySelectorAll('.build-section')];\n  const gia=sections.find(section=>section.querySelector('h2')?.textContent.trim()==='UI Component Exports (.gia)');\n  if(!gia)return;\n  const grid=gia.querySelector('.build-grid')||gia;",
        "  const grid=document.getElementById('newSingleButton')?.closest('.build-grid');\n  if(!grid)return;"
      )
      .replace(
        "card.innerHTML='<h3>Status Display Area</h3><p>Build from the editor-default empty component, then add only the data you choose.</p><button id=\"newStatusDisplayButton\" type=\"button\">Status Display Area</button>';",
        "card.innerHTML='<span class=\"badge\">Template-based GIA</span><h3>Status Display Area</h3><p>Starts from an editor-default empty Status Display Area with no preconfigured variables or references.</p><button class=\"primary\" id=\"newStatusDisplayButton\" type=\"button\">Create Status Display Area</button>';"
      );

    new Function(code)();
    if(labelRes.ok)new Function(await labelRes.text())();
  }catch(error){
    console.error('Status Display editor failed to load',error);
  }
})();
})();
