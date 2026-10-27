import test from 'node:test';import assert from 'node:assert/strict';import diagnostics from '../src/opencode-diagnostics.cjs';
import {mkdtempSync,writeFileSync,realpathSync,rmSync,symlinkSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {discoverOpenCode} from '../src/opencode.js';
test('discovery rejects missing, non-directory and aliased workspaces before executable startup',async()=>{
 const base=realpathSync(mkdtempSync(join(tmpdir(),'opencode-workspace-')));try{
  writeFileSync(join(base,'file'),'public witness');symlinkSync(base,join(base,'alias'));
  for(const cwd of [join(base,'missing'),join(base,'file'),join(base,'alias')])await assert.rejects(discoverOpenCode({cwd,configured:'/must-not-execute'}),e=>{const d=diagnostics.diagnostic(e);assert.equal(d.code,'REPOSITORY_IDENTITY_FAILED');assert.equal(JSON.stringify(d).includes(base),false);return true;});
 }finally{rmSync(base,{recursive:true,force:true});}
});
test('OpenCode stage diagnostics preserve stage without exposing raw exceptions or prototype keys',async()=>{const secret='PUBLIC-SECRET-WITNESS /Users/private-account/auth-token';for(const input of [new Error(secret),{code:secret,message:secret},secret,'constructor','__proto__']){const d=diagnostics.diagnostic(input);assert.equal(d.code,'PREPARATION_FAILED');assert.equal(JSON.stringify(d).includes(secret),false);}const error=diagnostics.mark(new Error(secret),'AUTH_CONTEXT_MISSING');assert.equal(diagnostics.diagnostic(error).stage,'authentication-context');await assert.rejects(diagnostics.at('MODEL_DISCOVERY_FAILED',async()=>{throw error;}),e=>diagnostics.diagnostic(e).code==='AUTH_CONTEXT_MISSING');});
test('metadata inspection emits only bounded fixed stages and cannot hide failure or skip cleanup',async()=>{
 const events=[],inspect=diagnostics.inspection(e=>events.push(e));const secret='PRIVATE PATH AND ACCOUNT WITNESS';
 await assert.rejects(inspect('repository-reader',async()=>{throw new Error(secret);}),new RegExp(secret));
 assert.deepEqual(events.map(e=>[e.stage,e.state]),[['repository-reader','started'],['repository-reader','failed']]);assert.equal(JSON.stringify(events).includes(secret),false);assert.ok(events.every(Object.isFrozen));
 await assert.rejects(inspect(secret,()=>1),/Unknown inspection stage/);assert.equal(events.length,2);
 assert.equal(await diagnostics.inspection(()=>{throw new Error(secret);})('provider-cleanup',async()=>42),42);
 for(let i=0;i<40;i++)await inspect('model-catalogue',async()=>null);assert.equal(events.length,64);
});
