const {spawn}=require('node:child_process');const{join}=require('node:path');
const nativeDefault='/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex';
/** Host-owned native dialogs only. No webview approval handler, key input,
 * output channel logging, or arbitrary provider command supplied by a model. */
function registerCodexSession(api,context,{runtimePath,dataDirectory,present=()=>{},ensureChat=()=>{},launch=spawn}){
 let session=null;
 const send=value=>{if(!session||session.child.exitCode!==null)throw new Error('Sign in to isolated Codex first');session.child.stdin.write(JSON.stringify(value)+'\n');};
 const stop=()=>{if(session){try{session.child.stdin.end(JSON.stringify({type:'close'})+'\n');}catch{}session=null;}};
 const signIn=async()=>{
  if(!api.workspace.isTrusted||!api.workspace.workspaceFolders?.[0])return api.window.showWarningMessage('Open a trusted project first. Only the disposable Calculator is eligible for the initial validation request.');
  if(await api.window.showWarningMessage('Sign in to an isolated Codex session?',{modal:true,detail:'Official device sign-in. Credentials stay in memory in a private provider process; global Codex accounts are untouched. No model request is sent. Sign-in expires when this session or IDE closes.'},'Sign in to isolated Codex')!=='Sign in to isolated Codex')return;
  stop();const root=api.workspace.workspaceFolders[0].uri.fsPath,native=api.workspace.getConfiguration('codovyn').get('codexNativePath','')||nativeDefault;
  if(!native.startsWith('/')||/[\0\r\n]/.test(native))throw new Error('An absolute pinned Codex executable is required');
  const child=launch(runtimePath(api,context),[join(context.extensionPath,'apps/cli/src/codex-session.js'),root,dataDirectory(context.globalStorageUri.fsPath),native],{cwd:root,shell:false,stdio:['pipe','pipe','pipe']});
  const owned={child,models:[],authenticated:false,root,buffer:'',bytes:0,pendingSignIn:true};session=owned;child.stderr.resume();child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{if(session!==owned)return;owned.bytes+=chunk.length;if(owned.bytes>2097152){stop();return;}owned.buffer+=chunk.toString('utf8');let at;while((at=owned.buffer.indexOf('\n'))!==-1){const line=owned.buffer.slice(0,at);owned.buffer=owned.buffer.slice(at+1);let message;try{message=JSON.parse(line);}catch{stop();return;}handle(message,owned).catch(()=>{stop();api.window.showWarningMessage('The isolated Codex session stopped. No automatic retry was made.');});}});
  child.once('error',()=>{if(session===owned)session=null;api.window.showWarningMessage('Could not start supported Codex. Configure its absolute native executable path in CODOVYN settings.');});child.once('close',()=>{if(session===owned)session=null;});
 };
 async function handle(message,owned){
  if(message.type==='status'){owned.authenticated=message.authenticated===true;if(Array.isArray(message.models))owned.models=message.models.filter(m=>typeof m.model==='string'&&Array.isArray(m.efforts)).slice(0,100);if(owned.pendingSignIn){owned.pendingSignIn=false;send({type:'sign-in'});}else if(owned.authenticated)api.window.showInformationMessage('Codex signed in for isolated validation. Inference has not been verified; requests require separate approval.');return;}
  if(message.type==='device'){
   if(message.url!=='https://auth.openai.com/codex/device'||typeof message.code!=='string'||!/^[A-Z0-9-]{4,32}$/.test(message.code))throw new Error('Invalid official login response');
   const choice=await api.window.showInformationMessage(`Codex device sign-in: enter ${message.code} on the official page.`,{modal:true},'Open official sign-in page','Cancel sign-in');
   if(session!==owned)return;if(choice==='Open official sign-in page')await api.env.openExternal(api.Uri.parse(message.url));else stop();return;
  }
  if(message.type==='review'){
   if(owned.reviewPending)throw new Error('Repeated native consent request');owned.reviewPending=true;owned.proposal=message;owned.timeline=[];
   if(!owned.authenticated||message.provider!=='codex'||message.maxRequests!==1||message.maxMcpToolCalls!==0||message.maxRequestMs!==120000||message.workspace!==owned.root||typeof message.digest!=='string'||!/^[a-f0-9]{64}$/.test(message.digest)||typeof message.prompt!=='string'||message.prompt.length>32768)throw new Error('Invalid bounded campaign review');
   const choice=await api.window.showWarningMessage('Approve one real Codex Ask request?',{modal:true,detail:`Provider: Codex\nModel: ${message.model}\nEffort: ${message.effort}\nWorkspace: ${message.workspace}\nRead-only approved excerpt; zero tools or writes. One submission, 120-second local deadline, no host retry or fallback. May consume quota or paid credits. Internal provider calls, tokens and exact cost are unknown.\n\n${message.prompt}`},'Approve one Codex Ask');
   if(session===owned&&choice==='Approve one Codex Ask'){present({type:'starting'});send({type:'approve',digest:message.digest});}else stop();return;
  }
  if(message.type==='event'){
   if(message.event?.kind==='execution-owned'){present({type:'history',request:owned.proposal?.prompt||'',status:'running',taskId:message.taskId,timeline:[]});present({type:'running',taskId:message.taskId});}
   if(message.event?.kind==='agent-event'&&message.event.data?.event?.type==='text'){const entry={type:'message',text:message.event.data.event.text};owned.timeline.push(entry);present({type:'progress',entries:[entry]});}return;
  }
  if(message.type==='result'){present({type:'result',taskId:message.taskId,status:message.status,timeline:owned.timeline||[]});api.window.showInformationMessage(`Codex validation ended: ${message.status}. Inspect the persisted task and accounting; no automatic retry.`);return;}
  if(message.type==='error')api.window.showWarningMessage(typeof message.message==='string'?message.message.slice(0,300):'Codex session failed');
 }
 const validate=async()=>{ensureChat();if(!session?.authenticated)return api.window.showWarningMessage('Sign in to isolated Codex first. Model catalogue presence is not authentication.');const model=await api.window.showQuickPick(session.models.map(m=>({label:m.model,efforts:m.efforts})),{title:'Select the exact model for one disposable read-only validation request'});if(!model)return;const effort=await api.window.showQuickPick(model.efforts,{title:'Select advertised reasoning effort'});if(effort)send({type:'prepare',model:model.label,effort});};
 const commands=[['codovyn.codexSignIn',signIn],['codovyn.codexValidateAsk',validate],['codovyn.codexSignOut',async()=>{if(session)send({type:'sign-out'});}],['codovyn.codexCancel',stop]].map(([name,handler])=>api.commands.registerCommand(name,handler));
 context.subscriptions.push(...commands,{dispose:stop});return {stop};
}
module.exports={registerCodexSession};
