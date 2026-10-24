import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import vm from 'node:vm';
test('provider execution blocker disables both default and previously discovered models without changing other providers',()=>{
 const sandbox={};vm.runInNewContext(readFileSync(new URL('../media/composer.js',import.meta.url),'utf8')+'\nthis.Composer=CodovynComposer;',sandbox);
 const instance=Object.create(sandbox.Composer.prototype);instance.providers=[{id:'opencode',installation:'detected',executionSupported:false,diagnostic:'Git discovery blocked'}];instance.getModels=()=>[{id:'existing',provider:'opencode',model:'p/model',source:'discovered'},{id:'codex',provider:'codex',model:'configured',availability:'unknown'}];
 const entries=instance.entries();assert.equal(entries.find(x=>x.key==='default:opencode').disabled,true);assert.equal(entries.find(x=>x.key==='model:existing').disabled,true);assert.match(entries.find(x=>x.key==='default:opencode').detail,/Git discovery blocked/);assert.ok(!entries.find(x=>x.key==='model:codex').disabled);
});
