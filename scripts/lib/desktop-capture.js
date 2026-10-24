import {createServer} from 'node:net';
/** A disposable native test owns this port; never capture the user's display. */
export async function desktopDebugPort() {
 const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
export function desktopWindowTarget(targets) {
 if(!Array.isArray(targets)||targets.length>128)throw new Error('Invalid native debug targets');
 const pages=targets.filter(target=>target.type==='page'&&typeof target.url==='string'&&target.url.startsWith('vscode-file://')&&typeof target.title==='string'&&target.title.includes('CODOVYN'));
 if(pages.length!==1)throw new Error('Expected exactly one CODOVYN test window');return pages[0];
}
export async function captureDesktopWindow(port) {
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Native test debugging port required');
 const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(2000)});const body=await response.text();if(!response.ok||body.length>1048576)throw new Error('Invalid native debug response');
 const target=desktopWindowTarget(JSON.parse(body));const endpoint=new URL(target.webSocketDebuggerUrl);if(endpoint.hostname!=='127.0.0.1'||Number(endpoint.port)!==port||endpoint.protocol!=='ws:')throw new Error('Unexpected native debug endpoint');
 const socket=new WebSocket(endpoint);
 try{return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('CODOVYN window capture timed out')),5000);
  const fail=message=>{clearTimeout(timer);reject(new Error(message));};
  socket.addEventListener('error',()=>fail('CODOVYN capture connection failed'),{once:true});
  socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:false}})),{once:true});
  socket.addEventListener('message',({data})=>{try{if(data.length>28000000)return fail('Native capture exceeds bound');const result=JSON.parse(data);if(result.id!==1)return;if(result.error)return fail('Native window capture failed');const image=Buffer.from(result.result?.data||'','base64');if(image.length>20000000||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return fail('Invalid native capture image');clearTimeout(timer);resolve(image);}catch{fail('Invalid native capture response');}});
 });}finally{socket.close();}
}
