import net from 'node:net';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {repositoryTool,isRepositoryAuthority,claimRepositoryAuthority} from './repository-identity.js';
const cstring=value=>'"'+[...Buffer.from(value)].map(b=>'\\'+b.toString(8).padStart(3,'0')).join('')+'"';
/** A metadata-only lease never authorizes session/prompt or tool execution. */
export async function createRepositoryBroker(authority,{signal}={}) {
 if(!isRepositoryAuthority(authority))throw new Error('A host-issued repository authority is required');
 if(!claimRepositoryAuthority(authority))throw new Error('Repository authority is already bound to a broker');
 await authority.read();
 const directory=realpathSync(mkdtempSync('/private/tmp/codovyn-rb-'));const rel=relative(authority.identity.root,directory);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')){rmSync(directory,{recursive:true,force:true});throw new Error('Repository broker must be outside the project');}
 const bin=join(directory,'client');mkdirSync(bin,{mode:0o700});
 const endpoint=join(directory,'socket'),capability=randomBytes(32).toString('hex');
 const values={...authority.identity,endpoint,capability};
 writeFileSync(join(bin,'client-config.h'),['root','gitDirectory','commonDirectory','endpoint','capability'].map(key=>`static const char *${key}=${cstring(values[key])};`).join('\n'),{mode:0o600});
 const source=readFileSync(new URL('../native/repository-client.c',import.meta.url));writeFileSync(join(bin,'client.c'),source,{mode:0o600});
 const command=join(bin,'git');const compiled=await repositoryTool('/usr/bin/xcrun',['clang','-std=c11','-D_DARWIN_C_SOURCE','-O2','-fstack-protector-strong','-D_FORTIFY_SOURCE=2','-Wall','-Wextra','-Werror',join(bin,'client.c'),'-o',command],{timeoutMs:30000,signal});if(compiled.code!==0)throw new Error('Repository client compilation failed');
 const signed=await repositoryTool('/usr/bin/codesign',['-s','-','--options','runtime',command],{signal});if(signed.code!==0)throw new Error('Repository client signature failed');
 const binarySha256=createHash('sha256').update(readFileSync(command)).digest('hex');chmodSync(command,0o500);chmodSync(bin,0o500);
 const sockets=new Set(),pending=new Set(),queries=[];let closing=false,total=0,cleanupFailure=null;
 const server=net.createServer(socket=>{
  if(closing||sockets.size>=4){socket.destroy();return;}sockets.add(socket);let frame='',handled=false;socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.on('data',chunk=>{
   if(handled){socket.destroy();return;}frame+=chunk.toString('utf8');if(frame.length>16384){socket.destroy();return;}if(!frame.endsWith('\n'))return;handled=true;socket.setTimeout(9000,()=>{authority.revoke();socket.destroy();});
   const work=(async()=>{
    let code=126,text='',authenticated=false;const started=performance.now();
    try{
     const match=/^1 ([0-9a-f]{64}) ([1-4]) ([0-9a-f]{2,8192})\n$/.exec(frame);if(!match||match[3].length%2||!timingSafeEqual(Buffer.from(match[1]),Buffer.from(capability))||++total>128)throw new Error('Invalid bounded metadata request');
     authenticated=true;const cwd=Buffer.from(match[3],'hex').toString('utf8');if(cwd.includes('\0')||Buffer.from(cwd).toString('hex')!==match[3])throw new Error('Invalid metadata path');
     const state=await authority.read(cwd);switch(Number(match[2])){
      case 1:text=`${state.gitDirectory}\n${state.commonDirectory}\n${state.root}\n`;code=0;break;
      case 2:text=state.head?state.head+'\n':'';code=state.head?0:1;break;
      case 3:text=state.branch?state.branch+'\n':'';code=state.branch?0:1;break;
      case 4:{const roots=await authority.roots(cwd);text=roots.length?roots.join('\n')+'\n':'';code=roots.length?0:1;break;}
     }
     // Revalidate authorization and current state immediately before responding.
     const after=await authority.read(cwd);if(after.fingerprint!==state.fingerprint)throw new Error('Repository state changed before broker response');
     if(Buffer.byteLength(text)>16384)throw new Error('Metadata response exceeds bound');
    }catch(error){if(authenticated)authority.revoke();if(error?.kind==='fatal')cleanupFailure=error;code=126;text='';}
    queries.push({code,elapsedMs:performance.now()-started});if(!socket.destroyed)socket.end(`${code} ${Buffer.from(text).toString('hex')}\n`);
   })();pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,resolve);});chmodSync(endpoint,0o600);
 let closed;
 return Object.freeze({directory,command,bin,endpoint,binarySha256,ownedGroups:[compiled.pid,signed.pid],sourceSha256:createHash('sha256').update(source).digest('hex'),queries,
  boundary(base){
   if(createHash('sha256').update(readFileSync(command)).digest('hex')!==binarySha256)throw new Error('Repository client integrity changed');
   if(base.cwd!==authority.identity.root)throw new Error('Broker boundary belongs to another project');
   const profile=base.prefixArgs[1]+`\n(allow process-exec (literal ${JSON.stringify(command)}))\n(allow file-read* (subpath ${JSON.stringify(bin)}))\n(deny file-write* (subpath ${JSON.stringify(directory)}))\n(deny file-read-data (subpath ${JSON.stringify(authority.identity.root)}))\n(allow file-read-data (require-all (subpath ${JSON.stringify(authority.identity.root)}) (vnode-type DIRECTORY)))\n(deny file-write* (subpath ${JSON.stringify(authority.identity.root)}))`;
   return {...base,prefixArgs:[base.prefixArgs[0],profile,...base.prefixArgs.slice(2)],env:{...base.env,PATH:bin+':'+base.env.PATH,OPENCODE_DISABLE_FILEWATCHER:'true',OPENCODE_DISABLE_FFF:'true'}};
  },
  close(){if(closed)return closed;closed=(async()=>{closing=true;const pinsClosed=authority.revoke();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...pending]);if(cleanupFailure)throw cleanupFailure;if(!pinsClosed)throw new Error('Repository descriptor cleanup unverified');chmodSync(bin,0o700);rmSync(directory,{recursive:true,force:true});})();return closed;}
 });
}
