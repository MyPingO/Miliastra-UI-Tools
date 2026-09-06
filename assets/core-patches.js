<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b1020">
<meta name="description" content="Fast, local-only editor and builder for Miliastra UI component GIA and variable export files.">
<link rel="icon" href="./assets/icon.svg" type="image/svg+xml">
<title>Miliastra UI Tools · Data Editor</title>
<style>
html,body,#app{width:100%;height:100%;margin:0;background:#090d16}
#app{border:0;display:block}
.boot{position:fixed;inset:0;display:grid;place-items:center;color:#93a4bb;font:14px system-ui;background:#090d16}
.boot strong{color:#f4f7fb}
</style>
</head>
<body>
<div class="boot" id="boot"><div><strong>Miliastra UI Tools</strong><br>Loading editor…</div></div>
<iframe id="app" title="Miliastra UI Tools editor"></iframe>
<script>
(async()=>{
  try{
    const opts={cache:'no-store'};
    const version='20260905p';
    const paths=[
      'editor-core.html','core-patches.js','site.css','site.js',
      'status-v2.js','deck-selector.js','type-labels.js'
    ];
    const responses=await Promise.all(paths.map(path=>fetch(`./assets/${path}?v=${version}`,opts)));
    const failed=responses.findIndex(response=>!response.ok);
    if(failed>=0)throw new Error(`Failed to load ${paths[failed]}`);
    const [sourceRes,patchRes,cssRes,siteRes,statusRes,deckRes,labelRes]=responses;
    let source=await sourceRes.text();
    const patchCode=await patchRes.text();
    const css=await cssRes.text();
    const scripts=[await siteRes.text(),await statusRes.text(),await deckRes.text(),await labelRes.text()].join('\n');

    new Function(patchCode)();
    if(typeof globalThis.patchMiliastraEditorCore!=='function')throw new Error('Editor core patcher did not initialize');
    source=globalThis.patchMiliastraEditorCore(source);
    source=source.replace('</style>','\n'+css+'\n</style>');
    source=source.replace('</body>','<script>'+scripts.replace(/<\/script/gi,'<\\/script')+'<\/script></body>');

    const frame=document.getElementById('app');
    frame.addEventListener('load',()=>document.getElementById('boot')?.remove(),{once:true});
    frame.srcdoc=source;
  }catch(error){
    console.error(error);
    document.getElementById('boot').innerHTML='<div><strong>Editor failed to load.</strong><br>'+String(error.message||error)+'</div>';
  }
})();
</script>
</body>
</html>
