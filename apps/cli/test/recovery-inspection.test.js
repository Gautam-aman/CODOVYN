import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../../../packages/storage/src/index.js';
import { createDraftWorkspace } from '../../../packages/git-engine/src/draft-workspace.js';
import { repositorySnapshot } from '../../../packages/git-engine/src/index.js';
import { main } from '../src/index.js';
test('recovery inspection preserves partial writes and unresolved actions without changing a running task', async () => {
  const directory=mkdtempSync(join(tmpdir(),'codovyn-recovery-'));const repository=join(directory,'repo');mkdirSync(repository);
  const previous=process.env.CODOVYN_DATA_DIR;let store;
  try {
    process.env.CODOVYN_DATA_DIR=join(directory,'data');
    const git=(...args)=>execFileSync('git',['-C',repository,...args],{stdio:'pipe'});
    git('init','-q','-b','main');writeFileSync(join(repository,'file.txt'),'original\n');git('add','.');
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','base');
    const draft=await createDraftWorkspace(repository,join(directory,'data/drafts'),'crashed');
    store=new TaskStore(join(directory,'data/tasks.sqlite'));
    store.create({id:'crashed',request:'Edit file',repositoryRoot:(await repositorySnapshot(repository)).root,primaryAgent:'codex'});
    store.append('crashed','draft-created',{baseCommit:draft.baseCommit});
    store.append('crashed','agent-event',{agent:'codex',event:{type:'tool-start',actionId:'write-1',action:'file_change'}});
    store.update('crashed',{status:'running',activeAgent:'codex',step:0});
    writeFileSync(join(draft.path,'file.txt'),'partial write\n');store.close();store=null;
    const lines=[];assert.equal(await main(['draft-inspect','crashed',repository],{log:x=>lines.push(x),error:x=>assert.fail(x)}),0);
    const result=JSON.parse(lines[0]);assert.equal(result.status,'running');assert.equal(result.automaticContinuation,false);
    assert.equal(result.actions[0].state,'unresolved');assert.equal(result.processState,'legacy-process-ownership-unknown');assert.equal(result.repository.dirty,true);
    assert.equal(execFileSync('git',['-C',draft.path,'diff','--cached','--name-only'],{encoding:'utf8'}),'');
    assert.equal(readFileSync(join(repository,'file.txt'),'utf8'),'original\n');
    assert.equal(readFileSync(join(draft.path,'file.txt'),'utf8'),'partial write\n');
    store=new TaskStore(join(directory,'data/tasks.sqlite'));assert.equal(store.get('crashed').status,'running');
    assert.equal(store.events('crashed').length,2);
  } finally {store?.close();if(previous===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=previous;rmSync(directory,{recursive:true,force:true});}
});
