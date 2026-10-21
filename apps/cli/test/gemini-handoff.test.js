import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexAdapter, createGeminiAdapter } from '../../../packages/agent-adapters/src/index.js';
import { main } from '../src/index.js';
test('fault-injected Codex quota hands an isolated draft to Gemini before reviewed application and tests', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'codovyn-gemini-e2e-'));
  const repository = join(directory,'repo'); mkdirSync(repository);
  const previous=process.env.CODOVYN_DATA_DIR;
  const git=(...args)=>execFileSync('git',['-C',repository,...args],{stdio:'pipe'});
  try {
    process.env.CODOVYN_DATA_DIR=join(directory,'data');
    git('init','-q','-b','main');
    writeFileSync(join(repository,'answer.cjs'),'module.exports = 0;\n');
    git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');
    const primary=join(directory,'codex.cjs');
    writeFileSync(primary,`if(process.argv.includes('--version')){console.log('fixture');process.exit(0)}process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'turn.failed',error:{code:429}})));`);
    const backup=join(directory,'gemini.cjs');
    writeFileSync(backup,`if(process.argv.includes('--help')){console.log('--admin-policy --output-format --extensions');process.exit(0)}
      let p='';process.stdin.on('data',c=>p+=c);process.stdin.on('end',()=>{
      if(!p.includes('Set answer to 42')||!p.includes('Verified repository state:'))process.exit(3);
      const emit=e=>console.log(JSON.stringify(e));emit({type:'tool_use',tool_id:'write-1',tool_name:'write_file'});
      require('fs').writeFileSync('answer.cjs','module.exports = 42;\\n');
      emit({type:'tool_result',tool_id:'write-1',status:'success'});emit({type:'result',status:'success'});});`);
    const adapters={createCodexAdapter:options=>createCodexAdapter({...options,command:process.execPath,prefixArgs:[primary]}),
      createGeminiAdapter:options=>createGeminiAdapter({...options,command:process.execPath,prefixArgs:[backup]})};
    const lines=[];const output={log:x=>lines.push(x),error:x=>assert.fail(x)};
    assert.equal(await main(['auto-gemini-edit',repository,'Set answer to 42','--allow-writes'],output,undefined,undefined,adapters),0,JSON.stringify(lines));
    const result=JSON.parse(lines.at(-1));
    assert.equal(result.activeAgent,'gemini');
    const checkpoint=result.events.find(e=>e.kind==='checkpoint');
    const handoff=result.events.find(e=>e.kind==='handoff');
    assert.ok(checkpoint.seq<handoff.seq);
    assert.equal(checkpoint.data.usedTool,false);
    assert.equal(readFileSync(join(repository,'answer.cjs'),'utf8').replace(/\r\n/g, '\n'),'module.exports = 0;\n');
    assert.equal(await main(['draft-review',result.taskId,repository],output),0);
    const review=JSON.parse(lines.at(-1));assert.match(review.patch,/42/);
    assert.equal(await main(['draft-accept',result.taskId,repository,review.patchHash,'--yes'],output),0);
    assert.equal(readFileSync(join(repository,'answer.cjs'),'utf8').replace(/\r\n/g, '\n'),'module.exports = 42;\n');
    execFileSync(process.execPath,['-e',`require('node:assert/strict').equal(require(${JSON.stringify(join(repository,'answer.cjs'))}),42)`]);
  } finally {
    if(previous===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=previous;
    rmSync(directory,{recursive:true,force:true});
  }
});
