import {inflateSync,deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync,renameSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join}from'node:path';import{execFileSync,spawn}from'node:child_process';
import{buildRepositoryReader,createRepositoryAuthority,repositoryTool}from'../src/repository-identity.js';
import{manageAgentProcess}from'../src/process.js';
const supported=process.platform==='darwin'&&process.arch==='arm64';let base,reader,index=0;
before(async()=>{if(supported){base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-identity-')));reader=await buildRepositoryReader(join(base,'native'));}});
after(()=>{if(base)rmSync(base,{recursive:true,force:true});});
const env={PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
function git(root,...args){return execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,...args],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function repo({commit=true,separate=false}={}){const root=join(base,`repository ${++index}`);mkdirSync(root);git(root,'init','-q',...(separate?['--separate-git-dir',root+'-git']:[]));if(commit){writeFileSync(join(root,'file'),'initial\n');git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','baseline');}return root;}
const lease=extra=>({id:'identity-test',purpose:'metadata-only',expiresAt:Date.now()+60000,isCurrent:()=>true,...extra});
const auth=(root,extra={})=>createRepositoryAuthority({root,reader,lease:lease(),...extra});
function check(name,fn){test(name,{skip:!supported},fn);}
check('descriptor authority refreshes branch and HEAD without changing stable repository identity',async()=>{
 const root=repo(),a=await auth(root),initial=await a.read();assert.equal(initial.head,git(root,'rev-parse','HEAD'));assert.deepEqual(await a.roots(),[initial.head]);git(root,'checkout','-qb','feature/fresh');const branch=await a.read();assert.equal(branch.branch,'feature/fresh');assert.equal(branch.id,initial.id);assert.notEqual(branch.fingerprint,initial.fingerprint);
 writeFileSync(join(root,'file'),'next\n');git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','next');assert.equal((await a.read()).head,git(root,'rev-parse','HEAD'));assert.deepEqual(await a.roots(),[initial.head]);git(root,'checkout','--detach','-q');assert.equal((await a.read()).branch,null);a.revoke();
});
check('unborn HEAD and packed branch refs are explicit fresh states',async()=>{
 const root=repo({commit:false}),a=await auth(root);assert.equal((await a.read()).unborn,true);assert.deepEqual(await a.roots(),[]);writeFileSync(join(root,'f'),'x');git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','first');git(root,'pack-refs','--all');assert.equal((await a.read()).head,git(root,'rev-parse','HEAD'));a.revoke();
});
check('nested directories work until a new repository or symlink boundary appears',async()=>{
 const root=repo(),a=await auth(root),nested=join(root,'nested');mkdirSync(nested);assert.equal((await a.read(nested)).id,a.identity.id);git(nested,'init','-q');await assert.rejects(a.read(nested),/identity changed/);await assert.rejects(a.read(),/revoked/);const b=await auth(root);await assert.rejects(b.read(base),/Cross-project/);symlinkSync(base,join(root,'escape'));await assert.rejects(b.read(join(root,'escape')),/identity changed/);a.revoke();b.revoke();
});
check('replacement, deletion and Git-directory substitution invalidate prior authorization',async()=>{
 for(const kind of ['root','deleted','git']){const root=repo(),a=await auth(root);if(kind==='git'){renameSync(join(root,'.git'),join(root,'old-git'));git(root,'init','-q');}else{renameSync(root,root+'-old');if(kind==='root'){mkdirSync(root);git(root,'init','-q');}}await assert.rejects(a.read(),/identity changed/);a.revoke();}
});
check('external Git stores and linked worktrees require explicit host metadata authorization',async()=>{
 const root=repo(),common=join(root,'.git'),work=join(base,'linked');git(root,'worktree','add','-qb','linked',work);await assert.rejects(auth(work),/explicit host authorization/);const gd=git(work,'rev-parse','--absolute-git-dir'),a=await auth(work,{gitDirectory:gd,commonDirectory:common});const state=await a.read();assert.equal(state.branch,'linked');assert.equal(state.commonDirectory,common);assert.notEqual(state.gitDirectory,common);assert.deepEqual(await a.roots(),[git(root,'rev-parse','HEAD')]);a.revoke();
 const separate=repo({separate:true});await assert.rejects(auth(separate),/explicit host authorization/);const b=await auth(separate,{gitDirectory:separate+'-git',commonDirectory:separate+'-git'});assert.equal((await b.read()).head,git(separate,'rev-parse','HEAD'));b.revoke();
});
check('configuration/helpers are never evaluated and symbolic Git files cannot escape',async()=>{
 const root=repo(),marker=join(base,'helper-ran');const helper=join(base,'helper');writeFileSync(helper,'#!/bin/sh\necho yes > '+JSON.stringify(marker)+'\n',{mode:0o700});git(root,'config','core.fsmonitor',helper);git(root,'config','credential.helper','!'+helper);git(root,'config','include.path',join(base,'missing-sensitive-config'));const a=await auth(root);assert.ok((await a.read()).head);assert.equal(await repositoryTool(reader.command,['/missing','/missing','/missing','','-','config','bad']).then(r=>r.code),76);assert.throws(()=>readFileSync(marker));const branch=(await a.read()).branch;rmSync(join(root,'.git','refs','heads',branch));symlinkSync(helper,join(root,'.git','refs','heads',branch));await assert.rejects(a.read(),/metadata is unsupported/);a.revoke();
});
check('packed objects, corrupted loose objects and unsupported capabilities fail closed',async()=>{
 const root=repo(),a=await auth(root);git(root,'repack','-ad');git(root,'prune-packed');await assert.rejects(a.roots(),/metadata is unsupported/);const other=repo(),b=await auth(other),oid=(await b.read()).head;const path=join(other,'.git','objects',oid.slice(0,2),oid.slice(2)),content=inflateSync(readFileSync(path));content[content.length-2]^=1;rmSync(path);writeFileSync(path,deflateSync(content));await assert.rejects(b.roots(),/content hash mismatch/);a.revoke();b.revoke();
});
check('expired, revoked and changed leases cannot return metadata',async()=>{
 const root=repo();await assert.rejects(auth(root,{lease:lease({expiresAt:Date.now()-1})}),/expired/);let current=true;const a=await auth(root,{lease:lease({isCurrent:()=>current})});current=false;await assert.rejects(a.read(),/revoked/);const b=await auth(root);b.revoke();await assert.rejects(b.read(),/revoked/);await assert.rejects(auth(root,{lease:lease({purpose:'execution'})}),/metadata lease/);
});
check('native descriptor race barrier rejects a substituted root between validation and use',async()=>{
 const root=repo(),a=await auth(root),race=join(base,'race-reader');const compiled=await repositoryTool('/usr/bin/xcrun',['clang','-D_DARWIN_C_SOURCE','-DCODOVYN_READER_TEST_PAUSE','-O2',fileURLToPath(new URL('../native/repository-reader.c',import.meta.url)),'-o',race]);assert.equal(compiled.code,0);
 const child=spawn(race,[root,join(root,'.git'),join(root,'.git'),'',a.identity.filesystemIdentity,'state',''],{detached:true,stdio:['pipe','pipe','pipe'],env});const life=manageAgentProcess(child);let output='';child.stdout.on('data',d=>output+=d);let expired=false;const timer=setTimeout(()=>{expired=true;life.dispose().catch(()=>{});},3000);
 try{while(!output.includes('PINNED')){await new Promise(r=>setTimeout(r,5));if(expired||child.exitCode!==null||child.signalCode!==null||life.error())throw new Error('Race witness exited before barrier');}renameSync(root,root+'-moved');mkdirSync(root);git(root,'init','-q');child.stdin.end('\n');assert.equal(await life.closed,76);assert.equal(output.trim(),'PINNED');}finally{clearTimeout(timer);await life.dispose();a.revoke();}
});

check('in-place Git pointer mutation at the native race barrier invalidates the read',async()=>{
 const root=repo({separate:true}),a=await auth(root,{gitDirectory:root+'-git',commonDirectory:root+'-git'}),race=join(base,'pointer-race-reader');assert.equal((await repositoryTool('/usr/bin/xcrun',['clang','-D_DARWIN_C_SOURCE','-DCODOVYN_READER_TEST_PAUSE','-O2',fileURLToPath(new URL('../native/repository-reader.c',import.meta.url)),'-o',race])).code,0);
 const child=spawn(race,[root,root+'-git',root+'-git','',a.identity.filesystemIdentity,'state',''],{detached:true,stdio:['pipe','pipe','pipe'],env});const life=manageAgentProcess(child);let output='';child.stdout.on('data',d=>output+=d);let expired=false;const timer=setTimeout(()=>{expired=true;life.dispose().catch(()=>{});},3000);
 try{while(!output.includes('PINNED')){await new Promise(r=>setTimeout(r,5));if(expired||child.exitCode!==null||child.signalCode!==null||life.error())throw new Error('Pointer witness exited before barrier');}writeFileSync(join(root,'.git'),'gitdir: /unapproved/other-repository\n');child.stdin.end('\n');assert.equal(await life.closed,76);assert.equal(output.trim(),'PINNED');}finally{clearTimeout(timer);await life.dispose();a.revoke();}
});

check('host authority refuses an executable stored inside the authorized project',async()=>{
 const root=repo(),command=join(root,'untrusted-location-reader');copyFileSync(reader.command,command);await assert.rejects(auth(root,{reader:{...reader,command}}),/outside project/);
});

check('an observed replacement permanently revokes the authority even if the original pathname is restored',async()=>{
 const root=repo(),a=await auth(root);renameSync(root,root+'-saved');mkdirSync(root);git(root,'init','-q');await assert.rejects(a.read(),/identity changed/);rmSync(root,{recursive:true});renameSync(root+'-saved',root);await assert.rejects(a.read(),/revoked/);const fresh=await auth(root);assert.equal((await fresh.read()).id,a.identity.id);fresh.revoke();a.revoke();
});
