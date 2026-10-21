import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCodexAdapter,createClaudeAdapter} from '../src/index.js';
for(const [provider,create] of [['Codex',createCodexAdapter],['Claude',createClaudeAdapter]]) {
 test(`${provider} bounds bytes before newline and cleans up a still-running malformed stream`,{timeout:10000},async()=>{
  const directory=mkdtempSync(join(tmpdir(),'codovyn-stream-'));
  try {
   const fixture=join(directory,'provider.cjs');
   writeFileSync(fixture,"process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(' '.repeat(1048577));setInterval(()=>{},1000);});");
   let events=0;await assert.rejects(async()=>{
    for await(const event of create({cwd:directory,command:process.execPath,prefixArgs:[fixture]}).run({handoff:{request:'Inspect'}})){void event;events++;}
   },error=>error.kind==='fatal');assert.equal(events,0);
  } finally {rmSync(directory,{recursive:true,force:true});}
 });
}
