import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open,realpath,stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join,relative,isAbsolute } from 'node:path';
import { contextPath,digest,redactContext } from '../../agent-core/src/contextflow.js';
const execute=promisify(execFile);
/** Local, tracked-source retrieval only; never follows symlinks or invokes project code. */
export async function selectContextFiles(root,objective,changedPaths=[],{draft=false}={}) {
 const {stdout}=await execute('git',['-C',root,'ls-files','-z'],{timeout:5000,maxBuffer:1048576,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 const paths=[...new Set([...stdout.split('\0').filter(Boolean),...(draft?changedPaths:[])])];if(paths.length>10000)throw new Error('ContextFlow tracked-file catalogue exceeds its bound');
 const words=[...new Set(objective.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g)||[])].slice(0,64);
 const manifest=path=>/(?:^|\/)(?:package.json|pom.xml|build.gradle|pyproject.toml|Cargo.toml|go.mod|README.md)$/.test(path);
 const ranked=paths.filter(contextPath).map(path=>({path,score:(changedPaths.includes(path)?100:0)+(manifest(path)?10:0)+words.filter(word=>path.toLowerCase().includes(word)).length*5})).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
 const result=[];
 for(const {path}of ranked.slice(0,24)) {
  if(result.length>=8)break;let file;
  try {
   const full=await realpath(join(root,path));const rel=relative(await realpath(root),full);if(rel!==path||isAbsolute(rel)||rel.startsWith('../'))continue;
   file=await open(join(root,path),constants.O_RDONLY|constants.O_NOFOLLOW);const before=await file.stat();const actual=await stat(full);if(await realpath(join(root,path))!==full||actual.ino!==before.ino||actual.dev!==before.dev)throw new Error('Context path changed during extraction');if(!before.isFile()||before.size>65536)continue;
   const buffer=await file.readFile();const after=await file.stat();if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw new Error('Context source changed during extraction');
   const content=buffer.toString('utf8');if(content.includes('\0')||Buffer.byteLength(content)!==buffer.length)continue;
   let excerpt='',bytes=0;for(const char of content){const size=Buffer.byteLength(char);if(bytes+size>2048)break;excerpt+=char;bytes+=size;}
   result.push({path,sha256:digest(buffer),excerpt:redactContext(excerpt),verification:'host-read',truncated:excerpt.length<content.length});
  } finally {await file?.close();}
 }
 return result;
}
