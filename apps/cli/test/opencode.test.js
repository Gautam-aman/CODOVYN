import test from 'node:test';import assert from 'node:assert/strict';
import{execFileSync}from'node:child_process';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{main}from'../src/index.js';

test('OpenCode uses the existing task journal/draft review and never applies before approval',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'codovyn-cli-opencode-')),repo=join(temp,'repo'),saved={};
 for(const key of ['CODOVYN_DATA_DIR','CODOVYN_TASK_CONFIGURATION'])saved[key]=process.env[key];
 try{
  mkdirSync(repo);execFileSync('git',['init','-q',repo]);writeFileSync(join(repo,'Main.java'),'class Main {}\n');execFileSync('git',['-C',repo,'add','.']);execFileSync('git',['-C',repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','sample']);
  process.env.CODOVYN_DATA_DIR=join(temp,'data');
  const configuration={provider:'opencode',modelId:'discovered-opencode-test',modelSource:'discovered',permission:'read-write',routingMode:'manual',reasoning:'deep',intent:'agent'};
  process.env.CODOVYN_TASK_CONFIGURATION=JSON.stringify(configuration);
  const lines=[],errors=[],output={log:x=>lines.push(x),error:x=>errors.push(x)};
  const adapters={discoverProvider:async()=>({models:[{id:configuration.modelId,model:'provider/model',reasoning:['deep']}]}),createOpenCodeAdapter:options=>({id:'opencode',capabilities:{tools:true,writes:options.write,shell:false},availability:async()=> 'available',async *run(){assert.notEqual(options.cwd,repo);assert.equal(options.model,'provider/model');assert.equal(options.reasoning,'deep');yield{type:'tool-start',actionId:'edit-1',action:'file_change'};writeFileSync(join(options.cwd,'Main.java'),'class Main { int value() { return 1; } }\n');yield{type:'tool-complete',actionId:'edit-1',action:'file_change'};yield{type:'completed'};}})};
  assert.equal(await main(['opencode-edit',repo,'Add a method'],output,undefined,undefined,adapters),2);
  assert.equal(await main(['opencode-edit',repo,'Add a method','--allow-writes'],output,undefined,undefined,adapters),0);
  const task=JSON.parse(lines.at(-1));assert.equal(task.activeAgent,'opencode');assert.equal(readFileSync(join(repo,'Main.java'),'utf8'),'class Main {}\n');
  assert.equal(task.events.find(e=>e.kind==='task-configuration').data.reasoning,'deep');
  delete process.env.CODOVYN_TASK_CONFIGURATION;
  assert.equal(await main(['draft-review',task.taskId,repo],output),0);const review=JSON.parse(lines.at(-1));assert.match(review.patch,/int value/);
  assert.equal(await main(['draft-accept',task.taskId,repo,review.patchHash,'--yes'],output),0);assert.match(readFileSync(join(repo,'Main.java'),'utf8'),/int value/);
 }finally{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(temp,{recursive:true,force:true});}
});


test('metadata-only OpenCode compatibility cannot admit a coding task or create an execution adapter',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'codovyn-metadata-no-execution-'));const saved={data:process.env.CODOVYN_DATA_DIR,configuration:process.env.CODOVYN_TASK_CONFIGURATION};let created=false;
 try{
  process.env.CODOVYN_DATA_DIR=join(temp,'data');process.env.CODOVYN_TASK_CONFIGURATION=JSON.stringify({provider:'opencode',modelId:null,permission:'read',routingMode:'manual',reasoning:null,intent:'ask'});
  await assert.rejects(main(['opencode',temp,'Do not execute'],{log(){},error(){}},undefined,undefined,{discoverProvider:async()=>({executionSupported:false,models:[{id:'p',model:'p/model',reasoning:[]}],defaultModel:'p/model'}),createOpenCodeAdapter(){created=true;}}),/execution remains blocked/);
  assert.equal(created,false);assert.equal(existsSync(join(temp,'data','tasks.sqlite')),false);
 }finally{for(const[key,value]of[['CODOVYN_DATA_DIR',saved.data],['CODOVYN_TASK_CONFIGURATION',saved.configuration]])if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(temp,{recursive:true,force:true});}
});
