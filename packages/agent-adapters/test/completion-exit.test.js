import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCodexAdapter,createClaudeAdapter} from '../src/index.js';
for(const [provider,create,event] of [['Codex',createCodexAdapter,{type:'turn.completed'}],['Claude',createClaudeAdapter,{type:'result',subtype:'success',is_error:false}]]) {
 test(`${provider} never confirms success before a successful process exit`,async()=>{
  const directory=mkdtempSync(join(tmpdir(),'codovyn-completion-'));
  try {
   for(const failure of ['nonzero','trailing-event']) {
    const fixture=join(directory,'provider.cjs');writeFileSync(fixture,`process.stdin.resume();process.stdin.on('end',()=>{
      console.log(${JSON.stringify(JSON.stringify(event))});
      ${failure==='nonzero'?'process.exitCode=7;':"console.log(JSON.stringify({type:'unexpected-event'}));"}
    });`);
    const events=[];await assert.rejects(async()=>{
     for await(const output of create({cwd:directory,command:process.execPath,prefixArgs:[fixture]}).run({handoff:{request:'Inspect'}}))events.push(output);
    },error=>error.kind==='fatal');assert.equal(events.some(e=>e.type==='completed'),false);
   }
  } finally {rmSync(directory,{recursive:true,force:true});}
 });
}
