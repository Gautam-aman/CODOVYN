import{assertCodexIdentity}from'./codex-identity.js';
import{homedir}from'node:os';
import {realpathSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {boundedJsonLines} from './jsonl.js';
import {redactContext} from '../../agent-core/src/contextflow.js';
import {manageAgentProcess} from './process.js';
import {validateCampaignSpec} from '../../agent-core/src/campaign-consent.js';
import {isTaskExecutionAuthority} from '../../task-engine/src/execution-authority.js';
const boundaries=new WeakSet(),turnTransports=new WeakMap();
export function claimCodexTurnTransport(capability,execution,selection,prompt){const record=turnTransports.get(capability);if(!record||record.execution!==execution||record.digest!==createHash('sha256').update(JSON.stringify(selection)).digest('hex')||record.prompt!==prompt)throw new Error('Live campaign dispatch requires a matching private Codex transport');turnTransports.delete(capability);return {submit:record.submit,lifecycle:record.lifecycle};}
export const supportedCodexNativeSha256='d8990e3ee7acfbc26f91265b12a1a83f0fee40d0e0f8f1f40a37d4ec21f499cf';
/** Context-only OS boundary for metadata and explicitly approved Ask/Plan turns. The provider receives NO project filesystem
 * grant. Credentials/configuration are not copied or inherited. The original
 * Codex read-only sandbox is also requested through the official protocol. */
export function codexControlBoundary({workspace,stateDirectory,command,fixtureScript}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Codex control boundary is macOS ARM64 only');
 const root=realpathSync(workspace);if(!lstatSync(root).isDirectory())throw new Error('Project directory required');const executable=realpathSync(command),stat=lstatSync(executable);if(!stat.isFile()||stat.mode&0o022)throw new Error('Trusted executable required');
 mkdirSync(stateDirectory,{recursive:true,mode:0o700});const state=realpathSync(stateDirectory);if(lstatSync(state).mode&0o077)throw new Error('Private provider state required');const outside=p=>isAbsolute(p)||p==='..'||p.startsWith('../');if(!outside(relative(root,state))||!outside(relative(state,root)))throw new Error('Provider state must be outside project');
 const home=join(state,'home'),scratch=join(state,'scratch');for(const p of [home,scratch])mkdirSync(p,{mode:0o700});
 const configuration=join(home,'config.toml');
 writeFileSync(configuration,`approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "read-only"
web_search = "disabled"
cli_auth_credentials_store = "ephemeral"
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
(deny file-read-data (regex #".*/([.][eE][nN][vV]([.].*)?|[aA][uU][tT][hH][.][jJ][sS][oO][nN]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL][sS][^/]*|id_rsa|id_ed25519|[^/]*[.]pem|[^/]*[.]key)$") (regex #".*/[.](ssh|aws|git)(/.*)?$"))
(deny file-write* (regex #".*/([.][eE][nN][vV]([.].*)?|[aA][uU][tT][hH][.][jJ][sS][oO][nN]([.].*)?|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL][sS][^/]*|id_rsa|id_ed25519|[^/]*[.]pem|[^/]*[.]key)$"))
(deny file-write* (regex #".*/[cC][oO][nN][fF][iI][gG][.][tT][oO][mM][lL]$") (literal ${q(configuration)}) (regex #".*/[.]git(/.*)?$") (subpath ${q(root)}))
(deny file-read-data (subpath ${q(root)}))`;
 if(fixtureScript&&(executable!==realpathSync(process.execPath)||!realpathSync(fixtureScript).startsWith(state+'/')))throw new Error('Fixed Node fixture must be in private state');
 const boundary=Object.freeze({command:'/usr/bin/sandbox-exec',prefixArgs:Object.freeze(['-p',profile,executable,...(fixtureScript?['--openssl-config=/dev/null',realpathSync(fixtureScript)]:[])]),cwd:scratch,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',HOME:home,CODEX_HOME:home,TMPDIR:scratch},stateDirectory:state,executable,workspace:root});boundaries.add(boundary);return boundary;
}
/** Trusted owner authentication only. Never accepts project context or model input.
 * This is NOT the coding boundary: its protocol cannot start threads/turns or bind execution. */
export function codexAuthenticationBoundary({identity,stateDirectory,command}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Isolated Keychain authentication is macOS ARM64 only');assertCodexIdentity(identity);const executable=verifyCodexControlExecutable(command).executable;
 mkdirSync(stateDirectory,{recursive:true,mode:0o700});const state=realpathSync(stateDirectory);if(lstatSync(state).uid!==process.getuid()||lstatSync(state).mode&0o077||state===identity.home||state.startsWith(identity.home+'/')||identity.home.startsWith(state+'/'))throw new Error('Separate private authentication runtime required');
 const scratch=join(state,'scratch');mkdirSync(scratch,{mode:0o700});
 const q=JSON.stringify,profile=`(version 1)
(allow default)
; Trusted authentication SDK only: no model/thread methods or project context.
(deny process-fork)
(deny process-exec)
(allow process-exec (literal ${q(executable)}))
(deny file-link)
(deny file-write*)
(allow file-write* (subpath ${q(state)}) (subpath ${q(identity.home)}) (subpath ${q(join(homedir(),"Library/Keychains"))}) (literal "/dev/null"))
; Strict pre-action plaintext prevention, even if managed policy tries to select file storage.
(deny file-write* (regex #".*/[aA][uU][tT][hH][.][jJ][sS][oO][nN]([.].*)?$") (literal ${q(identity.config)}))
(deny file-read-data (regex #".*/([.][eE][nN][vV]([.].*)?|[aA][uU][tT][hH][.][jJ][sS][oO][nN]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL][sS][^/]*|id_rsa|id_ed25519|[^/]*[.]pem|[^/]*[.]key)$") (regex #".*/[.](ssh|aws|codex[^/]*)(/.*)?$"))`;
 const boundary=Object.freeze({authOnly:true,identity,credentialStorage:'keyring',command:'/usr/bin/sandbox-exec',executable,prefixArgs:Object.freeze(['-p',profile,executable,'-c',`log_dir=${JSON.stringify(join(state,'logs'))}`,'-c',`sqlite_home=${JSON.stringify(join(state,'sqlite'))}`]),cwd:scratch,workspace:null,stateDirectory:state,env:Object.freeze({PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',HOME:homedir(),CODEX_HOME:identity.home,CODEX_SQLITE_HOME:join(state,'sqlite'),TMPDIR:scratch})});boundaries.add(boundary);return boundary;
}
export function isCodexAuthenticationBoundary(value){return boundaries.has(value)&&value.authOnly===true;}
/** No grants, cached approvals, policy amendments, dynamic tools or inputs. */
export function denyCodexServerRequest(method){
 if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method))return {decision:'cancel'};
 if(method==='item/permissions/requestApproval')return {permissions:{},scope:'turn'};
 if(method==='item/tool/call')return {contentItems:[{type:'inputText',text:'CODOVYN: tool execution is not authorized'}],success:false};
 return null;
}
export class CodexControlConnection{
 #diagnostics='';#workspace;#methods;#pending;#incoming;#nextId;#closed;#controller;#abort;#signal;#child;#lifecycle;#timer;#pump;#boundary;#execution;#models=[];#thread=null;#login=null;#loginNotice=null;#accountDigest=null;#contextNonce=randomUUID();#turn=null;#usedTurn=false;#session=false;#authOnly=false;#identity=null;#authObserver=()=>{};
 get closed(){return this.#lifecycle.closed;}
 get accountContextDigest(){return this.#accountDigest;}
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
 constructor(boundary,{signal,timeoutMs=15000,session=false,onAuthenticationEvent=()=>{}}={}){
  if(!boundaries.has(boundary))throw new Error('Host-issued Codex boundary required');if(typeof onAuthenticationEvent!=='function')throw new Error('Trusted authentication observer required');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>(session?300000:15000))throw new Error('Invalid metadata deadline');
  this.#authObserver=onAuthenticationEvent;this.#authOnly=boundary.authOnly===true;this.#identity=boundary.identity||null;this.#boundary=boundary;this.#session=session;this.#workspace=boundary.cwd;this.#methods=[];this.#pending=new Map();this.#incoming=new Set();this.#nextId=0;this.#closed=false;this.#controller=new AbortController();this.#abort=()=>this.fail(new Error('Codex metadata cancelled'));signal?.addEventListener('abort',this.#abort,{once:true});this.#signal=signal;
  this.#child=spawn(boundary.command,[...boundary.prefixArgs,'app-server','--stdio'],{cwd:boundary.cwd,env:boundary.env,shell:false,detached:true,stdio:['pipe','pipe','pipe']});this.#lifecycle=manageAgentProcess(this.#child,this.#controller.signal);let bytes=0,messages=0,errors=0;
  this.#child.stderr.on('data',b=>{errors+=b.length;if(!this.#session&&this.#diagnostics.length<1024)this.#diagnostics+=b.toString('utf8').slice(0,1024-this.#diagnostics.length);if(errors>65536)this.fail(new Error('Codex diagnostic limit'));});
  this.#timer=setTimeout(()=>{this.#authObserver({phase:'metadata-session-deadline'});this.fail(new Error('Codex metadata deadline exceeded'));},timeoutMs);
  this.#pump=(async()=>{try{const bounded=async function*(stream){for await(const b of stream){bytes+=b.length;if(bytes>2097152)throw new Error('Codex metadata output limit');yield b;}};
   for await(const m of boundedJsonLines(bounded(this.#child.stdout),262144)){
    if(++messages>256)throw new Error('Codex metadata message limit');
    if(typeof m.method==='string'){
     if(m.id!==undefined){if(!(Number.isSafeInteger(m.id)||typeof m.id==='string'&&m.id.length<=80)||this.#incoming.has(m.id))throw new Error('Invalid/replayed server request');this.#incoming.add(m.id);const result=denyCodexServerRequest(m.method);this.#send(result?{id:m.id,result}:{id:m.id,error:{code:-32601,message:'Client capability denied'}});if(this.#turn)this.fail(new Error('Provider requested an unauthorized tool; no approval granted')); }
     else this.#notification(m.method,m.params);
    }else{const p=this.#pending.get(m.id);if(!p)throw new Error('Unexpected/duplicate Codex response');this.#pending.delete(m.id);if(m.error)p.reject(Object.assign(new Error('Codex metadata request rejected'),{rpcCode:m.error.code,diagnostic:redactContext(String(m.error.message||'')).slice(0,512)}));else if('result'in m){if(p.method==='model/list')this.#models=m.result?.data||[];if(p.method==='thread/start')this.#thread=m.result;p.resolve(m.result);}else throw new Error('Invalid Codex response');}
   }this.fail(new Error('Codex metadata disconnected'));
  }catch(e){this.fail(e);}})();if(signal?.aborted)this.#abort();
 }
 #send(message){if(this.#closed)throw new Error('Codex control closed');const data=JSON.stringify(message)+'\n';if(Buffer.byteLength(data)>32768)throw new Error('Codex metadata input limit');this.#child.stdin.write(data);}
 #rpc(method,params){if(!this.#methods.includes(method))this.#methods.push(method);if(this.#closed)return Promise.reject(new Error('Codex isolated session is closed'));return new Promise((resolve,reject)=>{const id=++this.#nextId;this.#pending.set(id,{resolve,reject,method});try{this.#send({id,method,params});}catch(e){this.fail(e);}});}
 request(method,params){if(this.#authOnly&&(!['initialize','config/read'].includes(method)||method==='config/read'&&(params.cwd!==this.#workspace||params.includeLayers!==false)||method==='initialize'&&params.capabilities?.experimentalApi!==false))throw new Error('Authentication component cannot execute coding or experimental protocols');if(!['initialize','model/list','config/read','thread/start'].includes(method)||this.#methods.includes(method)||this.#closed)throw new Error('Inference or repeated metadata method is disabled');
  if(method==='thread/start'&&(Object.keys(params).sort().join(',')!=='approvalPolicy,approvalsReviewer,cwd,ephemeral,model,sandbox'||params.cwd!==this.#workspace||params.approvalPolicy!=='on-request'||params.approvalsReviewer!=='user'||params.sandbox!=='read-only'||params.ephemeral!==true))throw new Error('Explicit restrictive thread policy required');
  this.#methods.push(method);return this.#rpc(method,params);
 }
 #deadline(ms){clearTimeout(this.#timer);this.#timer=setTimeout(()=>{this.#authObserver({phase:'session-deadline'});this.fail(new Error('Codex isolated session deadline exceeded'));},ms);}
 async accountState({refreshToken=false}={}){if(typeof refreshToken!=='boolean'||refreshToken&&!this.#authOnly)throw new Error('Token refresh requires the dedicated authentication component');if(this.#identity)assertCodexIdentity(this.#identity);if(!this.#session)throw new Error('Owner-controlled session required');let timer,result;try{if(refreshToken)timer=setTimeout(()=>{this.#authObserver({phase:'account-status-deadline'});this.fail(new Error('Authentication status deadline exceeded'));},15000);result=await this.#rpc('account/read',{refreshToken});}finally{clearTimeout(timer);}const authenticated=result?.account?.type==='chatgpt';this.#accountDigest=authenticated?createHash('sha256').update(this.#contextNonce+JSON.stringify(result.account)).digest('hex'):null;return {authenticated,accountType:['chatgpt','apiKey'].includes(result?.account?.type)?result.account.type:null,storage:this.#authOnly?'keyring':'memory-only',inferenceVerified:false,contextDigest:this.#accountDigest};}
 async loginDevice({confirm,display}={}){
  if(!this.#session||this.#login||this.#turn||typeof confirm!=='function'||typeof display!=='function')throw new Error('Owner-initiated isolated login required');
  if(await confirm()!=='Sign in to isolated Codex')throw new Error('Isolated login not approved');
  this.#deadline(this.#authOnly?300000:120000);let resolve,reject;const completion=new Promise((a,b)=>{resolve=a;reject=b;});completion.catch(()=>{});this.#login={id:null,resolve,reject};
  try{const result=await this.#rpc('account/login/start',{type:'chatgptDeviceCode'});if(result?.type!=='chatgptDeviceCode'||typeof result.loginId!=='string'||result.loginId.length>100||result.verificationUrl!=='https://auth.openai.com/codex/device'||typeof result.userCode!=='string'||!/^[A-Z0-9-]{4,32}$/.test(result.userCode))throw new Error('Unsupported official device login response');this.#login.id=result.loginId;this.#authObserver({phase:'device-flow-started'});
   if(this.#loginNotice?.loginId===result.loginId)this.#completeLogin(this.#loginNotice);
   await display({url:result.verificationUrl,code:result.userCode});await completion;const state=await this.accountState();if(!state.authenticated)throw new Error('Official sign-in did not establish authentication');this.#authObserver({phase:'provider-account-confirmed'});this.#deadline(300000);return state;
  }catch(error){await this.cancelLogin();throw error;}finally{this.#login=null;this.#loginNotice=null;}
 }
 #completeLogin(params){if(params?.loginId!==this.#login?.id)return;this.#authObserver({phase:'provider-login-completed',success:params.success===true});params.success===true?this.#login.resolve():this.#login.reject(new Error('Official device sign-in failed'));}
 async cancelLogin(){const login=this.#login;this.#login=null;this.#accountDigest=null;if(login){login.reject(new Error('Isolated sign-in cancelled'));if(login.id)await this.#rpc('account/login/cancel',{loginId:login.id});}}
 async logout(){if(this.#turn)throw new Error('Cancel the active request before logout');await this.cancelLogin();await this.#rpc('account/logout',{});this.#accountDigest=null;this.#contextNonce=randomUUID();return {authenticated:false,storage:this.#authOnly?'keyring':'memory-only',inferenceVerified:false};}
 bindExecution(execution){if(this.#authOnly)throw new Error('Authentication component cannot bind task execution');if(this.#execution||!isTaskExecutionAuthority(execution?.authority)||execution.authority.provider!=='codex'||execution.authority.permission!=='read'||!['ask','plan'].includes(execution.authority.intent)||execution.authority.workspace!==this.#boundary.workspace)throw new Error('Matching read-only TaskEngine authority required');execution.authority.verifyAdmission();const identity=this.#boundary.executable===realpathSync(process.execPath)?{executable:this.#boundary.executable,sha256:createHash('sha256').update(readFileSync(this.#boundary.executable)).digest('hex')}:verifyCodexControlExecutable(this.#boundary.executable);execution.starting();execution.spawned({pid:this.pid,group:true});execution.authority.bindProcess(this.#child,identity);this.#execution=execution.authority;}
 async runApproved({execution,consentId,requestId,selection,prompt,onText=()=>{},signal}){if(this.#authOnly)throw new Error('Authentication component cannot submit inference');
  selection=validateCampaignSpec(selection);
  if(this.#usedTurn||execution!==this.#execution||!this.#session||selection.provider!=='codex'||!['ask','plan'].includes(selection.mode)||selection.maxRequests!==1||selection.maxMcpToolCalls!==0)throw new Error('Single read-only owner-approved Codex request required');
  const fixture=this.#boundary.executable===realpathSync(process.execPath);if(fixture!== (selection.purpose==='fixture'))throw new Error('Fixture/live provider identity mismatch');
  const state=await this.accountState();if(!state.authenticated||selection.accountContextDigest!==state.contextDigest)throw new Error('Selected isolated account context changed or unauthenticated');
  const model=this.#models.find(m=>m.model===selection.model);if(!model||!model.supportedReasoningEfforts?.some(e=>e.reasoningEffort===selection.reasoning))throw new Error('Selected model/reasoning is not advertised');
  const thread=this.#thread;if(!thread?.thread?.id||thread.model!==selection.model||thread.sandbox?.type!=='readOnly'||thread.approvalPolicy!=='on-request'||thread.approvalsReviewer!=='user')throw new Error('Restrictive selected thread policy was not confirmed');
  const cap=Object.freeze({});this.#usedTurn=true;
  turnTransports.set(cap,{execution,digest:createHash('sha256').update(JSON.stringify(selection)).digest('hex'),prompt,lifecycle:this.#lifecycle,submit:options=>this.#submitTurn({threadId:thread.thread.id,model:selection.model,effort:selection.reasoning,prompt,onText,...options})});
  this.#deadline(selection.maxRequestMs+1000);
  const {dispatchCampaignRequest}=await import('../../task-engine/src/campaign-execution.js');
  // Deterministic tests use the same transport and SQL path, never a live model.
  const options=fixture?claimCodexTurnTransport(cap,execution,selection,prompt):{transport:cap};
  return dispatchCampaignRequest({execution,consentId,requestId,selection,prompt,signal,...options});
 }
 async #submitTurn({threadId,model,effort,prompt,onText,onAcknowledged,signal}){
  let resolve,reject;const completed=new Promise((a,b)=>{resolve=a;reject=b;});completed.catch(()=>{});
  const turn={threadId,id:null,queued:[],text:'',items:new Map(),lastItem:null,usage:null,onText,resolve,reject};this.#turn=turn;
  const abort=()=>{if(turn.id&&!this.#closed)this.#rpc('turn/interrupt',{threadId,turnId:turn.id}).catch(()=>{});reject(new Error('Codex turn cancelled; submission may have occurred'));};signal.addEventListener('abort',abort,{once:true});
  try{if(signal.aborted)throw new Error('Cancelled before Codex turn');this.#methods.push('turn/start');const result=await this.#rpc('turn/start',{threadId,input:[{type:'text',text:prompt}],model,effort,cwd:this.#workspace,approvalPolicy:'on-request',approvalsReviewer:'user',sandboxPolicy:{type:'readOnly'},summary:'none'});
   if(typeof result?.turn?.id!=='string'||result.turn.id.length>100||!['inProgress','completed','failed','interrupted'].includes(result.turn.status))throw new Error('Malformed turn acknowledgement');turn.id=result.turn.id;if(!onAcknowledged())throw new Error('Late Codex acknowledgement rejected');for(const item of turn.queued)this.#turnNotification(...item);turn.queued=[];return await completed;
  }finally{signal.removeEventListener('abort',abort);this.#turn=null;}
 }
 #notification(method,params){
  if(method==='account/login/completed'){if(this.#login?.id)this.#completeLogin(params);else this.#loginNotice={loginId:params?.loginId,success:params?.success===true};return;}
  if(method==='account/updated'){if(this.#turn)this.fail(new Error('Account changed during request'));return;}
  if(this.#turn&&['turn/completed','item/agentMessage/delta','item/started','item/completed','thread/tokenUsage/updated'].includes(method)){
   if(!this.#turn.id){if(this.#turn.queued.length>=128)throw new Error('Pre-acknowledgement event limit');this.#turn.queued.push([method,params]);return;}this.#turnNotification(method,params);
  }
 }
 #turnNotification(method,params){const turn=this.#turn;if(params?.threadId!==turn.threadId)throw new Error('Unexpected thread event');const id=method==='turn/completed'?params.turn?.id:params.turnId;if(id!==turn.id)throw new Error('Unexpected turn event');
  if(['item/started','item/completed'].includes(method)&&!['userMessage','agentMessage','reasoning'].includes(params.item?.type))throw new Error('Provider tool activity is not authorized');
  const append=(id,text,final)=>{if(typeof id!=='string'||!id||id.length>100||typeof text!=='string')throw new Error('Invalid agent message');let item=turn.items.get(id),prefix='';if(!item){if(turn.items.size>=64)throw new Error('Agent message count bound');item={text:'',done:false};turn.items.set(id,item);if(turn.lastItem!==null)prefix='\n\n';turn.lastItem=id;}if(final&&item.done){if(text!==item.text)throw new Error('Conflicting repeated final message');return;}if(item.done||turn.lastItem!==id||final&&!text.startsWith(item.text))throw new Error('Agent message ordering/conflict');const delta=prefix+(final?text.slice(item.text.length):text);if(Buffer.byteLength(turn.text)+Buffer.byteLength(delta)>65536)throw new Error('Codex response size exceeded');item.text=final?text:item.text+text;item.done=final;turn.text+=delta;if(delta)turn.onText(delta);};
  if(method==='item/agentMessage/delta')append(params.itemId,params.delta,false);
  if(method==='item/completed'&&params.item?.type==='agentMessage')append(params.item.id,params.item.text,true);
  if(method==='thread/tokenUsage/updated'){const last=params.tokenUsage?.last;if(last&&['inputTokens','outputTokens','cachedInputTokens'].every(k=>Number.isSafeInteger(last[k])&&last[k]>=0))turn.usage={provenance:'provider-reported last usage snapshot; not request total or billing',inputTokens:last.inputTokens,outputTokens:last.outputTokens,cachedInputTokens:last.cachedInputTokens};}
  if(method==='turn/completed'){const status=params.turn?.status;if(!['completed','failed','interrupted'].includes(status))throw new Error('Unknown terminal status');turn.resolve({providerOutcome:status==='completed'&&turn.text?'completed':'failed',status,text:turn.text,usage:turn.usage});}
 }

 initialized(){this.#send({method:'initialized'});}
 fail(error){if(this.#closed)return;this.#closed=true;this.#login?.reject(error);this.#login=null;this.#turn?.reject(error);for(const p of this.#pending.values())p.reject(error);this.#pending.clear();this.#controller.abort();}
 async close(){clearTimeout(this.#timer);this.#signal?.removeEventListener('abort',this.#abort);this.fail(new Error('Codex control disposed'));await this.#lifecycle.dispose();await this.#pump;}
}
export function verifyCodexControlExecutable(command){const executable=realpathSync(command),sha256=createHash('sha256').update(readFileSync(executable)).digest('hex');if(sha256!==supportedCodexNativeSha256)throw new Error('Unsupported Codex executable hash');return {executable,sha256};}
