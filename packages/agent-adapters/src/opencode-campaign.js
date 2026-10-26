import {createHash} from 'node:crypto';
import {realpathSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
/** Account CONTEXT binding only: never reads credential contents or asserts an
 * account identity, entitlement or authentication. Changes require a new review. */
export function openCodeAccountContext(stateDirectory){
 const root=realpathSync(stateDirectory);if(resolve(stateDirectory)!==root)throw new Error('Canonical isolated OpenCode authentication context required; symlinks denied');const parts=['data','opencode','auth.json'];let path=root;const pin=[];
 for(const name of ['',...parts]){if(name)path=join(path,name);const s=lstatSync(path,{bigint:true});if(s.isSymbolicLink()||s.uid!==BigInt(process.getuid())||(name===''?s.mode&0o077n:s.mode&0o022n)||name==='auth.json'&&(!s.isFile()||s.nlink!==1n)||name!=='auth.json'&&!s.isDirectory())throw new Error('Private isolated OpenCode authentication context required');pin.push([String(s.dev),String(s.ino),String(s.mode),...(name==='auth.json'?[String(s.size),String(s.mtimeNs),String(s.ctimeNs)]:[])]);}
 return createHash('sha256').update(JSON.stringify({root,pin})).digest('hex');
}
