import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {captureOpenCodeServer} from '../src/opencode-process.js';
import {manageAgentProcess} from '../src/process.js';

// Independent lifecycle witnesses: one child honors the upstream stdin lease;
// the other deliberately survives its owner so cleanup must fail closed.
for(const honorsLease of [true,false])test(`private server cleanup ${honorsLease?'accepts lease EOF':'rejects a surviving server'}`,{skip:process.platform!=='darwin',timeout:10000},async()=>{
 const serverCode=honorsLease?"process.stdin.resume();process.stdin.on('end',()=>process.exit(0));":"setInterval(()=>{},1000);";
 const ownerCode=`const {spawn}=require('child_process');const s=spawn(process.execPath,['-e',${JSON.stringify(serverCode)}],{detached:true,stdio:['pipe','ignore','ignore']});console.log(s.pid);setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['-e',ownerCode],{detached:true,stdio:['pipe','pipe','pipe']});
 const owner=manageAgentProcess(child);let server,serverPid;
 try{
  serverPid=Number((await once(child.stdout,'data'))[0].toString().trim());
  assert.ok(Number.isSafeInteger(serverPid)&&serverPid>0);
  server=await captureOpenCodeServer(child,process.execPath);
  assert.equal(server.pid,serverPid);
  await owner.dispose();
  if(honorsLease)await server.verifyStopped();
  else await assert.rejects(server.verifyStopped(),/cleanup is unverified; retain execution ownership/);
 }finally{
  await owner.dispose();
  // This PID came directly from our own witness, never a process-name search.
  if(serverPid)try{process.kill(-serverPid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
  if(server)await server.verifyStopped();
 }
});
