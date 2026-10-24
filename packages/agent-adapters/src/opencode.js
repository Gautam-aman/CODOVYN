import { spawn } from 'node:child_process';
import { realpathSync, statSync, constants, accessSync, lstatSync, readFileSync } from 'node:fs';
import { join, delimiter, isAbsolute, resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { AcpConnection } from './acp.js';
import { manageAgentProcess } from './process.js';
import { openCodeBoundary } from './opencode-sandbox.js';
import { AgentFailure } from '../../agent-core/src/index.js';
import { validateContextFlow } from '../../agent-core/src/contextflow.js';
import { createHandoffPacket } from '../../agent-core/src/handoff.js';
async function ownedOutput(command,args,options) {
  const controller=new AbortController();
  const child=spawn(command,args,{cwd:options.cwd,env:options.env,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  const lifecycle=manageAgentProcess(child,controller.signal);if(child.pid)options.ownedGroups?.push(child.pid);child.stdin.end();
  const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(),options.timeoutMs||15000);let chunks=[],size=0,stderr=0;
  child.stderr.on('data',chunk=>{stderr+=chunk.length;if(stderr>1048576)controller.abort();});
  try{
    for await(const chunk of child.stdout){size+=chunk.length;if(size>(options.maxBytes||262144))throw new AgentFailure('fatal','OpenCode catalogue exceeded its byte bound');chunks.push(chunk);}
    const code=await lifecycle.closed;
    if(controller.signal.aborted||lifecycle.error()||code!==0)throw new AgentFailure('fatal','OpenCode metadata inspection failed or timed out');
    return Buffer.concat(chunks).toString('utf8');
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);await lifecycle.dispose();}
}
export const openCodeVersion = '2.1.2';
export function openCodeProjectReadiness(cwd) {
  let directory;try{directory=realpathSync(cwd);}catch{return {executionSupported:false,diagnostic:'OpenCode project identity could not be verified.'};}
  for(;;){if(statExists(join(directory,'.git')))return {executionSupported:false,diagnostic:'OpenCode 2.1.2 Git-backed execution is blocked: real git subprocesses denied by CODOVYN; metadata-only broker inspection is experimental. Task-bound execution and provider file-access revalidation are not verified; authentication cannot remove these gates.'};const parent=dirname(directory);if(parent===directory)break;directory=parent;}
  return {executionSupported:process.platform==='darwin'&&process.arch==='arm64',diagnostic:'Non-Git metadata inspection only; this does not prove authenticated Git-backed execution.'};
}
/** Installation, process-policy compatibility and authentication are separate facts.
 * Never promote a cached catalogue or a successful --version into readiness. */
export function openCodeProviderStatus(installation,cwd) {
  const compatible=installation?.compatible===true&&installation.version===openCodeVersion;
  const project=openCodeProjectReadiness(cwd);
  return {executionSupported:compatible&&project.executionSupported,
    compatibility:compatible?'version-compatible':'unsupported-version',
    readiness:!compatible?'blocked-version':!project.executionSupported?'blocked-project-boundary':'initialization-unverified',
    metadataInitialization:'not-verified',authentication:'unknown',availability:'unknown',
    diagnostic:!compatible?'Only OpenCode 2.1.2 is verified; this executable cannot run CODOVYN tasks.':project.diagnostic};
}
function requireProjectReadiness(cwd){const readiness=openCodeProjectReadiness(cwd);if(!readiness.executionSupported)throw new AgentFailure('fatal',readiness.diagnostic);}

const modelName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$/.test(value) && value.includes('/');
export const discoveredModelId = (provider, model) => `discovered-${provider}-${createHash('sha256').update(model).digest('hex').slice(0,24)}`;

export function resolveOpenCodeCommand(configured = process.env.CODOVYN_OPENCODE_COMMAND) {
  if (configured && !isAbsolute(configured)) throw new TypeError('OpenCode executable must be an absolute path');
  const candidates = configured ? [configured] : (process.env.PATH || '').split(delimiter).map(part=>join(part,'opencode'));
  for(const candidate of candidates) try { const path=realpathSync(candidate); accessSync(path,constants.X_OK); if(statSync(path).isFile())return path; } catch {}
  throw new AgentFailure('fatal',configured?'Configured OpenCode executable is missing or not executable':'OpenCode CLI was not detected in the runtime PATH');
}
export async function inspectOpenCodeInstallation(configured) {
  const command=resolveOpenCodeCommand(configured);
  let stdout;try{stdout=await ownedOutput(command,['--version'],{timeoutMs:5000,maxBytes:4096,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME}});}catch{throw new AgentFailure('fatal','OpenCode version inspection failed');}
  const match=/^(?:opencode(?: v|\s+))?(\d+\.\d+\.\d+)\s*$/.exec(stdout.trim());
  if(!match)throw new AgentFailure('fatal','Unrecognized OpenCode CLI version response');
  return {command,version:match[1],compatible:match[1]===openCodeVersion,binarySha256:createHash('sha256').update(readFileSync(command)).digest('hex')};
}
export function parseOpenCodeModels(text) {
  if(typeof text!=='string'||Buffer.byteLength(text)>262144||text.includes('\x1b'))throw new TypeError('Unsupported or oversized OpenCode catalogue');
  const lines=text.trim()?text.trim().split(/\r?\n/):[];
  if(lines.length>512||lines.some(line=>!modelName(line)))throw new TypeError('OpenCode catalogue format is incompatible or exceeds 512 models');
  return [...new Set(lines)].map(model=>({id:discoveredModelId('opencode',model),provider:'opencode',model,reasoning:[],source:'discovered',availability:'unknown'}));
}
function optionValues(option) {
  if(!option||option.type!=='select'||!Array.isArray(option.options)||option.options.length>512)return [];
  return option.options.flatMap(group=>Array.isArray(group.options)?group.options:[group]).filter(entry=>typeof entry.value==='string'&&entry.value.length<=256);
}
function configOption(session,id) { return Array.isArray(session?.configOptions)?session.configOptions.find(option=>option.id===id):null; }
async function begin(connection,cwd,model,variant,write) {
  const initialized=await connection.request('initialize',{protocolVersion:1,clientInfo:{name:'codovyn',version:'0.1.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});
  if(initialized?.protocolVersion!==1)throw new AgentFailure('fatal','Unsupported ACP protocol version');
  let session=await connection.request('session/new',{cwd,mcpServers:[]});
  if(typeof session?.sessionId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(session.sessionId))throw new AgentFailure('fatal','Invalid ACP session identity');
  if(model){
    if(!optionValues(configOption(session,'model')).some(entry=>entry.value===model))throw new AgentFailure('fatal','Selected OpenCode model is not advertised for this session');
    const updated=await connection.request('session/set_config_option',{sessionId:session.sessionId,configId:'model',value:model});
    if(configOption(updated,'model')?.currentValue!==model)throw new AgentFailure('fatal','OpenCode did not confirm the selected model');
    session={...session,...updated};
  }
  if(variant){
    if(!optionValues(configOption(session,'effort')).some(entry=>entry.value===variant))throw new AgentFailure('fatal','Selected OpenCode variant is unsupported');
    const updated=await connection.request('session/set_config_option',{sessionId:session.sessionId,configId:'effort',value:variant});
    if(configOption(updated,'effort')?.currentValue!==variant)throw new AgentFailure('fatal','OpenCode did not confirm the selected variant');
    session={...session,...updated};
  }
  const mode=write?'build':'plan';
  if(!optionValues(configOption(session,'mode')).some(entry=>entry.value===mode))throw new AgentFailure('fatal','OpenCode cannot enforce the requested task mode');
  const selectedMode=await connection.request('session/set_config_option',{sessionId:session.sessionId,configId:'mode',value:mode});
  if(configOption(selectedMode,'mode')?.currentValue!==mode)throw new AgentFailure('fatal','OpenCode did not confirm the requested task mode');
  session={...session,...selectedMode};
  if((model && configOption(session,'model')?.currentValue!==model)||(variant && configOption(session,'effort')?.currentValue!==variant))throw new AgentFailure('fatal','OpenCode changed the accepted model or variant while setting task mode');
  return session;
}
function scopePath(cwd,path,write) {
  if(typeof path!=='string'||path.length>4096)return false;
  const candidate=resolve(cwd,path), rel=relative(cwd,candidate);
  if(rel==='..'||rel.startsWith('../')||isAbsolute(rel)||rel.split('/').some(part=>part==='.git'||part==='.opencode'||part.startsWith('.env')))return false;
  try { const existing=write&&!statExists(candidate)?realpathSync(dirname(candidate)):realpathSync(candidate);const actual=relative(cwd,existing);return actual!== '..'&&!actual.startsWith('../')&&!isAbsolute(actual); }catch{return false;}
}
function statExists(path){try{lstatSync(path);return true;}catch{return false;}}
export async function discoverOpenCode({cwd,stateDirectory,configured,model,modelId,signal}={}) {
  const installation=await inspectOpenCodeInstallation(configured);
  if(!installation.compatible)throw new AgentFailure('fatal',`OpenCode ${installation.version} is unverified; supported version is ${openCodeVersion}`);
  if(!openCodeProjectReadiness(cwd).executionSupported){
    const {inspectBrokeredOpenCode}=await import('./opencode-metadata.js');
    return inspectBrokeredOpenCode({cwd,stateDirectory,installation,model,modelId,signal});
  }
  return inspectOpenCodeMetadataBoundary({installation,boundary:openCodeBoundary({cwd,stateDirectory,command:installation.command}),model,modelId,signal});
}
/** Host metadata path only; never sends a prompt and never returns a session. */
export async function inspectOpenCodeMetadataBoundary({installation,boundary,model,modelId,signal}) {
  const started=performance.now(),ownedGroups=[];
  const stdout=await ownedOutput(boundary.command,[...boundary.prefixArgs,'models','--standalone'],{...boundary,signal,ownedGroups});
  const models=parseOpenCodeModels(stdout);
  if(modelId){const selected=models.find(entry=>entry.id===modelId);if(!selected)throw new AgentFailure('fatal','Selected OpenCode model is no longer in the discovered catalogue');model=selected.model;}
  const connection=new AcpConnection({...boundary,args:[...boundary.prefixArgs,'acp'],signal,execution:{starting(){},spawned(info){if(info.pid)ownedGroups.push(info.pid);},stopped(){}}});
  try{
    const session=await begin(connection,boundary.cwd,model,undefined,false);
    const selected=configOption(session,'model')?.currentValue;
    const entry=models.find(entry=>entry.model===selected);
    if(entry)entry.reasoning=optionValues(configOption(session,'effort')).map(option=>option.value).filter(value=>value!=='default'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value));
    return {provider:'opencode',...installation,models,defaultModel:!model?selected:null,selectedModel:selected,metadataOwnedGroups:ownedGroups,metadataSessionIdHash:createHash('sha256').update(session.sessionId).digest('hex'),elapsedMs:performance.now()-started,authentication:'unknown',availability:'unknown',isolatedAuthentication:true};
  }finally{await connection.dispose();}
}
export function createOpenCodeAdapter({cwd,stateDirectory,command,write=false,model,reasoning}={},runtime={inspect:inspectOpenCodeInstallation,boundary:openCodeBoundary}) {
  if(typeof write !== 'boolean')throw new TypeError('OpenCode write scope must be explicit');
  if(model!==undefined&&!modelName(model))throw new TypeError('Invalid OpenCode model');
  if(reasoning!==undefined&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(reasoning))throw new TypeError('Invalid OpenCode variant');
  if(write&&!lstatSync(join(cwd,'.git')).isFile())throw new AgentFailure('fatal','OpenCode writes require an isolated Git draft worktree');
  return {id:'opencode',capabilities:{streaming:true,tools:true,writes:write,shell:false,resume:false,automaticHandoff:false,usage:false},
    async availability(){try{return (runtime.boundary!==openCodeBoundary||openCodeProjectReadiness(cwd).executionSupported)&&(await runtime.inspect(command)).compatible&&process.platform==='darwin'?'available':'unavailable';}catch{return 'unavailable';}},
    async *run({handoff,signal,execution}){
      const installation=await runtime.inspect(command);
      if(!installation.compatible)throw new AgentFailure('fatal','OpenCode version is not verified');
      if(runtime.boundary===openCodeBoundary)requireProjectReadiness(cwd);
      const boundary=runtime.boundary({cwd,stateDirectory,command:installation.command,write});
      const events=[],actions=new Set();let wake,sessionId=null,violation=false,textBytes=0;
      const enqueue=event=>{if(events.length>=256)throw new AgentFailure('fatal','OpenCode event backlog exceeded bound');events.push(event);wake?.();};
      const connection=new AcpConnection({...boundary,args:[...boundary.prefixArgs,'acp'],execution,onRequest:(method,params)=>{
        if(method!=='session/request_permission'){violation=true;enqueue({type:'permission',status:'denied',action:'unsupported-client-capability'});queueMicrotask(()=>connection.fail(new AgentFailure('fatal','OpenCode requested an unadvertised client capability')));return null;}
        const tool=params?.toolCall,kind=tool?.kind;
        const paths=[...(Array.isArray(tool?.locations)?tool.locations.map(entry=>entry.path):[]),...[tool?.rawInput?.filePath,tool?.rawInput?.path,tool?.rawInput?.file].filter(Boolean)];
        const allowed=params.sessionId===sessionId&&!tool?._meta&&['read','search',...(write?['edit']:[])].includes(kind)&&paths.length>0&&paths.length<=50&&paths.every(path=>scopePath(boundary.cwd,path,write&&kind!=='read'&&kind!=='search'));
        const choice=allowed&&Array.isArray(params.options)?params.options.find(option=>option.kind==='allow_once'):null;
        if(!choice){violation=true;queueMicrotask(()=>connection.fail(new AgentFailure('fatal','OpenCode permission request was denied; task stopped')));}
        enqueue({type:'permission',status:choice?'approved-scope':'denied',action:['read','search','edit','execute','think','fetch','other'].includes(kind)?kind:'unknown'});
        return {outcome:choice?{outcome:'selected',optionId:choice.optionId}:{outcome:'cancelled'}};
      },onUpdate:params=>{
        if(!sessionId&&!['agent_message_chunk','tool_call','tool_call_update'].includes(params?.update?.sessionUpdate))return;
        if(params?.sessionId!==sessionId)throw new AgentFailure('fatal','ACP notification belongs to another session');
        const update=params.update;
        if(update?.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){
          if(typeof update.content.text!=='string'||Buffer.byteLength(update.content.text)>65536||(textBytes+=Buffer.byteLength(update.content.text))>1048576)throw new AgentFailure('fatal','OpenCode response exceeded text bound');
          if(update.content.text)enqueue({type:'text',text:update.content.text});
        }else if(['tool_call','tool_call_update'].includes(update?.sessionUpdate)){
          const id=update.toolCallId;if(typeof id!=='string'||id.length>128)throw new AgentFailure('fatal','Invalid OpenCode tool identity');
          if(update.sessionUpdate==='tool_call'){if(actions.has(id)||actions.size>=256)throw new AgentFailure('fatal','Repeated or excessive OpenCode tool action');actions.add(id);enqueue({type:'tool-start',actionId:id,action:write&&update.kind==='edit'?'file_change':update.kind||'tool'});if(!['read','search','think',...(write?['edit']:[])].includes(update.kind)){violation=true;throw new AgentFailure('fatal','OpenCode requested an unsupported tool capability');}}
          if(['completed','failed'].includes(update.status)){if(!actions.has(id))throw new AgentFailure('fatal','OpenCode completed an unknown tool action');actions.delete(id);enqueue({type:'tool-complete',actionId:id,action:update.kind||'tool'});}
        }
      }});
      const abort=()=>{try{if(sessionId)connection.notify('session/cancel',{sessionId});}catch{}connection.fail(new AgentFailure('cancelled','OpenCode task cancelled'));};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      try{
        const session=await begin(connection,boundary.cwd,model,reasoning,write);sessionId=session.sessionId;
        enqueue({type:'session',sessionId,model:configOption(session,'model')?.currentValue,reasoning:configOption(session,'effort')?.currentValue});
        let result,error,settled=false;
        const prompt=connection.request('session/prompt',{sessionId,prompt:[{type:'text',text:JSON.stringify(handoff.contextFlow?validateContextFlow(handoff.contextFlow):createHandoffPacket(handoff))}]},120000).then(value=>{result=value;},failure=>{error=failure;}).finally(()=>{settled=true;wake?.();});
        while(!settled||events.length){if(events.length)yield events.shift();else await new Promise(resolve=>{wake=resolve;});}
        await prompt;
        if(error)throw error;if(signal?.aborted)throw new AgentFailure('cancelled','OpenCode task cancelled');
        if(violation||actions.size)throw new AgentFailure('fatal','OpenCode permission refusal or unresolved tool action requires review');
        if(result?.stopReason!=='end_turn')throw new AgentFailure('fatal','OpenCode stopped without a verified completed turn');
        await connection.dispose();yield {type:'completed'};
      }finally{signal?.removeEventListener('abort',abort);await connection.dispose();}
    }};
}
