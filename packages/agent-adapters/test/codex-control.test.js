import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{codexControlBoundary,denyCodexServerRequest}from'../src/codex-control.js';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';import{probeProcess}from'../../../scripts/lib/opencode-git-probe.js';import{createCodexAdapter}from'../src/index.js';
const supported=process.platform==='darwin'&&process.arch==='arm64';
test('Codex pre-action approval handler denies shell, writes, session grants and arbitrary tools',()=>{
 for(const method of ['item/commandExecution/requestApproval','item/fileChange/requestApproval'])assert.deepEqual(denyCodexServerRequest(method),{decision:'cancel'});
 assert.deepEqual(denyCodexServerRequest('item/permissions/requestApproval'),{permissions:{},scope:'turn'});assert.equal(denyCodexServerRequest('item/tool/call').success,false);assert.equal(denyCodexServerRequest('unknown/method'),null);
});
test('legacy real Codex execution is blocked before any subprocess or inference registration',async()=>{
 let started=false;const adapter=createCodexAdapter({cwd:process.cwd(),command:'/must-not-execute-codex'});assert.equal(adapter.executionSupported,false);
 await assert.rejects(async()=>{for await(const e of adapter.run({handoff:{request:'MUST NOT SEND'},execution:{starting(){started=true;}}})){}},/Live Codex execution is blocked/);assert.equal(started,false);
});
test('OS candidate Codex policy denies file/process operations in an independently started native witness',{skip:!supported},async()=>{
 const base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-codex-os-'))),root=join(base,'project'),state=join(base,'private-state');mkdirSync(root);writeFileSync(join(root,'Calculator.java'),'class Calculator {}');writeFileSync(join(base,'outside.txt'),'PRIVATE_WITNESS');mkdirSync(join(root,'.git'));writeFileSync(join(root,'.git','HEAD'),'PROTECTED');
 try{const b=codexControlBoundary({workspace:root,stateDirectory:state,command:process.execPath});writeFileSync(join(state,'home','auth.json'),'AUTH_WITNESS');
  const witness=join(base,'policy-witness');execFileSync('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-Wno-deprecated-declarations','-O2','-fstack-protector-strong',fileURLToPath(new URL('./fixtures/codex-policy-witness.c',import.meta.url)),'-o',witness],{timeout:10000});execFileSync('/usr/bin/codesign',['-s','-','--options','runtime',witness],{timeout:5000,stdio:'pipe'});
  const r=await probeProcess(witness,[b.prefixArgs[1],join(root,'Calculator.java'),join(base,'outside.txt'),join(state,'home','auth.json'),join(root,'Calculator.java'),join(root,'.git','HEAD'),join(base,'escape.txt'),process.execPath],{cwd:b.cwd,env:b.env});assert.equal(r.code,0,JSON.stringify(r));const evidence=JSON.parse(r.stdout);assert.deepEqual(evidence,{reads:3,writes:3,execs:4,state:'state only',hardlinkDenied:1,symlinkReadDenied:1});assert.equal(readFileSync(join(root,'Calculator.java'),'utf8'),'class Calculator {}');assert.equal(readFileSync(join(root,'.git','HEAD'),'utf8'),'PROTECTED');assert.equal(b.env.DYLD_INSERT_LIBRARIES,undefined);assert.equal(b.env.OPENAI_API_KEY,undefined);
 }finally{rmSync(base,{recursive:true,force:true});}
});

test('Codex context metadata cannot use a state directory containing the project',{skip:!supported},()=>{const base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-codex-overlap-')));mkdirSync(join(base,'project'));try{assert.throws(()=>codexControlBoundary({workspace:join(base,'project'),stateDirectory:base,command:process.execPath}),/outside project/);}finally{rmSync(base,{recursive:true,force:true});}});

test('actual sandboxed runtime starts with the root-directory exception but cannot read source, steal credentials or execute helpers',{skip:!supported},async()=>{
 const base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-codex-runtime-os-'))),root=join(base,'project');mkdirSync(root);writeFileSync(join(root,'Calculator.java'),'class Calculator {}');
 try{const b=codexControlBoundary({workspace:root,stateDirectory:join(base,'state'),command:process.execPath});writeFileSync(join(b.env.CODEX_HOME,'auth.json'),'PRIVATE_WITNESS');
 const code=`const fs=require('fs'),cp=require('child_process');let denied=0;for(const p of ${JSON.stringify([join(root,'Calculator.java'),join(b.env.CODEX_HOME,'auth.json')])})try{fs.readFileSync(p)}catch{denied++}for(const exe of ['/bin/sh','/usr/bin/git','/usr/bin/curl',process.execPath]){if(cp.spawnSync(exe,['--version']).error)denied++;}try{fs.writeFileSync(${JSON.stringify(join(b.env.CODEX_HOME,'config.toml'))},'UNSAFE')}catch{denied++;}try{fs.renameSync(${JSON.stringify(join(b.env.CODEX_HOME,'auth.json'))},${JSON.stringify(join(b.env.TMPDIR,'renamed-auth'))})}catch{denied++;}console.log(JSON.stringify({denied,root:fs.statSync('/').isDirectory()}));`;
 const r=await probeProcess(b.command,[...b.prefixArgs,'--openssl-config=/dev/null','-e',code],{cwd:b.cwd,env:b.env});assert.equal(r.code,0,JSON.stringify(r));assert.deepEqual(JSON.parse(r.stdout),{denied:8,root:true});assert.equal(readFileSync(join(root,'Calculator.java'),'utf8'),'class Calculator {}');
 }finally{rmSync(base,{recursive:true,force:true});}
});
