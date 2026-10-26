import{isCodexAuthenticationBoundary,verifyCodexControlExecutable}from'./codex-control.js';
/** Official CLI metadata only; credentials/output never escape this component. */
import{spawn}from'node:child_process';import{manageAgentProcess}from'./process.js';import{assertCodexIdentity}from'./codex-identity.js';
export async function codexStoredLoginStatus(boundary,{signal,onProcess=()=>{}}={}){
 if(!isCodexAuthenticationBoundary(boundary))throw new Error('Dedicated authentication boundary required');assertCodexIdentity(boundary.identity);verifyCodexControlExecutable(boundary.executable);
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const child=spawn(boundary.command,[...boundary.prefixArgs,'login','status'],{cwd:boundary.cwd,env:boundary.env,shell:false,detached:true,stdio:['pipe','pipe','pipe']}),managed=manageAgentProcess(child,controller.signal);onProcess(child.pid);child.stdin.end();let output='',bytes=0,timedOut=false;
 const collect=data=>{bytes+=data.length;if(bytes>8192){controller.abort();return;}output+=data.toString('utf8');};child.stdout.on('data',collect);child.stderr.on('data',collect);
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},5000);
 try{await managed.closed;if(timedOut||signal?.aborted||bytes>8192)throw new Error('Secure credential status unavailable or cancelled; no file fallback');if(child.exitCode===0)return {stored:true,storage:'keyring'};if(child.exitCode===1&&/(?:^|\n)Not logged in\s*$/.test(output))return {stored:false,storage:'keyring'};throw new Error('OS credential store unavailable, locked or denied; no file fallback');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await managed.dispose();output='';}
}
