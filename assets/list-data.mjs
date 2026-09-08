export function parseCSV(source) {
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  source=source.replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||closed)throw new Error('Unexpected quote in CSV.');quoted=true;}
    else if(c===','){row.push(cell);cell='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;}
    else {if(closed)throw new Error('Unexpected text after a CSV quote.');cell+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote.');
  if(cell||row.length||closed) {row.push(cell);rows.push(row);}
  return rows;
}
export const toCSV = values => values.map(v=>'"'+String(v).replaceAll('"','""')+'"').join('\r\n')+(values.length?'\r\n':'');
export function parseList(source,format,element) {
  let values;
  if(format==='json'){values=JSON.parse(source);if(!Array.isArray(values))throw new Error('Expected a JSON array.');}
  else {
    if(format==='csv') {const rows=parseCSV(source);if(rows.some(r=>r.length!==1))throw new Error('Use exactly one CSV column, without a header.');values=rows.map(r=>r[0]);}
    else values=source===''?[]:source.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');
    values=values.map((v,i)=>{
      if(element===6)return v;
      if(element===4){if(!/^(true|false|0|1)$/i.test(v.trim()))throw new Error(`Row ${i+1}: use true, false, 0, or 1.`);return /^(true|1)$/i.test(v.trim());}
      if(!v.trim()||!Number.isFinite(Number(v)))throw new Error(`Row ${i+1}: enter a number.`);
      return Number(v);
    });
  }
  if(values.length>10000)throw new Error('Lists support up to 10,000 items.');
  return values;
}
export function sequence({count,start=1,step=1,pattern='Item {n}',element=6}) {
  if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Count must be from 1 to 10,000.');
  if(!Number.isFinite(start)||!Number.isFinite(step))throw new Error('Start and step must be finite numbers.');
  return Array.from({length:count},(_,i)=>element===6?pattern.replaceAll('{n}',String(start+i*step)):element===4?false:start+i*step);
}
