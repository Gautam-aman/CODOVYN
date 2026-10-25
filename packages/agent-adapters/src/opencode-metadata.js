import {mkdtempSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {buildRepositoryReader,createRepositoryAuthority} from './repository-identity.js';
import {createRepositoryBroker} from './repository-broker.js';
import {openCodeBoundary} from './opencode-sandbox.js';
import {inspectOpenCodeMetadataBoundary} from './opencode.js';
export const brokeredOpenCodeSha256='3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc';
/** Git metadata compatibility does NOT enable the execution adapter. External Git
 * stores can be supplied only by a trusted host call, never a webview field. */
export async function inspectBrokeredOpenCode({cwd,stateDirectory,installation,model,modelId,signal,metadataScope}={}) {
 if(process.platform!=='darwin'||process.arch!=='arm64'||installation?.compatible!==true||installation.version!=='2.1.2')throw new Error('Brokered metadata requires supported OpenCode 2.1.2 on macOS ARM64');
 if(installation.binarySha256!==brokeredOpenCodeSha256||createHash('sha256').update(readFileSync(installation.command)).digest('hex')!==brokeredOpenCodeSha256)throw new Error('OpenCode executable artifact is unverified for the repository broker');
 const implementationSha256=createHash('sha256').update(Buffer.concat(['repository-identity.js','repository-broker.js','opencode-metadata.js','opencode-process.js','opencode.js','opencode-sandbox.js','acp.js','process.js','opencode-task-runtime.js','task-file-access.js','task-file-write.js','task-mcp.js','task-mcp-tls.js','task-peer.js','../native/task-peer-reader.c','../native/task-file-reader.c','../native/task-file-publish.c','../../task-engine/src/execution-authority.js','../../task-engine/src/index.js','../../task-engine/src/recovery.js','../../task-engine/src/draft-write-recovery.js','../../storage/src/index.js','../../storage/src/campaign.js','../../agent-core/src/campaign-consent.js','../../task-engine/src/campaign-execution.js','codex-control.js','../../git-engine/src/draft-workspace.js'].map(name=>readFileSync(new URL(name,import.meta.url))))).digest('hex');
 const started=performance.now(),directory=realpathSync(mkdtempSync('/private/tmp/codovyn-rm-'));let authority,broker;
 try{
  const reader=await buildRepositoryReader(directory,{signal});
  authority=await createRepositoryAuthority({root:cwd,reader,gitDirectory:metadataScope?.gitDirectory,commonDirectory:metadataScope?.commonDirectory,lease:{id:randomUUID(),purpose:'metadata-only',expiresAt:Date.now()+45000,isCurrent:()=>!signal?.aborted}});
  const before=await authority.read();await authority.roots();
  broker=await createRepositoryBroker(authority,{signal});
  const boundary=broker.boundary(openCodeBoundary({cwd,stateDirectory,command:installation.command}));
  const metadata=await inspectOpenCodeMetadataBoundary({installation,boundary,model,modelId,signal});
  if(createHash('sha256').update(readFileSync(installation.command)).digest('hex')!==brokeredOpenCodeSha256)throw new Error('OpenCode executable changed during metadata initialization');
  const after=await authority.read();if(before.fingerprint!==after.fingerprint)throw new Error('Repository changed during ACP metadata initialization');
  return {...metadata,source:'verified-repository-broker-metadata',executionSupported:false,inferenceAccess:'unverified',metadataInitialization:'verified',repositoryCompatibility:'identity-compatible',brokerBoundary:'experimental-metadata-only',verifiedAt:new Date().toISOString(),repositoryIdentity:after,
   diagnostic:'ACP metadata compatible; authentication and inference unverified. Git task execution remains blocked pending execution-lease and provider file-access validation.',
   inspection:{implementationSha256,elapsedMs:performance.now()-started,ownedGroups:[...reader.ownedGroups,...broker.ownedGroups,...authority.measurements.map(entry=>entry.pid)],readerInvocations:authority.measurements.length,brokerQueries:broker.queries.length,readerSourceSha256:reader.sourceSha256,clientSourceSha256:broker.sourceSha256}};
 }finally{
  // Metadata boundary disposal confirms provider cleanup before returning above.
  if(broker)await broker.close();else authority?.revoke();
  rmSync(directory,{recursive:true,force:true});
 }
}
