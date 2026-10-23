import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const{createExtension}=createRequire(import.meta.url)('../extension.cjs');
test('provider connections validate model requests, cache metadata and require native setup approval',async()=>{
 let open,handler,view,approved=false;const calls=[],sent=[],terminals=[],commands=[];
 const api={commands:{registerCommand:(id,callback)=>{if(id==='codovyn.open')open=callback;return{dispose(){}};},executeCommand:async(...args)=>commands.push(args)},Uri:{joinPath:(_, ...parts)=>parts.join('/')},ViewColumn:{Beside:2},workspace:{isTrusted:true,workspaceFolders:[{uri:{fsPath:'/sample'}}],getConfiguration:()=>({get:(_,fallback)=>fallback})},window:{showWarningMessage:async(_,__,choice)=>approved?choice:undefined,createTerminal:options=>{const terminal={options,show(){},sendText:text=>terminal.command=text};terminals.push(terminal);return terminal;},createWebviewPanel:()=>({webview:view={cspSource:'x',asWebviewUri:x=>x,onDidReceiveMessage:callback=>handler=callback,postMessage:data=>sent.push(data)}})}};
 const runner=async(_,args)=>{calls.push(args);return args.includes('provider-models')?{metadata:{models:[],defaultModel:null}}:{context:{command:"/opt/agent'$(do-not-execute)",stateDirectory:'/private/context',environment:{HOME:'/private/context'}}};};
 createExtension(api,runner).activate({extensionUri:'root',extensionPath:'/extension',globalStorageUri:{fsPath:'/private-data'},subscriptions:[]});open();assert.equal(view.html.includes('__codovynNativeFixtureOnly'),false,'Ordinary webviews must not expose fixture transport controls');assert.equal(view.html.includes('native-chat-harness.js'),false);
 await handler({type:'provider-models',provider:'shell'});await handler({type:'provider-models',provider:'opencode',modelId:'$(unsafe)'});assert.equal(calls.length,0);
 await handler({type:'provider-models',provider:'opencode'});await handler({type:'provider-models',provider:'opencode'});assert.equal(calls.length,1);
 await handler({type:'provider-models',provider:'opencode',refresh:true});assert.equal(calls.length,2);
 await handler({type:'provider-setup',provider:'opencode'});assert.equal(terminals.length,0);
 approved=true;await handler({type:'provider-setup',provider:'opencode'});assert.equal(terminals.length,1);assert.equal(terminals[0].options.strictEnv,true);assert.equal(terminals[0].options.cwd,'/private/context');
 assert.equal(terminals[0].command,`'/opt/agent'"'"'$(do-not-execute)' auth login --standalone`);
 assert.equal(sent.some(data=>data.context||data.environment),false);
 await handler({type:'provider-configure',provider:'opencode'});assert.deepEqual(commands,[['workbench.action.openSettings','codovyn.opencodeCliPath']]);
});
