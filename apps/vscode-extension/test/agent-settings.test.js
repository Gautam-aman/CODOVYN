import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createExtension } = createRequire(import.meta.url)('../extension.cjs');
test('project provider preferences persist with validation and reach only configured executions', async () => {
  let open, handler;
  const state=new Map(); const sent=[]; const calls=[];
  const folders=[{name:'A',uri:{fsPath:'/a'}},{name:'B',uri:{fsPath:'/b'}}];
  const api={commands:{registerCommand:(_,cb)=>{open=cb;return {dispose(){}};}},window:{
    createWebviewPanel:()=>({webview:{cspSource:'x',asWebviewUri:x=>x,onDidReceiveMessage:cb=>{handler=cb;},postMessage:x=>sent.push(x)}})},
    ViewColumn:{Beside:2},Uri:{joinPath:(_, ...p)=>p.join('/')},workspace:{workspaceFolders:folders,isTrusted:true,getConfiguration:()=>({get:()=> 'node'})}};
  const runner=async(command,args,options)=>{calls.push({args,options});return args.includes('tasks')?{tasks:[]}:args.includes('agents')?{agents:[{id:'codex',authentication:'unknown'}]}:{status:'completed',taskId:'test',events:[]};};
  const context={extensionUri:'root',extensionPath:'/extension',globalStorageUri:{fsPath:'/private-data'},subscriptions:[],globalState:{get:(k,f)=>state.get(k)??f,update:async(k,v)=>state.set(k,v)}};
  createExtension(api,runner).activate(context);open();
  const policy={primary:'gemini',fallbacks:['codex','claude'],automatic:true,geminiModel:'explicit-model'};
  await handler({type:'agent-policy-save',policy});
  assert.deepEqual(sent.at(-1).policy,policy);
  await handler({type:'agent-policy-save',policy:{...policy,command:'sh'}});
  assert.deepEqual(sent.at(-1).policy,policy);
  await handler({type:'run',mode:'configured',request:'Inspect'});
  const execution=calls.find(c=>c.args.includes('configured'));
  assert.deepEqual(JSON.parse(execution.options.env.CODOVYN_AGENT_POLICY),policy);
  await handler({type:'project-select',root:'/b'});
  await handler({type:'ready'});
  assert.equal(sent.findLast(x=>x.type==='agent-policy').policy.primary,'codex');
  await handler({type:'project-select',root:'/a'});open();await handler({type:'ready'});
  assert.deepEqual(sent.findLast(x=>x.type==='agent-policy').policy,policy);
  await handler({type:'agent-diagnostics'});
  assert.ok(calls.some(c=>c.args.includes('agents')));
  assert.equal(sent.at(-1).agents[0].authentication,'unknown');
});
