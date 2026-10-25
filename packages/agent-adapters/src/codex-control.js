import {realpathSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {boundedJsonLines} from './jsonl.js';
import {redactContext} from '../../agent-core/src/contextflow.js';
import {manageAgentProcess} from './process.js';
import {isTaskExecutionAuthority} from '../../task-engine/src/execution-authority.js';
const boundaries=new WeakSet();
export const supportedCodexNativeSha256='d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf';
/** Context-only research boundary. The provider receives NO project filesystem
 * grant. Credentials/configuration are not copied or inherited. The original
 * Codex read-only sandbox is also requested through the official protocol. */
export function codexControlBoundary({workspace,stateDirectory,command}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Codex control boundary is macOS ARM64 only');
 const root=realpathSync(workspace);if(!lstatSync(root).isDirectory())throw new Error('Project directory required');const executable=realpathSync(command),stat=lstatSync(executable);if(!stat.isFile()||stat.mode&0o022)throw new Error('Trusted executable required');
 mkdirSync(stateDirectory,{recursive:true,mode:0o700});const state=realpathSync(stateDirectory);if(lstatSync(state).mode&0o077)throw new Error('Private provider state required');const outside=p=>isAbsolute(p)||p==='..'||p.startsWith('../');if(!outside(relative(root,state))||!outside(relative(state,root)))throw new Error('Provider state must be outside project');
 const home=join(state,'home'),scratch=join(state,'scratch');for(const p of [home,scratch])mkdirSync(p,{mode:0o700});
 const configuration=join(home,'config.toml');
 writeFileSync(configuration,`approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "read-only"
web_search = "disabled"
[features]
shell_tool = false
unified_exec = false
multi_agent = false
multi_agent_v2 = false
apps = false
plugins = false
computer_use = false
shell_snapshot = false
sleep_tool = false
`,{mode:0o600,flag:'wx'});
 const q=JSON.stringify,profile=`(version 1)
(allow default)
(deny file-read-data (subpath "/"))
; macOS 27 dyld needs the root directory FD, not a recursive root grant.
(allow file-read-data (literal "/"))
(deny file-write*)
(deny process-fork)
(deny file-link)
(deny process-exec)
(allow process-exec (literal ${q(executable)}))
(allow file-read-data (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple") (subpath "/opt/homebrew/Cellar") (literal ${q(executable)}) (subpath ${q(state)}) (subpath "/dev"))
(allow file-write* (subpath ${q(state)}) (literal "/dev/null"))
(allow file-read-metadata)
(deny file-read-data (regex #".*/([.]env([.].*)?|auth[.]json|credentials[^/]*|id_rsa|id_ed25519|[^/]*[.]pem|[^/]*[.]key)$") (regex #".*/[.](ssh|aws|git)(/.*)?$"))
(deny file-write* (literal ${q(configuration)}) (regex #".*/[.]git(/.*)?$") (subpath ${q(root)}))
(deny file-read-data (subpath ${q(root)}))`;
 const boundary=Object.freeze({command:'/usr/bin/sandbox-exec',prefixArgs:['-p',profile,executable],cwd:scratch,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',HOME:home,CODEX_HOME:home,TMPDIR:scratch},stateDirectory:state,executable,workspace:root});boundaries.add(boundary);return boundary;
}
/** No grants, cached approvals, policy amendments, dynamic tools or inputs. */
export function denyCodexServerRequest(method){
 if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method))return {decision:'cancel'};
 if(method==='item/permissions/requestApproval')return {permissions:{},scope:'turn'};
 if(method==='item/tool/call')return {contentItems:[{type:'inputText',text:'CODOVYN: tool execution is not authorized'}],success:false};
 return null;
}
export class CodexControlConnection{
 #diagnostics='';#workspace;#methods;#pending;#incoming;#nextId;#closed;#controller;#abort;#signal;#child;#lifecycle;#timer;#pump;
 get diagnostic(){return redactContext(this.#diagnostics).slice(0,1024);}
 get methods(){return [...this.#methods];}
 get pid(){return this.#child.pid;}
 get exitCode(){return this.#child.exitCode;}
 get signalCode(){return this.#child.signalCode;}
 static async open(boundary,{execution,signal,timeoutMs=15000}={}){
  if(execution&&(!isTaskExecutionAuthority(execution.authority)||execution.authority.provider!=='codex'||execution.authority.permission!=='read'||!['ask','plan'].includes(execution.authority.intent)||execution.authority.workspace!==boundary.workspace))throw new Error('Matching host-issued Codex task authority required');
  if(execution){execution.authority.verifyAdmission();execution.starting();}
  const connection=new CodexControlConnection(boundary,{signal:execution?.authority.signal||signal,timeoutMs});
  try{if(execution){const identity=verifyCodexControlExecutable(boundary.executable);execution.spawned({pid:connection.#child.pid,group:true});execution.authority.bindProcess(connection.#child,identity);}return connection;}
  catch(error){await connection.close();execution?.stopped();throw error;}
 }
 constructor(boundary,{signal,timeoutMs=15000}={}){
  if(!boundaries.has(boundary))throw new Error('Host-issued Codex boundary required');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw new Error('Invalid metadata deadline');
  this.#workspace=boundary.cwd;this.#methods=[];this.#pending=new Map();this.#incoming=new Set();this.#nextId=0;this.#closed=false;this.#controller=new AbortController();this.#abort=()=>this.fail(new Error('Codex metadata cancelled'));signal?.addEventListener('abort',this.#abort,{once:true});this.#signal=signal;
  this.#child=spawn(boundary.command,[...boundary.prefixArgs,'app-server','--stdio'],{cwd:boundary.cwd,env:boundary.env,shell:false,detached:true,stdio:['pipe','pipe','pipe']});this.#lifecycle=manageAgentProcess(this.#child,this.#controller.signal);let bytes=0,messages=0,errors=0;
  this.#child.stderr.on('data',b=>{errors+=b.length;if(this.#diagnostics.length<1024)this.#diagnostics+=b.toString('utf8').slice(0,1024-this.#diagnostics.length);if(errors>65536)this.fail(new Error('Codex diagnostic limit'));});
  this.#timer=setTimeout(()=>this.fail(new Error('Codex metadata deadline exceeded')),timeoutMs);
  this.#pump=(async()=>{try{const bounded=async function*(stream){for await(const b of stream){bytes+=b.length;if(bytes>2097152)throw new Error('Codex metadata output limit');yield b;}};
   for await(const m of boundedJsonLines(bounded(this.#child.stdout),262144)){
    if(++messages>256)throw new Error('Codex metadata message limit');
    if(typeof m.method==='string'){
     if(m.id!==undefined){if(!(Number.isSafeInteger(m.id)||typeof m.id==='string'&&m.id.length<=80)||this.#incoming.has(m.id))throw new Error('Invalid/replayed server request');this.#incoming.add(m.id);const result=denyCodexServerRequest(m.method);this.#send(result?{id:m.id,result}:{id:m.id,error:{code:-32601,message:'Client capability denied'}});}
    }else{const p=this.#pending.get(m.id);if(!p)throw new Error('Unexpected/duplicate Codex response');this.#pending.delete(m.id);if(m.error)p.reject(Object.assign(new Error('Codex metadata request rejected'),{rpcCode:m.error.code,diagnostic:redactContext(String(m.error.message||'')).slice(0,512)}));else if('result'in m)p.resolve(m.result);else throw new Error('Invalid Codex response');}
   }this.fail(new Error('Codex metadata disconnected'));
  }catch(e){this.fail(e);}})();if(signal?.aborted)this.#abort();
 }
 #send(message){if(this.#closed)throw new Error('Codex control closed');const data=JSON.stringify(message)+'\n';if(Buffer.byteLength(data)>32768)throw new Error('Codex metadata input limit');this.#child.stdin.write(data);}
 request(method,params){if(!['initialize','model/list','config/read','thread/start'].includes(method)||this.#methods.includes(method)||this.#closed)throw new Error('Inference or repeated metadata method is disabled');
  if(method==='thread/start'&&(Object.keys(params).sort().join(',')!=='approvalPolicy,approvalsReviewer,cwd,ephemeral,model,sandbox'||params.cwd!==this.#workspace||params.approvalPolicy!=='on-request'||params.approvalsReviewer!=='user'||params.sandbox!=='read-only'||params.ephemeral!==true))throw new Error('Explicit restrictive thread policy required');
  this.#methods.push(method);return new Promise((resolve,reject)=>{const id=++this.#nextId;this.#pending.set(id,{resolve,reject});try{this.#send({id,method,params});}catch(e){this.fail(e);}});
 }
 initialized(){this.#send({method:'initialized'});}
 fail(error){if(this.#closed)return;this.#closed=true;for(const p of this.#pending.values())p.reject(error);this.#pending.clear();this.#controller.abort();}
 async close(){clearTimeout(this.#timer);this.#signal?.removeEventListener('abort',this.#abort);this.fail(new Error('Codex control disposed'));await this.#lifecycle.dispose();await this.#pump;}
}
export function verifyCodexControlExecutable(command){const executable=realpathSync(command),sha256=createHash('sha256').update(readFileSync(executable)).digest('hex');if(sha256!==supportedCodexNativeSha256)throw new Error('Unsupported Codex executable hash');return {executable,sha256};}
