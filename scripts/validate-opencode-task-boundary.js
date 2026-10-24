/** Real TaskEngine + real OpenCode ACP, with host-invoked file reads only.
 * No session/prompt, client-FS advertisement or provider coding success. */
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createJavaValidationProject} from './lib/live-validation-project.js';
import {ownedProcessMembers} from './lib/desktop-process.js';
import {TaskStore} from '../packages/storage/src/index.js';
import {TaskEngine} from '../packages/task-engine/src/index.js';
import {AgentRegistry} from '../packages/agent-core/src/index.js';
import {repositorySnapshot} from '../packages/git-engine/src/index.js';
import {createDraftWorkspace,validateDraftWorkspace} from '../packages/git-engine/src/draft-workspace.js';
import {inspectOpenCodeInstallation,initializeOpenCodeSession} from '../packages/agent-adapters/src/opencode.js';
import {brokeredOpenCodeSha256} from '../packages/agent-adapters/src/opencode-metadata.js';
import {buildRepositoryReader,createRepositoryAuthority} from '../packages/agent-adapters/src/repository-identity.js';
import {createRepositoryBroker} from '../packages/agent-adapters/src/repository-broker.js';
import {buildTaskFileReader,createTaskFileAccess} from '../packages/agent-adapters/src/task-file-access.js';
import {openCodeBoundary} from '../packages/agent-adapters/src/opencode-sandbox.js';
import {AcpConnection} from '../packages/agent-adapters/src/acp.js';
import {captureOpenCodeServer} from '../packages/agent-adapters/src/opencode-process.js';
import {buildTaskPeerReader} from '../packages/agent-adapters/src/task-peer.js';
import {prepareTaskMcpTls} from '../packages/agent-adapters/src/task-mcp-tls.js';
import {createTaskMcpBridge} from '../packages/agent-adapters/src/task-mcp.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const result={version:1,sourceCommit:execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('/usr/bin/git',['status','--porcelain'],{encoding:'utf8'}).trim(),inferenceRequests:0,providerFileToolInvocations:0,productionExecutionEnabled:false,phases:[]};
const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),120000);
const directory=realpathSync(mkdtempSync('/private/tmp/codovyn-task-probe-'));
let store;
try {
 const fixture=await createJavaValidationProject(),original=realpathSync(fixture.project);
 const installation=await inspectOpenCodeInstallation();assert.equal(installation.compatible,true);assert.equal(installation.binarySha256,brokeredOpenCodeSha256);
 const reader=await buildRepositoryReader(join(directory,'repository-reader'),{signal:abort.signal}),fileReader=await buildTaskFileReader(join(directory,'file-reader'),{signal:abort.signal});
 const peerReader=await buildTaskPeerReader(join(directory,'peer-reader'),{signal:abort.signal});
 result.provider={version:installation.version,executableSha256:installation.binarySha256};result.nativeSources={repository:reader.sourceSha256,files:fileReader.sourceSha256,peer:peerReader.sourceSha256};
 store=new TaskStore(join(directory,'private','tasks.sqlite'));
 for(const mode of ['ask','agent']){
  const taskId=mode+'-boundary-probe',configuration={provider:'opencode',modelId:null,reasoning:null,routingMode:'manual',permission:mode==='agent'?'read-write':'read',intent:mode};
  store.create({id:taskId,request:'Non-inference execution-boundary validation; no coding request',repositoryRoot:original,primaryAgent:'opencode'});store.append(taskId,'task-configuration',configuration);
  let root=original,metadataScope;
  if(mode==='agent'){
   const draft=await createDraftWorkspace(original,join(directory,'drafts'),taskId);await validateDraftWorkspace(original,join(directory,'drafts'),taskId,draft.baseCommit);root=realpathSync(draft.path);store.append(taskId,'draft-created',{baseCommit:draft.baseCommit,branch:draft.branch});
   metadataScope={gitDirectory:realpathSync(execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-C',root,'rev-parse','--absolute-git-dir'],{encoding:'utf8'}).trim()),commonDirectory:realpathSync(join(original,'.git'))};
  }
  const baseline=await repositorySnapshot(original),registry=new AgentRegistry();let probeError,authority;
  const phase={mode,taskId,providerOutput:'NONE — metadata-only validation adapter',sourceReadBy:'TRUSTED HOST FILE SERVICE; not OpenCode tools',ownedGroups:[]};
  registry.register({id:'opencode',capabilities:{writes:mode==='agent',shell:false},availability:async()=> 'available',async*run({execution}){
   authority=execution.authority;let repository,broker,connection,server,files,tls,fileBridge;
   try{
    assert.equal(authority.verifyAdmission(),true);
    repository=await createRepositoryAuthority({root,reader,...metadataScope,lease:{id:authority.segment,purpose:'metadata-only',expiresAt:Date.now()+45000,isCurrent:()=>{try{return authority.verifyAdmission();}catch{return false;}}}});
    broker=await createRepositoryBroker(repository,{signal:abort.signal});tls=await prepareTaskMcpTls({execution:authority});const boundary=tls.boundary(broker.boundary(openCodeBoundary({cwd:root,stateDirectory:join(directory,'provider-'+mode),command:installation.command})));
    connection=new AcpConnection({...boundary,args:[...boundary.prefixArgs,'acp'],signal:AbortSignal.any([abort.signal,authority.signal]),execution:{starting:execution.starting,spawned:execution.spawned,stopped(){}}});phase.ownedGroups.push(connection.child.pid);
    authority.bindProcess(connection.child,{executable:installation.command,sha256:installation.binarySha256});server=await captureOpenCodeServer(connection.child,installation.command,abort.signal);phase.ownedGroups.push(server.group);
    files=await createTaskFileAccess({execution:authority,repository,reader:fileReader});
    fileBridge=await createTaskMcpBridge({execution:authority,files,pid:server.pid,peerReader,tls});
    const session=await initializeOpenCodeSession(connection,root,undefined,undefined,mode==='agent',fileBridge);assert.ok(session.sessionId);phase.acpInitialized=true;
    phase.mcpMetadata=fileBridge.observations;assert.ok(phase.mcpMetadata.some(o=>o.method==='initialize'));assert.ok(phase.mcpMetadata.some(o=>o.method==='tools/list'));phase.httpsMcpRegistered=true;
    const source=await files.read('src/main/java/dev/codovyn/Calculator.java'),manifest=await files.read('pom.xml');assert.match(source,/class Calculator/);assert.match(manifest,/<project/);phase.readHashes={source:hash(source),manifest:hash(manifest)};
    await assert.rejects(files.read('.git/config'));await assert.rejects(files.read('.env'));await assert.rejects(files.write('README.md','not authorized'));phase.writesBlocked=true;
    phase.repositoryIdentity=(await repository.read()).id;phase.segment=authority.segment;phase.leaseHeld=store.executionLease(taskId).releasedAt===null;
    yield{type:'completed'}; // Completion of this validation objective only.
   }catch(error){probeError=error;throw error;}
   finally{
    let cleanupError;for(const cleanup of [()=>fileBridge?.close(),()=>files?.close(),()=>connection?.dispose(),()=>server?.verifyStopped(),()=>broker?broker.close():repository?.revoke(),()=>tls?.close()])try{await cleanup();}catch(error){cleanupError ||= error;}
    for(const group of phase.ownedGroups)assert.deepEqual(await ownedProcessMembers(group),[]);
    if(cleanupError)throw cleanupError;
    execution.stopped();phase.cleanupVerified=true;
   }
  }});
  const task=await new TaskEngine({store,registry,snapshot:()=>repositorySnapshot(root)}).run(taskId,{signal:abort.signal});if(probeError)throw probeError;assert.equal(task.status,'completed');assert.notEqual(store.executionLease(taskId).releasedAt,null);assert.throws(()=>authority.verify(),/revoked/);
  assert.deepEqual(await repositorySnapshot(original),baseline);phase.originalUnchanged=true;phase.revokedAfterTask=true;phase.fileAudit=store.events(taskId).filter(e=>e.kind==='file-access').map(e=>e.data);result.phases.push(phase);
 }
 result.passed=true;
} finally {
 clearTimeout(deadline);store?.close();mkdirSync('dist/desktop',{recursive:true});writeFileSync('dist/desktop/opencode-task-boundary-validation.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed===true,phases:result.phases.length,inferenceRequests:0,evidence:'dist/desktop/opencode-task-boundary-validation.json'}));
 // Retain failed diagnostics; successful temporary provider state has no secrets.
 if(result.passed)rmSync(directory,{recursive:true,force:true});
}
