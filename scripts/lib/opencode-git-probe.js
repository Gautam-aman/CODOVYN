/** Research harness only. Never imported by a provider adapter or a production host. */
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,chmodSync,realpathSync,statSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {manageAgentProcess} from '../../packages/agent-adapters/src/process.js';
import {ownedProcessMembers} from './desktop-process.js';

export async function probeProcess(command,args,{cwd,env,timeoutMs=15000}={}) {
  const started=performance.now(),child=spawn(command,args,{cwd,env,shell:false,detached:true,stdio:['pipe','pipe','pipe']});
  const lifecycle=manageAgentProcess(child);child.stdin.end();let stdout='',stderr='',bytes=0,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;lifecycle.dispose().catch(()=>{});},timeoutMs);
  for(const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576){lifecycle.dispose().catch(()=>{});return;}if(key==='stdout')stdout+=chunk;else stderr+=chunk;});
  let code;try{code=await lifecycle.closed;}finally{clearTimeout(timer);await lifecycle.dispose();}
  const survivors=child.pid?await ownedProcessMembers(child.pid):[];
  if(survivors.length)throw new Error('Git probe owned group cleanup could not be verified');
  if(timedOut||bytes>1048576||lifecycle.error())throw new Error('Git probe timed out, exceeded its bound, or could not start');
  return {code,stdout,stderr,elapsedMs:performance.now()-started,pid:child.pid,survivors};
}

const text=value=>{
  if(typeof value!=='string'||Buffer.byteLength(value)>16384||value.includes('\0'))throw new Error('Unsupported discovery snapshot');
  // Byte escapes avoid C string escaping, source encoding, and trigraph ambiguities.
  return '"'+[...Buffer.from(value)].map(byte=>'\\'+byte.toString(8).padStart(3,'0')).join('')+'"';
};
export function probeHeader(snapshot) {
  const fields=['root','gitDirectory','commonDirectory','head','roots','branch'];
  if(fields.some(key=>typeof snapshot[key]!=='string'))throw new Error('Incomplete discovery snapshot');
  if(!snapshot.root.startsWith('/')||!snapshot.gitDirectory.startsWith('/')||!snapshot.commonDirectory.startsWith('/'))throw new Error('Discovery paths must be absolute');
  return fields.map(key=>`static const char *${key}=${text(snapshot[key])};`).join('\n')+'\n';
}

export async function buildProbeShim(directory,snapshot) {
  // The harness supplies ONLY repositories it created itself. This is not a safe
  // host Git broker for arbitrary owner/provider paths or configurations.
  const bin=join(realpathSync(directory),'shim');mkdirSync(bin,{mode:0o700});
  writeFileSync(join(bin,'snapshot.h'),probeHeader(snapshot),{mode:0o600});
  writeFileSync(join(bin,'git.c'),readFileSync(new URL('../fixtures/opencode-git-discovery.c',import.meta.url)),{mode:0o600});
  const result=await probeProcess('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-Wall','-Wextra','-Werror',join(bin,'git.c'),'-o',join(bin,'git')]);
  if(result.code!==0)throw new Error('Native Git probe compilation failed');
  const signed=await probeProcess('/usr/bin/codesign',['-s','-','--options','runtime',join(bin,'git')]);
  if(signed.code!==0)throw new Error('Native Git probe signature failed');
  chmodSync(join(bin,'git'),0o500);chmodSync(bin,0o500);
  return {bin,command:join(bin,'git'),elapsedMs:result.elapsedMs+signed.elapsedMs,identity:statSync(join(bin,'git')).ino};
}
