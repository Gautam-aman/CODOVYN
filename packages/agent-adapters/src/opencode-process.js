import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AgentFailure} from '../../agent-core/src/index.js';
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Pinned OpenCode 2.1.2 launches one private --stdio server in its own group.
 * The upstream lease pipe terminates it even after abrupt client/owner death.
 * Observe only our launched client's children; never signal a discovered PID. */
export async function captureOpenCodeServer(child,executable,signal) {
 const deadline=Date.now()+5000;let server;
 const snapshot=async()=>{
  const {stdout}=await execute('/bin/ps',['-axo','pid=,ppid=,pgid=,stat=,comm='],{timeout:2000,maxBuffer:1048576});
  return stdout.trim().split('\n').map(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);if(!m)throw new Error('Invalid process ownership snapshot');return {pid:+m[1],parent:+m[2],group:+m[3],state:m[4],command:m[5]};});
 };
 if(!Number.isSafeInteger(child.pid)||child.pid<1)throw new AgentFailure('fatal','OpenCode client did not register process ownership');
 while(Date.now()<deadline){
  if(signal?.aborted)throw new AgentFailure('cancelled','OpenCode server discovery cancelled');
  const rows=await snapshot(),children=rows.filter(row=>row.parent===child.pid&&!row.state.startsWith('Z'));
  if(children.length){
   if(children.length!==1||children[0].command!==executable||![child.pid,children[0].pid].includes(children[0].group))throw new AgentFailure('fatal','OpenCode private server ownership is unsupported');
   server=children[0];break;
  }
  if(child.exitCode!==null||child.signalCode!==null)throw new AgentFailure('fatal','OpenCode exited before private server ownership was observed');
  await pause(25); // Poll a real readiness condition, bounded by the deadline.
 }
 if(!server)throw new AgentFailure('fatal','OpenCode private server ownership deadline exceeded');
 return {pid:server.pid,group:server.group,
  async verifyStopped(){
   const stopDeadline=Date.now()+2000;
   do{const rows=await snapshot();if(!rows.some(row=>(row.pid===server.pid||row.group===server.group)&&!row.state.startsWith('Z')))return;await pause(25);}while(Date.now()<stopDeadline);
   throw new AgentFailure('fatal','OpenCode private server cleanup is unverified; retain execution ownership');
  }
 };
}
