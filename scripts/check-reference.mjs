import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as W from '../assets/game-wire.mjs';
import {GameDocument,uiLists,editUIRow,writeUIRows} from '../assets/game-document.mjs';
import {flattenValues,readValue} from '../assets/game-values.mjs';
const target=process.argv[2] || fs.readdirSync('..').find(n=>n.endsWith('.gil'));
if(!target)throw new Error('Pass the path of a reference .gil file.');
const file=fs.existsSync(target)?target:path.join('..',target),original=new Uint8Array(fs.readFileSync(file));
console.time('Index');const doc=new GameDocument(path.basename(file),original);console.timeEnd('Index');
assert.deepEqual(doc.export(),original);assert.equal(doc.warnings.length,0);
const counts={};for(const r of doc.records)counts[r.kind]=(counts[r.kind]||0)+1;
let reads=0,edits=0;const modifiedSections=new Set();
for(const record of doc.records){
  for(const variable of doc.variables(record)){
    assert.ok(variable.model,variable.warning);reads++;
    for(const leaf of flattenValues(variable.model)){
      const m=leaf.model;if(!m.editable||![3,4,5,6,8,9,10,11].includes(m.type))continue;
      const value=Array.isArray(m.value)?[...m.value,m.element===6?'Reference test':m.element===4?true:123]:m.type===6?m.value+' ✓':m.type===4?!m.value:m.type===5?1.25:123;
      doc.editValue(record,variable.path,leaf.path,value,'Reference regression');
      const actual=readValue(W.at(doc.bytes(record),[...variable.path,...leaf.path])).value;
      assert.deepEqual(actual,value);edits++;modifiedSections.add(record.path[0][0]);
    }
  }
  if(record.kind==='ui')for(const list of uiLists(doc.bytes(record))){
    const rows=list.rows.map(r=>r.raw);const first=list.rows[0];if(!first)continue;
    const values=Object.fromEntries(first.fields.map(f=>[f.id,f.type<=2?2:f.value+' ✓']));
    rows[0]=editUIRow(first,first.name+' ✓',values);rows.push(rows[0]);
    doc.change(record,W.patch(doc.bytes(record),list.path,writeUIRows(list,rows)),'UI regression');modifiedSections.add(record.path[0][0]);
    const reopened=uiLists(doc.bytes(record))[0];assert.equal(reopened.rows.length,rows.length);assert.equal(reopened.rows[0].name,first.name+' ✓');
    for(const f of reopened.rows[0].fields)assert.equal(f.value,values[f.id]);
  }
}
const edited=doc.export(),output=new GameDocument('reference-edited.gil',edited);
assert.equal(output.records.length,doc.records.length);assert.equal(output.warnings.length,0);
for(const r of doc.records)assert.deepEqual(output.records.find(x=>x.key===r.key).original,doc.bytes(r));
const oldRoot=W.parse(doc.payload),newRoot=W.parse(output.payload);
for(let i=0;i<oldRoot.length;i++)if(!modifiedSections.has(oldRoot[i].number))assert.deepEqual(newRoot[i].raw,oldRoot[i].raw);
console.log(JSON.stringify({file:path.basename(file),bytes:original.length,sha256:crypto.createHash('sha256').update(original).digest('hex'),objects:counts,variablesRead:reads,valuesEditedAndReopened:edits,modifiedObjects:doc.changes.size,modifiedSections:[...modifiedSections],unmodifiedSectionsByteIdentical:true,originalRoundTripByteIdentical:true,gameImportValidated:false},null,2));
