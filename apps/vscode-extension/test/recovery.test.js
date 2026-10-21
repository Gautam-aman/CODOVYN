import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {createExtension}=createRequire(import.meta.url)('../extension.cjs');
test('recovery controls require trusted host inspection and native confirmation, ignoring renderer fingerprints',async()=>{
 let open,handler,approve=false;const calls=[],sent=[];
 const api={commands:{registerCommand:(_,cb)=>{open=cb;return {dispose(){}};}},ViewColumn:{Beside:2},Uri:{joinPath:(_, ...p)=>p.join('/')},
 workspace:{isTrusted:true,workspaceFolders:[{name:'repo',uri:{fsPath:'/repo'}}],getConfiguration:()=>({get:()=> 'node'})},
 window:{showWarningMessage:async(_,__,label)=>approve?label:undefined,createWebviewPanel:()=>({webview:{cspSource:'x',asWebviewUri:x=>x,onDidReceiveMessage:cb=>handler=cb,postMessage:x=>sent.push(x)}})}};
 const runner=async(_,args)=>{calls.push(args);return args.includes('draft-inspect')?{inspection:{taskId:'task',continuationReady:true,recoverySafe:true,fingerprint:'host-verified'}}:{tasks:[]};};
 createExtension(api,runner).activate({globalState:{get:(key,fallback)=>key.startsWith('codovyn.agentPolicy.')?{primary:'gemini',fallbacks:['codex'],automatic:false,geminiModel:''}:fallback},extensionUri:'root',extensionPath:'/extension',globalStorageUri:{fsPath:'/data'},subscriptions:[]});open();
 await handler({type:'draft-reconcile',id:'task',fingerprint:'forged'});assert.equal(calls.length,0);
 await handler({type:'draft-inspect',id:'task'});
 await handler({type:'draft-reconcile',id:'task'});assert.equal(calls.filter(x=>x.includes('draft-reconcile')).length,0);
 approve=true;api.workspace.isTrusted=false;await handler({type:'draft-reconcile',id:'task'});assert.equal(calls.length,1);
 api.workspace.isTrusted=true;await handler({type:'draft-reconcile',id:'task',fingerprint:'forged'});
 const execution=calls.find(x=>x.includes('draft-reconcile'));assert.ok(execution.includes('host-verified'));assert.ok(!execution.includes('forged'));
 assert.ok(sent.some(x=>x.type==='draft-reconciled'));
 await handler({type:'draft-inspect',id:'task'});await handler({type:'draft-continue',id:'task'});
 assert.ok(calls.find(x=>x.includes('draft-continue')).includes('gemini'));
 assert.ok(sent.some(x=>x.type==='running'));
});
