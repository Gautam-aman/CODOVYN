import{isTaskExecutionAuthority}from'../../task-engine/src/execution-authority.js';
import{isTaskFileAccessFor}from'./task-file-access.js';
import{createTaskPeerVerifier}from'./task-peer.js';
import{isTaskTlsFor}from'./task-mcp-tls.js';
const bridges=new WeakSet(),claimed=new WeakSet();
export const isTaskMcpBridge=value=>bridges.has(value);
const versions=new Set(['2025-11-25','2025-06-18','2025-03-26']);
const tool=Object.freeze({name:'read_project_text',description:'Read a bounded UTF-8 project file and its opaque version. Use that exact version for any write_project_text request. Hidden/sensitive paths, symlinks, hardlinks and nested repositories are denied. No commands.',inputSchema:{type:'object',properties:{path:{type:'string',minLength:1,maxLength:4095}},required:['path'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}});
const writeTool=Object.freeze({name:'write_project_text',description:'Publish bounded UTF-8 content only inside the approved isolated draft. Existing files require the exact opaque version returned by read_project_text; null permits new files only. Conflicts stop execution and require review. Original project is unchanged until patch approval. No shell, Git or external paths.',inputSchema:{type:'object',properties:{path:{type:'string',minLength:1,maxLength:4095},expectedVersion:{type:['string','null']},content:{type:'string',maxLength:65536}},required:['path','expectedVersion','content'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}});
/** Narrow task-owned versioned file MCP endpoint. Kernel socket ownership, process birth
 * and task leases authorize every request; no transferable bearer credential.
 * No public configuration, general filesystem RPC or source permissions added. */
export async function createTaskMcpBridge({execution,files,pid,peerReader,tls,deferred=false}){
 if(!isTaskExecutionAuthority(execution)||!isTaskTlsFor(tls,execution)||(deferred?(files!==undefined||pid!==undefined):!isTaskFileAccessFor(files,execution)))throw new Error('Matching host-issued task, file service and endpoint identity required');
 execution.verifyAdmission();if(!deferred)execution.verify();if(claimed.has(execution))throw new Error('Task MCP authority is single-use');claimed.add(execution);
 let peer=deferred?null:await createTaskPeerVerifier({execution,pid,reader:peerReader});
 const pending=new Set(),ids=new Set(),observations=[];const catalogueWaiters=new Set();let catalogueReady=false;let toolCalls=0;let attempts=0,closed=false,closing,url,initialized=false,ready=false,version,attaching=false,active=!deferred;
 const server=tls.server((request,response)=>{
  const work=handle(request,response);pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});
 });
 server.maxConnections=8;server.headersTimeout=3000;server.requestTimeout=7000;server.keepAliveTimeout=1000;
 const abort=()=>{close().catch(()=>{});};execution.signal.addEventListener('abort',abort,{once:true});
 function reply(response,status,value){if(response.destroyed)return;response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(value===undefined?'':JSON.stringify(value));}
 async function handle(request,response){
  if(closed||pending.size>=4||++attempts>256){reply(response,503);request.resume();return;}
  const socket=request.socket,deadline=setTimeout(()=>socket.destroy(),7000);request.setTimeout(2000,()=>socket.destroy());
  try{
   if(request.headers.host!==new URL(url).host||request.headers.origin&&request.headers.origin!==new URL(url).origin){reply(response,403);request.resume();return;}
   const target=new URL(request.url,url);if(target.origin!==new URL(url).origin||target.pathname!=='/mcp'||[...target.searchParams].some(([key,value])=>key!=='codemode'||value!=='false')){reply(response,404);request.resume();return;}
   if(!peer){reply(response,503);request.resume();return;}const generation=await peer.verify(socket);
   if(request.method==='GET'){reply(response,405);return;}
   if(request.method!=='POST'){reply(response,405);request.resume();return;}
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||'')){reply(response,415);request.resume();return;}
   if(request.headers['mcp-protocol-version']&&!versions.has(request.headers['mcp-protocol-version'])){reply(response,400);request.resume();return;}
   let chunks=[],bytes=0;for await(const chunk of request){bytes+=chunk.length;if(bytes>524288){response.destroy();return;}chunks.push(chunk);}request.setTimeout(0);
   let message;try{message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{reply(response,400);return;}
   if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||message.method.length>80){reply(response,400);return;}
   observations.push({route:target.pathname,method:['initialize','notifications/initialized','tools/list','tools/call','ping'].includes(message.method)?message.method:'unsupported',peerPid:peer.pid});
   if(message.id===undefined){if(message.method==='notifications/initialized'&&initialized){ready=true;reply(response,202);}else reply(response,400);return;}
   if(!(Number.isSafeInteger(message.id)||typeof message.id==='string'&&message.id.length<=80)||ids.has(message.id)||ids.size>=128){reply(response,400);return;}ids.add(message.id);
   let result,error;
   if(message.method==='initialize'){
    const requested=message.params?.protocolVersion;if(initialized||!versions.has(requested)){error={code:-32602,message:'Unsupported or repeated initialization'};}
    else{initialized=true;version=requested;result={protocolVersion:version,capabilities:{tools:{}},serverInfo:{name:'codovyn-task-files',version:'1.0.0'}};}
   }else if(!ready||request.headers['mcp-protocol-version']&&request.headers['mcp-protocol-version']!==version){error={code:-32600,message:'Task tool session is not ready'};
   }else if(message.method==='tools/list'){result={tools:[tool,...(files.writes?[writeTool]:[])]};
   }else if(message.method==='ping'){result={};
   }else if(message.method==='tools/call'&&!active){error={code:-32003,message:'Task file execution is not authorized'};
   }else if(message.method==='tools/call'&&toolCalls>=8){error={code:-32004,message:'Task file tool budget exhausted; no automatic retry is authorized'};
   }else if(message.method==='tools/call'){
    // Reserve synchronously before awaiting any operation. Invalid or denied
    // active calls count too; catalogue traffic cannot reset this task budget.
    toolCalls++;
    try{if(execution.verify().executable!==process.execPath)execution.requireInferenceApproval();execution.consumeInferenceTool();}catch{error={code:-32004,message:'Campaign file tool authority or budget is exhausted'};}
    const args=message.params?.arguments;
    if(error){/* Durable budget denial precedes all file access. */}
    else if(!args||Array.isArray(args)||typeof args.path!=='string'){error={code:-32602,message:'Unsupported task file operation'};}
    else if(message.params?.name==='read_project_text'&&Object.keys(args).length===1)try{const file=await files.inspect(args.path);result={content:[{type:'text',text:JSON.stringify({path:args.path,text:file.text,version:file.version})}]};}catch{result={isError:true,content:[{type:'text',text:'Project read denied by task policy'}]};}
    else if(message.params?.name==='write_project_text'&&files.writes&&Object.keys(args).sort().join(',')==='content,expectedVersion,path')try{result={content:[{type:'text',text:JSON.stringify(await files.write(args))}]};}catch{result={isError:true,content:[{type:'text',text:'Draft write denied, conflicted or interrupted; inspect task review before retrying'}]};}
    else error={code:-32602,message:'Unsupported task file operation'};
   }else{error={code:-32601,message:'Unsupported task tool method'};}
   if(closed||socket.destroyed||await peer.verify(socket)!==generation){response.destroy();return;}
   reply(response,200,{jsonrpc:'2.0',id:message.id,...(error?{error}:{result})});if(!error&&message.method==='tools/list'){catalogueReady=true;for(const done of catalogueWaiters)done();}
  }catch{reply(response,403);request.resume();}finally{clearTimeout(deadline);}
 }
 function close(){if(closing)return closing;closing=(async()=>{closed=true;active=false;for(const done of catalogueWaiters)done(new Error('Task catalogue readiness revoked'));execution.signal.removeEventListener('abort',abort);execution.revoke();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...pending]);})();return closing;}
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});url='https://127.0.0.1:'+server.address().port+'/mcp';server.on('error',abort);}catch(error){execution.revoke();throw error;}
 const bridge=Object.freeze({workspace:execution.workspace,configured:deferred,activate(){if(execution.verify().executable!==process.execPath)execution.requireInferenceApproval();if(closed||!peer||active)throw new Error('Task tool activation is unavailable or already used');active=true;},waitForCatalogue(){execution.verify();if(catalogueReady)return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(new Error('Task MCP catalogue readiness deadline exceeded')),5000);const done=error=>{clearTimeout(timer);catalogueWaiters.delete(done);error?reject(error):resolve();};catalogueWaiters.add(done);});},configuration(){execution.verifyAdmission();return {name:'codovyn_task_files',url};},async attach(service,processId){if(!deferred||peer||attaching||!isTaskFileAccessFor(service,execution))throw new Error('Task MCP attachment is single-use and scope-bound');attaching=true;try{peer=await createTaskPeerVerifier({execution,pid:processId,reader:peerReader});files=service;}catch(error){execution.revoke();throw error;}},allows(name){return name==='codovyn_task_files_read_project_text'||files?.writes&&name==='codovyn_task_files_write_project_text';},get toolBudget(){return Object.freeze({limit:8,consumed:toolCalls,remaining:8-toolCalls});},get observations(){return observations.map(value=>({...value}));},descriptor(){execution.verify();if(closed)throw new Error('Task MCP bridge is closed');return {type:'http',name:'codovyn_task_files',url,headers:[]};},close});bridges.add(bridge);return bridge;
}
