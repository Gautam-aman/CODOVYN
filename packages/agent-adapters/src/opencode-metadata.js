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
 const started=performance.now(),directory=realpathSync(mkdtempSync('/private/tmp/codovyn-rm-'));let authority,broker;
 try{
  const reader=await buildRepositoryReader(directory,{signal});
  authority=await createRepositoryAuthority({root:cwd,reader,gitDirectory:metadataScope?.gitDirectory,commonDirectory:metadataScope?.commonDirectory,lease:{id:randomUUID(),purpose:'metadata-only',expiresAt:Date.now()+45000,isCurrent:()=>!signal?.aborted}});
  broker=await createRepositoryBroker(authority,{signal});
  const before=await authority.read();
  const boundary=broker.boundary(openCodeBoundary({cwd,stateDirectory,command:installation.command}));
  const metadata=await inspectOpenCodeMetadataBoundary({installation,boundary,model,modelId,signal});
  const after=await authority.read();if(before.fingerprint!==after.fingerprint)throw new Error('Repository changed during ACP metadata initialization');
  return {...metadata,source:'verified-repository-broker-metadata',executionSupported:false,inferenceAccess:'unverified',metadataInitialization:'verified',repositoryCompatibility:'identity-compatible',brokerBoundary:'experimental-metadata-only',verifiedAt:new Date().toISOString(),repositoryIdentity:after,
   diagnostic:'ACP metadata compatible; authentication and inference unverified. Git task execution remains blocked pending execution-lease and provider file-access validation.',
   inspection:{elapsedMs:performance.now()-started,ownedGroups:[...reader.ownedGroups,...broker.ownedGroups,...authority.measurements.map(entry=>entry.pid)],readerInvocations:authority.measurements.length,brokerQueries:broker.queries.length,readerSourceSha256:reader.sourceSha256,clientSourceSha256:broker.sourceSha256}};
 }finally{
  // Metadata boundary disposal confirms provider cleanup before returning above.
  if(broker)await broker.close();else authority?.revoke();
  rmSync(directory,{recursive:true,force:true});
 }
}
