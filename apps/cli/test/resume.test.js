import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {main} from '../src/index.js';
import {createCodexAdapter} from '../../../packages/agent-adapters/src/index.js';
test('read-task resume retains its original instructions and requires explicit confirmation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'codovyn-resume-')),old=process.env.CODOVYN_DATA_DIR;
 try {
  const repository=join(directory,'repo');mkdirSync(repository);execFileSync('git',['init','-q',repository]);process.env.CODOVYN_DATA_DIR=join(directory,'data');
  const fixture=join(directory,'codex.cjs'),sentinel=join(directory,'attempt');
  writeFileSync(fixture,`if(process.argv.includes('--version'))process.exit(0);let p='';process.stdin.on('data',c=>p+=c);process.stdin.on('end',()=>{
   if(!p.includes('Explain without editing'))process.exit(3);const fs=require('fs'),emit=e=>console.log(JSON.stringify(e));
   if(!fs.existsSync(${JSON.stringify(sentinel)})){fs.writeFileSync(${JSON.stringify(sentinel)},'once');emit({type:'turn.failed',error:{code:429}});}
   else emit({type:'turn.completed'});
  });`);
  const adapters={createCodexAdapter:options=>createCodexAdapter({...options,command:process.execPath,prefixArgs:[fixture]})};
  const lines=[],errors=[],output={log:x=>lines.push(x),error:x=>errors.push(x)};
  assert.equal(await main(['codex',repository,'Explain without editing'],output,undefined,undefined,adapters),1);
  const id=JSON.parse(lines.at(-1)).taskId;
  assert.equal(await main(['resume',id,repository],output,undefined,undefined,adapters),2);
  assert.equal(await main(['resume',id,repository,'--yes'],output,undefined,undefined,adapters),0);
  assert.equal(JSON.parse(lines.at(-1)).status,'completed');
  assert.ok(JSON.parse(lines.at(-1)).events.some(e=>e.kind==='checkpoint'));
 } finally {if(old===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=old;rmSync(directory,{recursive:true,force:true});}
});
