import{createServer}from'node:https';import{createHash,X509Certificate}from'node:crypto';
import{mkdtempSync,realpathSync,writeFileSync,readFileSync,chmodSync,rmSync}from'node:fs';import{join,relative,isAbsolute}from'node:path';
import{isTaskExecutionAuthority}from'../../task-engine/src/execution-authority.js';import{repositoryTool}from'./repository-identity.js';
const materials=new WeakMap();
export const isTaskTlsFor=(material,execution)=>materials.has(material)&&materials.get(material)===execution;
/** Temporary endpoint identity, not provider credentials. The private key is
 * outside all provider read scopes; only the public certificate is readable.
 * Trust is additive and scoped to this provider process, never system-wide. */
export async function prepareTaskMcpTls({execution}){
 if(!isTaskExecutionAuthority(execution))throw new Error('Host-issued task authority required');execution.verifyAdmission();
 const directory=realpathSync(mkdtempSync('/private/tmp/codovyn-task-tls-')),config=join(directory,'openssl.cnf'),key=join(directory,'key.pem'),certificate=join(directory,'certificate.pem');let privateKey,closed=false;
 try{
  const rel=relative(execution.workspace,directory);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'))throw new Error('Task endpoint identity must be outside the project');
  writeFileSync(config,'[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=CODOVYN task endpoint\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n',{mode:0o600});
  const generated=await repositoryTool('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-config',config,'-keyout',key,'-out',certificate],{cwd:directory,signal:execution.signal,timeoutMs:10000,maxBytes:4096});if(generated.code!==0)throw new Error('Task endpoint certificate generation failed');
  chmodSync(key,0o600);chmodSync(certificate,0o400);privateKey=readFileSync(key);const publicCertificate=readFileSync(certificate),parsed=new X509Certificate(publicCertificate);if(!parsed.checkIP('127.0.0.1'))throw new Error('Invalid task endpoint certificate');
  execution.verifyAdmission();const digest=createHash('sha256').update(publicCertificate).digest('hex');
  const material=Object.freeze({certificatePath:certificate,certificateSha256:digest,ownedGroups:[generated.pid],
   boundary(base){execution.verifyAdmission();if(closed||base.cwd!==execution.workspace||base.command!=='/usr/bin/sandbox-exec'||base.prefixArgs?.[0]!=='-p')throw new Error('Task TLS boundary mismatch');
    if(base.env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&base.env.NODE_TLS_REJECT_UNAUTHORIZED!=='1'||base.env.BUN_TLS_REJECT_UNAUTHORIZED!==undefined||base.env.NODE_OPTIONS)throw new Error('Unsafe provider TLS/runtime overrides are refused');
    for(const [a,b]of [[base.stateDirectory,directory],[directory,base.stateDirectory]]){const rel=relative(a,b);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'))throw new Error('Provider private state cannot overlap endpoint identity material');}
    return {...base,prefixArgs:[base.prefixArgs[0],base.prefixArgs[1]+`\n(allow file-read-data (literal ${JSON.stringify(certificate)}))\n(deny file-write* (subpath ${JSON.stringify(directory)}))`,...base.prefixArgs.slice(2)],env:{...base.env,SSL_CERT_FILE:certificate,NODE_EXTRA_CA_CERTS:certificate}};
   },
   server(listener){execution.verifyAdmission();if(closed)throw new Error('Task endpoint identity closed');return createServer({key:privateKey,cert:publicCertificate,minVersion:'TLSv1.3',maxHeaderSize:8192},listener);},
   close(){if(closed)return;closed=true;privateKey.fill(0);rmSync(directory,{recursive:true,force:true});}
  });materials.set(material,execution);return material;
 }catch(error){privateKey?.fill(0);rmSync(directory,{recursive:true,force:true});throw error;}
}
