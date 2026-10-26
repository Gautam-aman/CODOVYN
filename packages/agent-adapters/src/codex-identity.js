/** Host-created isolated identity. No credential contents are read or written here. */
import{mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,existsSync}from'node:fs';import{resolve,join,dirname,relative,isAbsolute}from'node:path';import{homedir}from'node:os';import{createHash}from'node:crypto';
const identities=new WeakSet(),revoked=new WeakSet();
export const codexCredentialConfiguration=`approval_policy = "on-request"
approvals_reviewer = "user"
sandbox_mode = "read-only"
web_search = "disabled"
cli_auth_credentials_store = "keyring"
[features]
shell_tool = false
unified_exec = false
multi_agent = false
multi_agent_v2 = false
apps = false
plugins = false
computer_use = false
shell_snapshot = false
sleep_tool = false
`;
function secureDirectory(path){const target=resolve(path);if(!existsSync(target)){secureDirectory(dirname(target));mkdirSync(target,{mode:0o700});}const stat=lstatSync(target);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Isolated identity paths cannot contain symbolic links');return stat;}
function signature(path){const s=lstatSync(path);return `${s.dev}:${s.ino}:${s.uid}:${s.mode}`;}
export function createCodexIdentity({directory,workspace}){
 const requested=resolve(directory),root=realpathSync(workspace),global=resolve(homedir(),'.codex');
 if(requested===global||requested.startsWith(global+'/')||global.startsWith(requested+'/'))throw new Error('Global Codex identity cannot be used or imported');
 const r=relative(root,requested);if(root.startsWith(requested+'/'))throw new Error('Identity cannot contain the project');
 if(!r||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')))throw new Error('Identity must be outside the project');
 const s=secureDirectory(requested);if(s.uid!==process.getuid()||(s.mode&0o077))throw new Error('Owner-only identity directory required');
 const home=realpathSync(requested);if(home!==requested)throw new Error('Canonical isolated identity path required');const config=join(home,'config.toml');
 if(!existsSync(config))writeFileSync(config,codexCredentialConfiguration,{mode:0o600,flag:'wx'});
 const identity=Object.freeze({home,config,homeSignature:signature(home),configSignature:signature(config),namespaceDigest:createHash('sha256').update(home).digest('hex'),storage:'keyring'});identities.add(identity);assertCodexIdentity(identity);return identity;
}
export function assertCodexIdentity(identity){
 if(!identities.has(identity))throw new Error('Trusted host identity required');if(revoked.has(identity))throw new Error('Isolated identity authority changed or was revoked');
 if(realpathSync(identity.home)!==identity.home||signature(identity.home)!==identity.homeSignature||signature(identity.config)!==identity.configSignature||lstatSync(identity.config).isSymbolicLink()||lstatSync(identity.config).nlink!==1||(lstatSync(identity.config).mode&0o077)||readFileSync(identity.config,'utf8')!==codexCredentialConfiguration){revoked.add(identity);throw new Error('Isolated identity or credential configuration changed');}
 if((()=>{try{lstatSync(join(identity.home,'auth.json'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}})()){revoked.add(identity);throw new Error('Plaintext authentication cache is forbidden; no fallback or import will be attempted');}return identity;
}
