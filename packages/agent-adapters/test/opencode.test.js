import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';import {join}from'node:path';
import {parseOpenCodeModels,createOpenCodeAdapter,resolveOpenCodeCommand,inspectOpenCodeInstallation}from'../src/opencode.js';
import {createContextFlow,digest} from '../../agent-core/src/contextflow.js';
import {openCodeBoundary}from'../src/opencode-sandbox.js';

test('OpenCode catalogue parser bounds plain machine output without terminal scraping or invented access',()=>{
 const list=parseOpenCodeModels('provider/model\nprovider/model\nother/family/model\n');assert.equal(list.length,2);assert.equal(list[0].availability,'unknown');assert.equal(list[0].source,'discovered');
 for(const input of ['\x1b[32mprovider/model','Models available: provider/model','token=secret','x'.repeat(262145),Array(513).fill('p/model').join('\n')])assert.throws(()=>parseOpenCodeModels(input));
 assert.throws(()=>resolveOpenCodeCommand('relative/path'));assert.throws(()=>resolveOpenCodeCommand('/missing/opencode'));
});
test('OpenCode installation diagnostics reject incompatible versions and malformed output',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'codovyn-opencode-version-'));
 try {for(const [output,expected] of [['2.1.2',true],['2.1.1',false],['unrecognized',null]]) {
  const command=join(directory,'opencode');writeFileSync(command,'#!'+process.execPath+'\nconsole.log('+JSON.stringify(output)+')',{mode:0o700});
  if(expected===null)await assert.rejects(inspectOpenCodeInstallation(command),/Unrecognized/);else assert.equal((await inspectOpenCodeInstallation(command)).compatible,expected);
 }}finally{rmSync(directory,{recursive:true,force:true});}
});
test('macOS boundary blocks original writes, private external reads, symlink escapes, Git mutations and shell execution', {skip:process.platform!=='darwin'},()=>{
 const temp=mkdtempSync(join(tmpdir(),'codovyn-opencode-boundary-'));const repo=join(temp,'repo'),state=join(temp,'state'),outside=join(temp,'outside');mkdirSync(repo);writeFileSync(outside,'private');writeFileSync(join(repo,'file'),'baseline');mkdirSync(join(repo,'.git'));writeFileSync(join(repo,'.env'),'secret');symlinkSync(outside,join(repo,'escape'));
 try{
  for(const write of [false,true]){
   const boundary=openCodeBoundary({cwd:repo,stateDirectory:state,command:process.execPath,write});
   const script=`const fs=require('fs'),cp=require('child_process');let blocked=0;for(const action of [()=>fs.writeFileSync(${JSON.stringify(outside)},'bad'),()=>fs.readFileSync(${JSON.stringify(outside)}),()=>fs.readFileSync('.env'),()=>fs.readFileSync('escape'),()=>fs.writeFileSync('escape','bad'),()=>fs.writeFileSync('.git/config','bad'),()=>cp.execFileSync('/bin/sh',['-c','true'])]){try{action();}catch{blocked++;}}fs.writeFileSync(${JSON.stringify(join(state,'runtime'))},'ok');let local=false;try{fs.writeFileSync('file','draft');local=true;}catch{}console.log(JSON.stringify({blocked,local}));`;
   const result=JSON.parse(execFileSync(boundary.command,[...boundary.prefixArgs,'-e',script],{cwd:boundary.cwd,env:boundary.env,timeout:5000,encoding:'utf8',stdio:['pipe','pipe','pipe']}));
   assert.equal(result.blocked,7);assert.equal(result.local,write);assert.equal(readFileSync(outside,'utf8'),'private');
  }
  assert.throws(()=>openCodeBoundary({cwd:repo,stateDirectory:temp,command:process.execPath}),/outside/);
  writeFileSync(join(repo,'opencode.json'),'{}');assert.throws(()=>openCodeBoundary({cwd:repo,stateDirectory:state,command:process.execPath}),/refuses project/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
const fixture=(behavior='success')=>`const rl=require('readline').createInterface({input:process.stdin});let currentModel='p/default',effort='default',mode='plan';const config=()=>[{id:'model',type:'select',currentValue:currentModel,options:[{value:'p/default'},{value:'p/model'}]},{id:'effort',type:'select',currentValue:effort,options:[{value:'default'},{value:'deep'}]},{id:'mode',type:'select',currentValue:mode,options:[{value:'plan'},{value:'build'}]}];const send=m=>console.log(JSON.stringify({jsonrpc:'2.0',...m}));rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1}});else if(m.method==='session/new')send({id:m.id,result:{sessionId:'fixture-session',configOptions:config()}});else if(m.method==='session/set_config_option'){if(m.params.configId==='model')currentModel=m.params.value;if(m.params.configId==='effort')effort=m.params.value;if(m.params.configId==='mode'){mode=m.params.value;if(${JSON.stringify(behavior==='mode-reset')})effort='default';}send({id:m.id,result:{configOptions:config()}});}else if(m.method==='session/prompt'){${behavior==='hang'?"return;":behavior==='client-write'?"send({id:'client-write',method:'fs/write_text_file',params:{path:'/outside/file',content:'denied'}});send({id:m.id,result:{stopReason:'end_turn'}});":behavior==='violation'?"send({id:'permission',method:'session/request_permission',params:{sessionId:'fixture-session',toolCall:{kind:'execute',locations:[]},options:[{kind:'allow_once',optionId:'once'}]}});send({id:m.id,result:{stopReason:'end_turn'}});":"send({method:'session/update',params:{sessionId:'fixture-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:currentModel+' '+effort}}}});send({id:m.id,result:{stopReason:'end_turn'}});"}}});`;
function adapter(repo,behavior,extra={}){const runtime={inspect:async()=>({compatible:true,command:process.execPath}),boundary:()=>({command:process.execPath,prefixArgs:['-e',fixture(behavior)],cwd:realpathSync(repo),env:process.env})};return createOpenCodeAdapter({cwd:repo,stateDirectory:join(repo,'unused'),model:'p/model',reasoning:'deep',...extra},runtime);}
test('OpenCode ACP applies exact model/variant and normalizes streamed completion',async()=>{
 const agent=adapter(process.cwd(),'success');const events=[];
 for await(const event of agent.run({handoff:{request:'Explain',snapshot:{}}}))events.push(event);
 assert.equal(events.find(e=>e.type==='text').text,'p/model deep');assert.equal(events.at(-1).type,'completed');assert.equal(events[0].sessionId,'fixture-session');
});
test('OpenCode refuses unsupported model/variant and denied execution never reports completion',async()=>{
 for(const extra of [{model:'p/missing'},{reasoning:'invented'}])await assert.rejects(async()=>{for await(const event of adapter(process.cwd(),'success',extra).run({handoff:{request:'Explain',snapshot:{}}})){}},/unsupported|not advertised/);
 await assert.rejects(async()=>{for await(const event of adapter(process.cwd(),'violation').run({handoff:{request:'Explain',snapshot:{}}})){}},/permission request was denied/);
 await assert.rejects(async()=>{for await(const event of adapter(process.cwd(),'client-write').run({handoff:{request:'Explain',snapshot:{}}})){}},/unadvertised client capability/);
 await assert.rejects(async()=>{for await(const event of adapter(process.cwd(),'mode-reset').run({handoff:{request:'Explain',snapshot:{}}})){}},/changed the accepted/);
 assert.throws(()=>createOpenCodeAdapter({cwd:process.cwd(),write:true}),/isolated/);
});
test('OpenCode cancellation stops owned ACP process and cannot be mistaken for completion',async()=>{
 const controller=new AbortController();let pid;const timer=setTimeout(()=>controller.abort(),250);
 try{await assert.rejects(async()=>{for await(const event of adapter(process.cwd(),'hang').run({handoff:{request:'Explain',snapshot:{}},signal:controller.signal,execution:{starting(){},spawned:p=>pid=p.pid,stopped(){}}})){}},e=>e.kind==='cancelled');}finally{clearTimeout(timer);}
 assert.throws(()=>process.kill(pid,0));
});

test('OpenCode transmits only the approved ContextFlow packet, without legacy raw history or request',async()=>{
 const packet=createContextFlow({task:{id:'safe-transfer',request:'Continue utility'},snapshot:{root:'/repo',branch:'main',commit:'abc',changedPaths:[]},fingerprint:digest('base'),originalFingerprint:digest('base'),history:[],reason:'user-requested-switch'});
 const code=fixture('success').replace("text:currentModel+' '+effort","text:JSON.stringify(m.params.prompt)");
 const agent=createOpenCodeAdapter({cwd:process.cwd(),stateDirectory:'/unused',model:'p/model'}, {inspect:async()=>({compatible:true,command:process.execPath}),boundary:()=>({command:process.execPath,prefixArgs:['-e',code],cwd:process.cwd(),env:process.env})});
 const output=[];for await(const event of agent.run({handoff:{contextFlow:packet,request:'DO NOT TRANSFER THIS RAW REQUEST',history:[{secret:'never copy'}]}}))if(event.type==='text')output.push(event.text);
 assert.ok(output.join('').includes('Continue utility'));assert.ok(!output.join('').includes('RAW REQUEST'));assert.ok(!output.join('').includes('never copy'));
});
