import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createExtension}=createRequire(import.meta.url)('../extension.cjs');
test('desktop routing previews host settings and requires approval before dispatching a frozen policy',async()=>{
 let open,handler,approved=false;const calls=[],sent=[];const policy={mode:'economy',models:[]};
 const api={commands:{registerCommand: (id, cb) => { if (id === 'codovyn.open') open = cb;return {dispose(){}};}},ViewColumn:{Beside:2},Uri:{joinPath:(_, ...p)=>p.join('/')},
 workspace:{isTrusted:true,workspaceFolders:[{name:'repo',uri:{fsPath:'/repo'}}],getConfiguration:()=>({get:key=>key==='routingPolicy'?new Proxy(policy,{}):'node'})},
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

test('task model and permission overrides are matched to the validated local catalogue', async () => {
  let open, handler; const sent = []; const calls = [];
  const model = { id: 'codex-fast', provider: 'codex', model: 'configured-codex-id', capabilities: ['streaming','tools','writes'],
    reasoning: ['low'], quality: 70, reliability: 1, availability: 'available', price: null };
  const policy = { mode: 'balanced', models: [model], requiredCapabilities: ['streaming'], tokens: { input: 100, output: 100 } };
  const api = {
    commands: { registerCommand: (id, cb) => { if (id === 'codovyn.open') open = cb; return { dispose() {} }; } },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_, ...parts) => parts.join('/') },
    workspace: { isTrusted: true, workspaceFolders: [{ name: 'repo', uri: { fsPath: '/repo' } }],
      getConfiguration: () => ({ get: key => key === 'routingPolicy' ? policy : 'node' }) },
    window: { showWarningMessage: async (_, _options, choice) => choice,
      createWebviewPanel: () => ({ webview: { cspSource: 'x', asWebviewUri: x => x,
        onDidReceiveMessage: cb => { handler = cb; }, postMessage: message => sent.push(message) } }) },
  };
  const runner = async (_, args, options) => {
    calls.push({ args, options });
    return args.includes('route') ? { routing: { selected: { provider: 'codex', model: model.model, reasoning: 'low', estimatedUsd: null } } }
      : { status: 'completed', taskId: 'selected-model-task' };
  };
  createExtension(api, runner).activate({ extensionUri: 'root', extensionPath: '/extension', globalStorageUri: { fsPath: '/data' }, subscriptions: [] });
  open();
  await handler({ type: 'run', requestId: '32345678-1234-1234-1234-123456789abc', request: 'Implement a test',
    taskConfiguration: { provider: 'codex', modelId: model.id, permission: 'read-write', routingMode: 'manual', reasoning: 'low' } });
  const routeCall = calls.find(call => call.args.includes('route'));
  assert.ok(routeCall);
  const frozen = JSON.parse(routeCall.options.env.CODOVYN_ROUTING_POLICY);
  assert.equal(frozen.mode, 'custom');
  assert.equal(frozen.customModel, model.id);
  assert.equal(frozen.reasoning, 'low');
  assert.ok(frozen.requiredCapabilities.includes('writes'));
  assert.equal(calls.find(call => !call.args.includes('route')).args[1], 'routed-edit');
  await handler({ type: 'run', requestId: '42345678-1234-1234-1234-123456789abc', request: 'Use arbitrary model',
    taskConfiguration: { provider: 'codex', modelId: 'not-in-catalogue', permission: 'read', routingMode: 'manual', reasoning: null } });
  assert.equal(calls.filter(call => call.args.includes('route')).length, 1);
  assert.ok(sent.some(message => message.type === 'error' && /Routing could not authorize/.test(message.text)));
});
