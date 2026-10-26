/** Compatibility witness only. Public invalid test credentials, no browser login,
 * no model requests. Never reads credentials or changes an owner's identity. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {createCodexIdentity} from '../packages/agent-adapters/src/codex-identity.js';
import {codexAuthenticationBoundary,codexControlBoundary,CodexControlConnection,verifyCodexControlExecutable} from '../packages/agent-adapters/src/codex-control.js';
import {manageAgentProcess} from '../packages/agent-adapters/src/process.js';
import {ownedProcessMembers} from './lib/desktop-process.js';
if(process.argv.length!==2)throw new Error('Non-inference compatibility test accepts no credentials or request arguments');
const base=realpathSync(mkdtempSync('/private/tmp/codovyn-auth-bridge-')),workspace=join(base,'project');mkdirSync(workspace);
const command='/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex';
const executable=verifyCodexControlExecutable(command),identity=createCodexIdentity({directory:join(base,'identity'),workspace});
const auth=codexAuthenticationBoundary({identity,stateDirectory:join(base,'auth'),command}),coding=codexControlBoundary({workspace,stateDirectory:join(base,'coding'),command});
const groups=[],result={sourceCommit:execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),executableSha256:executable.sha256,classification:'REAL OS / PINNED PROTOCOL COMPATIBILITY; NO REAL ACCOUNT OR INFERENCE',inferenceSubmissions:0,browserLogins:0,productionExecution:'blocked',groups};
async function cli(boundary,args,input=''){
 const controller=new AbortController(),child=spawn(boundary.command,[...boundary.prefixArgs,...args],{cwd:boundary.cwd,env:boundary.env,shell:false,detached:true,stdio:['pipe','pipe','pipe']}),managed=manageAgentProcess(child,controller.signal);groups.push(child.pid);let bytes=0;
 const discard=data=>{bytes+=data.length;if(bytes>65536)controller.abort();};child.stdout.on('data',discard);child.stderr.on('data',discard);child.stdin.end(input);const timer=setTimeout(()=>controller.abort(),10000);
 try{await managed.closed;assert.ok(!controller.signal.aborted,'CLI deadline/output bound');return child.exitCode;}finally{clearTimeout(timer);await managed.dispose();assert.deepEqual(await ownedProcessMembers(child.pid),[]);}
}
function locate(directory,name){for(const item of readdirSync(directory,{withFileTypes:true})){const path=join(directory,item.name);if(item.isDirectory()){const found=locate(path,name);if(found)return found;}else if(item.name===name)return path;}return null;}
try{
 // Generate schemas with the exact native binary, inside the unchanged coding profile.
 const schemas={};for(const experimental of [false,true]){const out=join(coding.stateDirectory,experimental?'experimental-schema':'stable-schema');assert.equal(await cli(coding,['app-server','generate-json-schema','--out',out,...(experimental?['--experimental']:[])]),0);const path=locate(out,'LoginAccountParams.json');assert.ok(path);const raw=readFileSync(path);schemas[experimental?'experimental':'stable']={sha256:createHash('sha256').update(raw).digest('hex'),value:JSON.parse(raw)};}
 const variants=schema=>(schema.oneOf||schema.anyOf).map(v=>({type:v.properties.type.const||v.properties.type.enum?.[0],required:v.required}));
 const stable=variants(schemas.stable.value),experimental=variants(schemas.experimental.value);assert.ok(stable.some(v=>v.type==='chatgptDeviceCode'));// The pin also emits this variant in its default schema: schema presence is not a stability guarantee.
 const imported=experimental.find(v=>v.type==='chatgptAuthTokens');assert.ok(imported?.required.includes('accessToken'));assert.ok(imported.required.includes('chatgptAccountId'));assert.equal(experimental.some(v=>v.required?.some(k=>/credentialHandle|authHandle|delegationHandle/i.test(k))),false);
 result.protocol={stableLoginVariants:stable,externalTokenImportInDefaultSchema:stable.some(v=>v.type==='chatgptAuthTokens'),externalTokenStability:'Source marks internal-only experimental; schema presence does not establish support',externalTokenImportRequiresRawToken:true,delegatedHandleInLoginSchema:false,stableLoginSchemaSha256:schemas.stable.sha256,experimentalLoginSchemaSha256:schemas.experimental.sha256};
 assert.equal(await cli(auth,['login','--with-api-key'],'codovyn-public-invalid-bridge-witness\n'),0);
 // Positive control uses the SAME official native binary and isolated identity.
 assert.equal(await cli(auth,['login','status']),0);result.authComponentRestoresPublicWitness=true;
 // This counterfactual test changes only CLI auth selection/environment, NEVER
 // the production sandbox policy or factory. HOME cannot make the denied
 // Keychain/filesystem available. It is not an execution bridge.
 const attempted={...coding,env:{...coding.env,HOME:homedir(),CODEX_HOME:identity.home}};
 assert.notEqual(await cli(attempted,['-c','cli_auth_credentials_store="keyring"','login','status']),0,'Coding sandbox unexpectedly restored auth-only Keychain witness');result.unchangedCodingSandboxDeniesWitness=true;
 assert.equal(await cli(auth,['login','status']),0,'Negative test must not consume or delete the witness');
 const connection=new CodexControlConnection(auth,{session:true,timeoutMs:10000});groups.push(connection.pid);
 try{await connection.request('initialize',{clientInfo:{name:'codovyn-auth-bridge-probe',version:'0.1.0-alpha'},capabilities:{experimentalApi:false}});connection.initialized();assert.equal((await connection.accountState()).accountType,'apiKey');for(const type of ['chatgptAuthTokens','apiKey','personalAccessToken'])assert.throws(()=>connection.request('account/login/start',{type}),/cannot execute/);assert.throws(()=>connection.request('thread/start',{}),/cannot execute/);await assert.rejects(connection.runApproved({}),/cannot submit/);assert.equal(connection.methods.includes('turn/start'),false);result.authenticationComponentCannotBecomeCodingRuntime=true;}finally{await connection.close();assert.deepEqual(await ownedProcessMembers(connection.pid),[]);}
 assert.equal(existsSync(join(identity.home,'auth.json')),false);assert.equal(existsSync(join(coding.env.CODEX_HOME,'auth.json')),false);result.plaintextFallbackAbsent=true;result.passed=true;
}finally{
 assert.equal(await cli(auth,['logout']),0,'Synthetic credential cleanup failed');for(const group of groups)assert.deepEqual(await ownedProcessMembers(group),[]);result.cleanupVerified=true;
 mkdirSync('dist/desktop',{recursive:true});writeFileSync('dist/desktop/codex-auth-bridge-validation.json',JSON.stringify(result,null,2)+'\n');rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({passed:result.passed,productionExecution:'blocked',inferenceSubmissions:0,cleanupVerified:true,evidence:'dist/desktop/codex-auth-bridge-validation.json'}));
