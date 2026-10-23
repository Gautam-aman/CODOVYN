import test from 'node:test';
import assert from 'node:assert/strict';
import { AcpConnection } from '../src/acp.js';
const peer = body => `const rl=require('readline').createInterface({input:process.stdin});const send=m=>console.log(JSON.stringify({jsonrpc:'2.0',...m}));${body}`;
const connect = (script, options={}) => new AcpConnection({command:process.execPath,args:['-e',script],cwd:process.cwd(),env:process.env,timeoutMs:2000,...options});

test('ACP correlates out-of-order replies and dispatches typed notifications', async()=>{
 const updates=[];const client=connect(peer(`const list=[];rl.on('line',l=>{const m=JSON.parse(l);if(m.id){list.push(m);if(list.length===2){send({method:'session/update',params:{sessionId:'s',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'hello'}}}});for(const n of list.reverse())send({id:n.id,result:n.params});}}});`),{onUpdate:u=>updates.push(u)});
 try { assert.deepEqual(await Promise.all([client.request('a',{x:1}),client.request('b',{x:2})]),[{x:1},{x:2}]);assert.equal(updates[0].update.content.text,'hello'); }
 finally{await client.dispose();}
});
test('ACP refuses unadvertised client capabilities and never logs remote errors',async()=>{
 const client=connect(peer(`rl.on('line',l=>{const m=JSON.parse(l);if(m.method==='initialize')send({id:'agent-1',method:'terminal/create',params:{command:'dangerous'}});else if(m.id==='agent-1')send({id:1,result:{rejected:m.error.code===-32601}});});`));
 try{assert.deepEqual(await client.request('initialize',{}),{rejected:true});}finally{await client.dispose();}
});
test('ACP malformed, uncorrelated and oversized messages fail closed',async()=>{
 for(const output of [`process.stdout.write('oops\\n')`,`console.log(JSON.stringify({jsonrpc:'2.0',id:900,result:{}}))`,`process.stdout.write('x'.repeat(1048577))`]){
  const client=connect(peer(`rl.on('line',()=>{${output}});`));
  try{await assert.rejects(client.request('initialize',{}));}finally{await client.dispose();}
 }
});
test('ACP timeouts reap an owned process and reject unresolved calls without replay',async()=>{
 let pid,stopped=false;const client=connect(peer(`rl.on('line',()=>{});`),{timeoutMs:300,execution:{starting(){},spawned:p=>{pid=p.pid;},stopped(){stopped=true;}}});
 try{await assert.rejects(client.request('session/prompt',{}),/deadline/);}finally{await client.dispose();}
 assert.equal(stopped,true);assert.throws(()=>process.kill(pid,0));
});
test('ACP rejects outgoing size overflow and missing executables',async()=>{
 const client=connect(peer(`rl.on('line',()=>{});`));
 try{await assert.rejects(client.request('a',{text:'x'.repeat(1048576)}),/size limit/);}finally{await client.dispose();}
 const missing=new AcpConnection({command:'/missing/acp',cwd:process.cwd(),env:process.env});
 try{await assert.rejects(missing.request('initialize',{}));}finally{await missing.dispose();}
});

test('ACP standard authentication/cancellation codes are typed without exposing remote details',async()=>{
 for(const [code,kind]of [[-32000,'authentication'],[-32800,'cancelled'],[429,'fatal']]){
  const client=connect(peer(`rl.on('line',l=>{const m=JSON.parse(l);send({id:m.id,error:{code:${code},message:'private-token-do-not-log'}});});`));
  try{await assert.rejects(client.request('initialize',{}),error=>error.kind===kind&&!error.message.includes('private-token'));}finally{await client.dispose();}
 }
});
test('ACP peer startup failure settles exit before reporting disconnection',async()=>{
 const client=connect('process.exit(2)');try{await assert.rejects(client.request('initialize',{}),/disconnected/);}finally{await client.dispose();}
});
