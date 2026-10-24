import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createExtension}=createRequire(import.meta.url)('../extension.cjs');
const config={provider:'opencode',modelId:null,reasoning:null,permission:'read',routingMode:'manual',intent:'ask'};
function host(){let open,handler,approve=false;const calls=[],sent=[];const transfer={id:'transfer',taskId:'task',status:'prepared',hash:'trusted-host-hash',expiresAt:Date.now()+600000,configuration:config,metrics:{utf8Bytes:1234},packet:{handoff:{model:'provider/model'},context:{files:[]}}};
 const api={commands:{registerCommand:(id,cb)=>{if(id==='codovyn.open')open=cb;return{dispose(){}};}},ViewColumn:{Beside:2},Uri:{joinPath:(_, ...p)=>p.join('/')},workspace:{isTrusted:true,workspaceFolders:[{name:'repo',uri:{fsPath:'/repo'}}],getConfiguration:()=>({get:()=> 'node'})},window:{showWarningMessage:async(_,__,label)=>approve?label:undefined,createWebviewPanel:()=>({webview:{cspSource:'x',asWebviewUri:x=>x,onDidReceiveMessage:cb=>handler=cb,postMessage:x=>sent.push(x)}})}};
 const runner=async(_,args,options)=>{calls.push(args);if(args.includes('contextflow-run')){options.onEvent({kind:'contextflow-segment-started',data:{}},'task');options.onEvent({kind:'agent-event',data:{event:{type:'text',text:'continued safely'}}},'task');return{taskId:'task',status:'completed'};}return{transfer,tasks:[]};};
 createExtension(api,runner).activate({extensionUri:'root',extensionPath:'/extension',globalStorageUri:{fsPath:'/data'},subscriptions:[]});open();return{api,calls,sent,transfer,handle:x=>handler(x),approve:()=>approve=true};}
test('ContextFlow requires a trusted host preview and native approval; renderer hashes and packets cannot authorize execution',async()=>{
 const h=host();await h.handle({type:'contextflow-run',id:'transfer',hash:'forged',packet:{}});assert.ok(!h.calls.some(c=>c.some(x=>String(x).startsWith('contextflow-'))));
 await h.handle({type:'contextflow-prepare',id:'task',configuration:config});assert.ok(h.calls.some(c=>c.includes('--manual')));
 await h.handle({type:'contextflow-run',id:'transfer',hash:'forged'});assert.equal(h.calls.filter(c=>c.includes('contextflow-run')).length,0);
 h.approve();h.api.workspace.isTrusted=false;const count=h.calls.length;await h.handle({type:'contextflow-run',id:'transfer'});assert.equal(h.calls.length,count);
 h.api.workspace.isTrusted=true;await h.handle({type:'contextflow-run',id:'transfer',hash:'forged'});
 const run=h.calls.find(c=>c.includes('contextflow-run'));assert.ok(run.includes('trusted-host-hash'));assert.ok(!run.includes('forged'));assert.ok(run.includes('--yes'));
 assert.ok(h.sent.some(x=>x.type==='running'&&x.continuation&&x.taskId==='task'));assert.ok(h.sent.some(x=>x.type==='result'&&x.timeline.some(e=>e.type==='segment')));
});
test('ContextFlow rejection is a durable local action and changed previews refuse execution',async()=>{
 const h=host();await h.handle({type:'contextflow-read',id:'task'});await h.handle({type:'contextflow-reject',id:'transfer'});assert.ok(h.calls.some(c=>c.includes('contextflow-reject')));assert.ok(!h.calls.some(c=>c.includes('contextflow-run')));
 const second=host();await second.handle({type:'contextflow-read',id:'task'});second.transfer.status='interrupted';second.approve();await second.handle({type:'contextflow-run',id:'transfer'});assert.ok(!second.calls.some(c=>c.includes('contextflow-run')));
});
