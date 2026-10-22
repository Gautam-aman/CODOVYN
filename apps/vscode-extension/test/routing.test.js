import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createExtension}=createRequire(import.meta.url)('../extension.cjs');
test('desktop routing previews host settings and requires approval before dispatching a frozen policy',async()=>{
 let open,handler,approved=false;const calls=[],sent=[];const policy={mode:'economy',models:[]};
 const api={commands:{registerCommand:(_,cb)=>{open=cb;return {dispose(){}};}},ViewColumn:{Beside:2},Uri:{joinPath:(_, ...p)=>p.join('/')},
 workspace:{isTrusted:true,workspaceFolders:[{name:'repo',uri:{fsPath:'/repo'}}],getConfiguration:()=>({get:key=>key==='routingPolicy'?policy:'node'})},
 window:{showWarningMessage:async(_,options,label)=>{assert.match(options.detail,/spending is not capped/);policy.mode='performance';return approved?label:undefined;},createWebviewPanel:()=>({webview:{cspSource:'x',asWebviewUri:x=>x,onDidReceiveMessage:cb=>handler=cb,postMessage:x=>sent.push(x)}})}};
 const runner=async(_,args,options)=>{calls.push({args,options});return args.includes('route')?{routing:{selected:{provider:'gemini',model:'fixture',estimatedUsd:null}}}:{tasks:[],status:'completed',taskId:'task'};};
 createExtension(api,runner).activate({extensionUri:'root',extensionPath:'/extension',globalStorageUri:{fsPath:'/data'},subscriptions:[]});open();
 await handler({type:'run',mode:'routed',request:'Explain',routingPolicy:{secret:'forged'}});
 assert.equal(calls.filter(c=>c.args.includes('routed')).length,0);
 approved=true;policy.mode='economy';await handler({type:'run',mode:'routed',request:'Explain'});
 const execution=calls.find(c=>c.args.includes('routed'));assert.equal(JSON.parse(execution.options.env.CODOVYN_ROUTING_POLICY).mode,'economy');
 const preview=calls.find(c=>c.args.includes('route'));
 assert.equal(execution.options.env.CODOVYN_SESSION_ID,preview.options.env.CODOVYN_SESSION_ID);
 assert.equal(execution.options.env.CODOVYN_DATA_DIR,preview.options.env.CODOVYN_DATA_DIR);
 assert.ok(sent.some(m=>m.type==='routing-preview'));
});
