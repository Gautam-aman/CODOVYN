import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/index.js';
test('execution ownership is atomic across connections, durable and token fenced', () => {
  const root=mkdtempSync(join(tmpdir(),'codovyn-lease-'));let first,second;
  const owner={token:'owner-token-12345678',pid:process.pid,host:'test'};
  try {
    first=new TaskStore(join(root,'tasks.sqlite'));first.create({id:'task',request:'Fix',primaryAgent:'codex'});
    second=new TaskStore(join(root,'tasks.sqlite'));
    first.claimExecution('task',owner);
    assert.throws(()=>second.claimExecution('task',{...owner,token:'other-token-12345678'}),/unreconciled/);
    assert.throws(()=>second.releaseExecution('task','wrong-token'),/ownership/);
    first.close();first=null;
    assert.equal(second.executionLease('task').owner.pid,process.pid);
    assert.equal(second.executionLease('task').releasedAt,null);
    assert.throws(()=>second.delete('task'),/owned task/);
    second.releaseExecution('task',owner.token);
    second.claimExecution('task',{...owner,token:'other-token-12345678'});
    assert.throws(()=>second.releaseExecution('task',owner.token),/ownership/);
    second.releaseExecution('task','other-token-12345678');
    second.update('task',{status:'cancelled',activeAgent:null,step:0});second.delete('task');
    assert.equal(second.executionLease('task'),null);
  } finally {first?.close();second?.close();rmSync(root,{recursive:true,force:true});}
});
