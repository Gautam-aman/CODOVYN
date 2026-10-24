/** Isolated, non-inference research. No argument may select an existing project.
 * The experimental allow rule is NEVER used by CODOVYN's execution adapters. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,existsSync,readFileSync,symlinkSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {inspectOpenCodeInstallation,parseOpenCodeModels,openCodeProjectReadiness} from '../packages/agent-adapters/src/opencode.js';
import {openCodeBoundary} from '../packages/agent-adapters/src/opencode-sandbox.js';
import {AcpConnection} from '../packages/agent-adapters/src/acp.js';
import {ownedProcessMembers} from './lib/desktop-process.js';
import {probeProcess,buildProbeShim} from './lib/opencode-git-probe.js';

if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('This probe requires the pinned macOS ARM64 boundary');
if(process.argv.length!==2)throw new Error('This probe accepts no project or command arguments');
const installation=await inspectOpenCodeInstallation();
if(!installation.compatible)throw new Error('This probe supports only official OpenCode 2.1.2');
const base=realpathSync(mkdtempSync(join(tmpdir(),'codovyn-phase13-git-')));
const report={version:1,source:'Phase 13 research boundary, NOT production integration',inferenceRequests:0,openCodeVersion:installation.version,positive:[],negative:[],metadata:[],blockingFindings:[],processes:[]};
const cleanEnv={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,LANG:'en_US.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
async function command(executable,args,options={}){const r=await probeProcess(executable,args,{env:cleanEnv,...options});report.processes.push({pid:r.pid,code:r.code,survivors:r.survivors,elapsedMs:r.elapsedMs});return r;}
async function git(root,...args){const r=await command('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,...args]);if(r.code!==0)throw new Error('Disposable fixture Git setup failed');return r.stdout.trim();}
async function repository(name,{commit=true,separate=false}={}){const root=join(base,name);mkdirSync(root);await git(root,'init','-q',...(separate?['--separate-git-dir',join(base,`${name}-metadata`)]:[]));writeFileSync(join(root,'README.md'),'Disposable OpenCode Git discovery fixture.\n');if(commit){await git(root,'add','README.md');await git(root,'-c','user.name=CODOVYN Test','-c','user.email=test@example.invalid','commit','-qm','baseline');}return root;}
async function snapshot(root){const known=await git(root,'rev-parse','--git-dir','--git-common-dir','--show-toplevel');const lines=known.split('\n');const absolute=path=>realpathSync(path.startsWith('/')?path:join(root,path));const get=async(...args)=>(await command('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,...args])).stdout.trim();return {root:absolute(lines[2]),gitDirectory:absolute(lines[0]),commonDirectory:absolute(lines[1]),head:await get('rev-parse','--verify','HEAD'),roots:await get('rev-list','--max-parents=0','HEAD'),branch:await get('symbolic-ref','--quiet','--short','HEAD')};}
function experimentalBoundary(root,shim,name,write=false){const b=openCodeBoundary({cwd:root,stateDirectory:join(base,`state-${name}`),command:installation.command,write});b.prefixArgs[1]+=`\n(allow process-exec (literal ${JSON.stringify(shim.command)}))\n(allow file-read* (subpath ${JSON.stringify(shim.bin)}))\n(deny file-write* (subpath ${JSON.stringify(shim.bin)}))`;b.env.PATH=shim.bin+':'+b.env.PATH;return b;}
async function shimCall(shim,root,args,extra={}){const profile=`(version 1)(allow default)(deny file-write*)(deny process-exec)(allow process-exec (literal ${JSON.stringify(shim.command)}))`;return command('/usr/bin/sandbox-exec',['-p',profile,shim.command,...args],{cwd:root,env:{...cleanEnv,...extra}});}
const discovery=['rev-parse','--git-dir','--git-common-dir','--show-toplevel'];
try{
 const ordinary=await repository('ordinary'),empty=await repository('empty',{commit:false}),feature=await repository('feature'),detached=await repository('detached'),spaced=await repository('path with spaces'),separate=await repository('separate',{separate:true});
 await git(feature,'checkout','-qb','feature/test');await git(detached,'checkout','--detach','-q');
 const linked=join(base,'linked');await git(ordinary,'worktree','add','-q','-b','linked',linked);mkdirSync(join(ordinary,'nested'));
 const cases=[['ordinary',ordinary],['empty',empty],['feature-branch',feature],['detached-head',detached],['linked-worktree',linked],['spaces',spaced],['nested-directory',ordinary],['separate-common-directory',separate]];
 let mainShim,mainSnapshot;
 for(const [name,root] of cases){const dir=join(base,`build-${name}`);mkdirSync(dir);const data=await snapshot(root),shim=await buildProbeShim(dir,data);const cwd=name==='nested-directory'?join(root,'nested'):root;const r=await shimCall(shim,cwd,discovery);assert.equal(r.code,0,name);assert.equal(r.stdout,[data.gitDirectory,data.commonDirectory,data.root].join('\n')+'\n');report.positive.push({name,discoveryMs:r.elapsedMs,buildMs:shim.elapsedMs});
  if(name==='ordinary'){mainShim=shim;mainSnapshot=data;}
  if(['ordinary','linked-worktree'].includes(name)){
   const b=experimentalBoundary(root,shim,name),started=performance.now();
   const catalogue=await command(b.command,[...b.prefixArgs,'models','--standalone'],{cwd:b.cwd,env:b.env});assert.equal(catalogue.code,0,'actual OpenCode model discovery');const models=parseOpenCodeModels(catalogue.stdout);assert.ok(models.length>0);
   const connection=new AcpConnection({...b,args:[...b.prefixArgs,'acp']});let session;
   try{const init=await connection.request('initialize',{protocolVersion:1,clientInfo:{name:'codovyn-metadata-probe',version:'1'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});assert.equal(init.protocolVersion,1);session=await connection.request('session/new',{cwd:b.cwd,mcpServers:[]});assert.ok(session.sessionId);assert.ok(session.configOptions?.some(entry=>entry.id==='model'));}
   finally{await connection.dispose();}
   const survivors=await ownedProcessMembers(connection.child.pid);assert.deepEqual(survivors,[]);report.processes.push({pid:connection.child.pid,survivors});report.metadata.push({name,acpSessionCreated:true,sessionPromptSent:false,models:models.length,defaultModel:session.configOptions.find(e=>e.id==='model')?.currentValue,variantOptions:session.configOptions.find(e=>e.id==='effort')?.options?.length??0,catalogueMs:catalogue.elapsedMs,sessionAndCatalogueMs:performance.now()-started,authentication:'unknown'});
  }
 }
 const nonGit=join(base,'non-git');mkdirSync(nonGit);const noGitBoundary=openCodeBoundary({cwd:nonGit,stateDirectory:join(base,'state-non-git'),command:installation.command});const nonGitResult=await command(noGitBoundary.command,[...noGitBoundary.prefixArgs,'models','--standalone'],{cwd:noGitBoundary.cwd,env:noGitBoundary.env});assert.equal(nonGitResult.code,0);report.positive.push({name:'non-git-original-boundary',models:parseOpenCodeModels(nonGitResult.stdout).length});
 for(const args of [['push'],['commit','-m','forbidden'],['config','core.fsmonitor','evil'],['reset','--hard'],['-C',separate,...discovery],[...discovery,'--help'],['--git-dir',mainSnapshot.gitDirectory,'--work-tree',separate,...discovery],['worktree','list','--porcelain'],['remote','get-url','origin']]){const r=await shimCall(mainShim,ordinary,args);assert.equal(r.code,126);report.negative.push({name:`shim rejects ${args[0]}`,denied:true});}
 const marker=join(base,'forbidden-helper-marker'),hooks=join(base,'hostile-hooks');mkdirSync(hooks);writeFileSync(join(hooks,'pre-commit'),'#!/bin/sh\necho invoked > '+JSON.stringify(marker)+'\n',{mode:0o700});
 await git(ordinary,'config','core.hooksPath',hooks);await git(ordinary,'config','core.fsmonitor',join(hooks,'pre-commit'));await git(ordinary,'config','credential.helper','!'+join(hooks,'pre-commit'));
 for(const args of [discovery,['commit','-m','forbidden'],['push']])await shimCall(mainShim,ordinary,args);
 assert.equal(existsSync(marker),false);report.negative.push({name:'configured hook, fsmonitor and credential helper markers remain absent',denied:true});
 const override=await shimCall(mainShim,ordinary,discovery,{GIT_DIR:join(base,'unrelated'),GIT_WORK_TREE:separate,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'alias.rev-parse',GIT_CONFIG_VALUE_0:'!touch /untrusted'});assert.equal(override.stdout,[mainSnapshot.gitDirectory,mainSnapshot.commonDirectory,mainSnapshot.root].join('\n')+'\n');report.negative.push({name:'environment cannot redirect fixed replies',denied:true});
 const foreign=await shimCall(mainShim,separate,discovery);assert.equal(foreign.code,126);symlinkSync(separate,join(ordinary,'escape'));const escape=await shimCall(mainShim,join(ordinary,'escape'),discovery);assert.equal(escape.code,126);report.negative.push({name:'foreign cwd and symlink cwd escape',denied:true});
 // Actual kernel denial tests use the production sandbox plus the research shim,
 // but a trusted Node witness instead of a provider. No provider prompt is sent.
 const external=join(base,'external-marker');writeFileSync(external,'unchanged');
 for(const write of [false,true]){
  const b=experimentalBoundary(ordinary,mainShim,`witness-${write}`,write);b.prefixArgs[2]=realpathSync(process.execPath);b.prefixArgs[1]+=`\n(allow process-exec (literal ${JSON.stringify(realpathSync(process.execPath))}))`;
  const code=`const f=require('fs'),c=require('child_process');let denied=0;for(const action of [()=>c.execFileSync('/bin/sh',['-c','true']),()=>c.execFileSync('/usr/bin/git',['push']),()=>c.execFileSync('/usr/bin/git',['config','x.y','z']),()=>c.execFileSync('/usr/bin/git',['commit','-m','x']),()=>c.execFileSync('/usr/bin/git',['reset','--hard']),()=>c.execFileSync('/usr/bin/true',[]),()=>f.writeFileSync(${JSON.stringify(external)},'bad'),()=>f.writeFileSync('.git/config','bad'),()=>f.readFileSync('escape/README.md'),()=>f.writeFileSync(${JSON.stringify(mainShim.command)},'bad')]){try{action()}catch{denied++}}console.log(JSON.stringify({denied}));`;
  const result=await command(b.command,[...b.prefixArgs,'-e',code],{cwd:b.cwd,env:b.env});assert.equal(result.code,0);assert.equal(JSON.parse(result.stdout).denied,10);assert.equal(readFileSync(external,'utf8'),'unchanged');report.negative.push({name:`OS witness ${write?'draft-write':'read-only'}: shell, real Git, external/symlink access, metadata and shim mutation`,denied:true,operations:10});
 }
 // Counterexamples are evidence AGAINST enabling this snapshot prototype.
 await git(ordinary,'checkout','-qb','changed-after-snapshot');const stale=await shimCall(mainShim,ordinary,['symbolic-ref','--quiet','--short','HEAD']);assert.equal(stale.stdout.trim(),mainSnapshot.branch);report.blockingFindings.push('Immutable shim replies become stale after host repository changes; no freshness attestation.');
 const nested=join(ordinary,'nested');await git(nested,'init','-q');const switched=await shimCall(mainShim,nested,discovery);assert.equal(switched.code,0);report.blockingFindings.push('Nested repository insertion does not invalidate ancestor-bound replies.');
 renameSync(ordinary,join(base,'old-ordinary'));mkdirSync(ordinary);const replaced=await shimCall(mainShim,ordinary,discovery);assert.equal(replaced.code,0);report.blockingFindings.push('Replacing the root directory at the same pathname does not invalidate compiled snapshot identity.');
 const aliasBoundary=experimentalBoundary(ordinary,mainShim,'hardlink-witness',true);aliasBoundary.prefixArgs[2]=realpathSync(process.execPath);aliasBoundary.prefixArgs[1]+=`\n(allow process-exec (literal ${JSON.stringify(realpathSync(process.execPath))}))`;
 const aliasCode=`const f=require('fs');let linked=false,changed=false;try{f.linkSync(${JSON.stringify(mainShim.command)},'shim-alias');linked=true;f.chmodSync('shim-alias',0o700);f.appendFileSync('shim-alias','invalidated');changed=true;}catch{}console.log(JSON.stringify({linked,changed}));`;
 const aliasResult=await command(aliasBoundary.command,[...aliasBoundary.prefixArgs,'-e',aliasCode],{cwd:aliasBoundary.cwd,env:aliasBoundary.env});assert.equal(aliasResult.code,0);report.hardlinkWitness=JSON.parse(aliasResult.stdout);
 if(report.hardlinkWitness.changed)report.blockingFindings.push('A writable in-project hardlink can modify the shim inode despite the outside-path write denial.');
 assert.equal(openCodeProjectReadiness(linked).executionSupported,false);report.productionExecutionEnabled=false;
 report.remainingReview=['Host collector sandbox and untrusted Git config/includes','Root/metadata identity, freshness and TOCTOU','Linked-worktree external common-dir authorization','Hardened-runtime environment injection and executable integrity','Immutable metadata lifecycle binding to task leases/approvals','Safe upgrade and installation/toolchain strategy'];
 report.result='Feasibility confirmed; production compatibility BLOCKED. Counterexamples intentionally prevent promoting this probe.';
}finally{
 const output=join(process.cwd(),'dist','desktop','opencode-git-probe.json');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({evidence:output,disposableDirectory:base,positive:report.positive.length,negative:report.negative.length,metadata:report.metadata.length,blockingFindings:report.blockingFindings,result:report.result}));
}
