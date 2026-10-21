import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {TaskStore} from '../../../packages/storage/src/index.js';
import {createDraftWorkspace} from '../../../packages/git-engine/src/draft-workspace.js';
import {repositorySnapshot} from '../../../packages/git-engine/src/index.js';
import {executionRecovery} from '../../../packages/task-engine/src/recovery.js';
import {main} from '../src/index.js';
import {createGeminiAdapter} from '../../../packages/agent-adapters/src/index.js';
const root=resolve(import.meta.dirname,'../../..');
async function until(predicate){for(let n=0;n<200;n++){if(await predicate())return;await delay(25);}throw new Error('Fixture stage timed out');}
for(const point of ['before-action','during-write','after-write','after-completion','during-shutdown']) {
 test(`hard owner death ${point} blocks live groups and preserves the draft without replay`,{skip:process.platform==='win32'},async()=>{
  const directory=mkdtempSync(join(tmpdir(),'codovyn-crash-'));const repository=join(directory,'repo');mkdirSync(repository);
  const data=join(directory,'data'),database=join(data,'tasks.sqlite');let store,owner,pid;const previous=process.env.CODOVYN_DATA_DIR;
  try {
   const git=(...args)=>execFileSync('git',['-C',repository,...args],{stdio:'pipe'});
   git('init','-q','-b','main');writeFileSync(join(repository,'file.txt'),'original\n');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','base');
   const draft=await createDraftWorkspace(repository,join(data,'drafts'),'task');
   store=new TaskStore(database);store.create({id:'task',request:'Finish the change without repeating unknown commands',repositoryRoot:(await repositorySnapshot(repository)).root,primaryAgent:'codex'});
   store.append('task','draft-created',{baseCommit:draft.baseCommit});
   const marker=join(directory,'stage'),provider=join(directory,'provider.cjs');
   writeFileSync(provider,`if(process.argv.includes('--version'))process.exit(0);const fs=require('fs');const emit=e=>console.log(JSON.stringify(e));process.stdin.resume();process.stdin.on('end',()=>{
    process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(marker)},'cancel-received'));
    if(${JSON.stringify(point)}!=='before-action')emit({type:'item.started',item:{id:'write',type:'file_change'}});
    if(${JSON.stringify(point)}!=='before-action')fs.writeFileSync('file.txt',${JSON.stringify(point==='during-write'?'partial\n':'finished\n')});
    if(${JSON.stringify(point)}==='after-completion')emit({type:'item.completed',item:{id:'write',type:'file_change'}});
    fs.writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000);
   });`);
   const wrapper=join(directory,'owner.mjs');
   writeFileSync(wrapper,`import {TaskStore} from ${JSON.stringify(join(root,'packages/storage/src/index.js'))};
    import {AgentRegistry} from ${JSON.stringify(join(root,'packages/agent-core/src/index.js'))};
    import {TaskEngine} from ${JSON.stringify(join(root,'packages/task-engine/src/index.js'))};
    import {createCodexAdapter} from ${JSON.stringify(join(root,'packages/agent-adapters/src/index.js'))};
    import {repositorySnapshot} from ${JSON.stringify(join(root,'packages/git-engine/src/index.js'))};
    const store=new TaskStore(${JSON.stringify(database)}),registry=new AgentRegistry(),controller=new AbortController();
    process.on('SIGTERM',()=>controller.abort());registry.register(createCodexAdapter({cwd:${JSON.stringify(draft.path)},command:process.execPath,prefixArgs:[${JSON.stringify(provider)}],write:true}));
    await new TaskEngine({store,registry,snapshot:()=>repositorySnapshot(${JSON.stringify(draft.path)})}).run('task',{signal:controller.signal});store.close();`);
   owner=spawn(process.execPath,[wrapper],{stdio:'ignore'});const exited=new Promise(resolve=>owner.once('exit',resolve));
   await until(()=>{try{return readFileSync(marker,'utf8')==='ready'&&store.events('task').some(e=>e.kind==='provider-spawned')&&
    (point==='before-action'||store.events('task').some(e=>e.kind==='agent-event'&&e.data.event.type==='tool-start'))&&
    (point!=='after-completion'||store.events('task').some(e=>e.kind==='agent-event'&&e.data.event.type==='tool-complete'));}catch{return false;}});
   pid=store.events('task').findLast(e=>e.kind==='provider-spawned').data.pid;
   if(point==='during-shutdown'){owner.kill('SIGTERM');await until(()=>readFileSync(marker,'utf8')==='cancel-received');}
   owner.kill('SIGKILL');await exited;
   assert.equal(executionRecovery(store,'task').safe,false,'a still-live provider cannot be recovered');
   process.kill(-pid,'SIGKILL');await until(()=>executionRecovery(store,'task').safe);
   const before=readFileSync(join(draft.path,'file.txt'),'utf8');
   process.env.CODOVYN_DATA_DIR=data;const lines=[],output={log:x=>lines.push(x),error:x=>assert.fail(x)};
   assert.equal(await main(['draft-inspect','task',repository],output),0);const inspection=JSON.parse(lines.at(-1));
   assert.equal(inspection.recoverySafe,true);assert.equal(inspection.automaticContinuation,false);
   assert.equal(await main(['draft-reconcile','task',repository,inspection.fingerprint,'--yes'],output),0);
   assert.equal(readFileSync(join(draft.path,'file.txt'),'utf8'),before);
   assert.equal(readFileSync(join(repository,'file.txt'),'utf8'),'original\n');
   assert.equal(store.get('task').status,'interrupted');
   assert.equal(store.events('task').filter(e=>e.kind==='agent-event'&&e.data.event.type==='tool-start').length,point==='before-action'?0:1);
   if(point==='after-completion') {
    const backup=join(directory,'gemini.cjs');
    writeFileSync(backup,`if(process.argv.includes('--help')){console.log('--admin-policy --output-format --extensions');process.exit(0);}
      let prompt='';process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{
       if(!prompt.includes('Finish the change')||!prompt.includes('reconciliations'))process.exit(3);
       const fs=require('fs');if(fs.readFileSync('file.txt','utf8')!=='finished\\n')process.exit(4);
       const emit=e=>console.log(JSON.stringify(e));emit({type:'tool_use',tool_id:'new-write',tool_name:'write_file'});
       fs.writeFileSync('second.txt','continued\\n');emit({type:'tool_result',tool_id:'new-write',status:'success'});emit({type:'result',status:'success'});
      });`);
    const adapters={createGeminiAdapter:options=>createGeminiAdapter({...options,command:process.execPath,prefixArgs:[backup]})};
    assert.equal(await main(['draft-continue','task',repository,inspection.fingerprint,'gemini','--yes'],output,undefined,undefined,adapters),0);
    assert.equal(readFileSync(join(draft.path,'file.txt'),'utf8'),'finished\n');
    assert.equal(await main(['draft-review','task',repository],output),0);const review=JSON.parse(lines.at(-1));
    assert.equal(await main(['draft-accept','task',repository,review.patchHash,'--yes'],output),0);
    assert.equal(readFileSync(join(repository,'second.txt'),'utf8'),'continued\n');
   }

  } finally {
   owner?.kill('SIGKILL');if(pid)try{process.kill(-pid,'SIGKILL');}catch{}
   store?.close();if(previous===undefined)delete process.env.CODOVYN_DATA_DIR;else process.env.CODOVYN_DATA_DIR=previous;
   rmSync(directory,{recursive:true,force:true});
  }
 });
}
