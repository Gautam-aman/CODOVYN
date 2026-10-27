import {createHash} from 'node:crypto';
import {realpathSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import diagnostics from './opencode-diagnostics.cjs';
function failure(code){return diagnostics.mark(new Error(diagnostics.diagnostic(code).message),code);}
/** Pinned OpenCode 2.1.2 stores credentials in SQLite, not legacy auth.json.
 * Only non-secret credential identity/selection/revision columns are selected.
 * Never SELECT value/label, export tokens, interpret credential formats or
 * fingerprint the entire mutable database/WAL. This is NOT authentication proof. */
export function openCodeAccountContext(stateDirectory){
 let root;try{root=realpathSync(stateDirectory);}catch{throw failure('AUTH_CONTEXT_MISSING');}
 if(resolve(stateDirectory)!==root)throw failure('AUTH_CONTEXT_UNSAFE');
 const pin=[];let path=root;
 function identity(file,leaf=false){let s;try{s=lstatSync(file,{bigint:true});}catch{throw failure('AUTH_CONTEXT_MISSING');}if(s.isSymbolicLink()||s.uid!==BigInt(process.getuid())||(leaf?s.mode&0o022n:s.mode&(file===root?0o077n:0o022n))||leaf&&(!s.isFile()||s.nlink!==1n)||!leaf&&!s.isDirectory())throw failure('AUTH_CONTEXT_UNSAFE');return [String(s.dev),String(s.ino),String(s.mode)];}
 for(const name of ['', 'data','opencode']){if(name)path=join(path,name);pin.push(identity(path));}
 const file=join(path,'opencode.db');pin.push(identity(file,true));
 function sidecars(){for(const suffix of ['-wal','-shm'])try{lstatSync(file+suffix);identity(file+suffix,true);}catch(error){if(error?.code!=='ENOENT')throw error;}}
 sidecars();let db,rows;
 try{db=new DatabaseSync(file,{readOnly:true,allowExtension:false});db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON; PRAGMA busy_timeout=1000;');
  const table=db.prepare("SELECT type, upper(sql) GLOB 'CREATE VIRTUAL TABLE*' AS is_virtual FROM sqlite_schema WHERE name='credential'").get();if(table?.type!=='table'||table.is_virtual)throw failure('AUTH_METADATA_UNAVAILABLE');
  const columns=db.prepare('PRAGMA table_xinfo(credential)').all();for(const [name,type]of [['id','TEXT'],['integration_id','TEXT'],['active','INTEGER'],['time_created','INTEGER'],['time_updated','INTEGER']])if(!columns.some(c=>c.name===name&&c.type.toUpperCase()===type&&c.hidden===0))throw failure('AUTH_METADATA_UNAVAILABLE');
  rows=db.prepare('SELECT id, integration_id, active, time_created, time_updated FROM credential WHERE integration_id IS NOT NULL ORDER BY id LIMIT 129').all();
  if(!rows.length)throw failure('AUTH_NOT_CONFIGURED');if(rows.length>128||rows.some(r=>typeof r.id!=='string'||r.id.length>256||typeof r.integration_id!=='string'||r.integration_id.length>256||![null,0,1].includes(r.active)||!Number.isSafeInteger(r.time_created)||!Number.isSafeInteger(r.time_updated)))throw failure('AUTH_METADATA_UNAVAILABLE');
 }catch(error){throw diagnostics.mark(error,'AUTH_METADATA_UNAVAILABLE');}finally{db?.close();}
 const after=[];path=root;for(const name of ['', 'data','opencode']){if(name)path=join(path,name);after.push(identity(path));}after.push(identity(file,true));sidecars();if(JSON.stringify(pin)!==JSON.stringify(after))throw failure('AUTH_CONTEXT_UNSAFE');
 return createHash('sha256').update(JSON.stringify({root,pin,rows})).digest('hex');
}
