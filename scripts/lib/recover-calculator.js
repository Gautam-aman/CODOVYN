/** Recover approved public fixture objects; never regenerate commit metadata or
 * overwrite a destination. This creates no execution or spending authority. */
import{mkdirSync,realpathSync,lstatSync,readFileSync}from'node:fs';
import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
export const calculatorBaseline='ac00214528f004350bbd7b53349861726e270323';
export const calculatorSourceSha256='dee76c8f9584ba9286e2bd67948499030760f3978bb6a3e4074cbcf731088c26';
const paths=['.gitignore','README.md','pom.xml','src/main/java/dev/codovyn/Calculator.java','src/main/java/dev/codovyn/TaskService.java','src/test/java/dev/codovyn/CalculatorTest.java'];
const hash=x=>createHash('sha256').update(x).digest('hex');
export function recoverCalculator({source,target}){
 source=realpathSync(source);target=resolve(target);const gitDir=join(source,'.git');
 if(lstatSync(gitDir).isSymbolicLink()||!lstatSync(gitDir).isDirectory())throw new Error('A regular surviving fixture object store is required');
 if(realpathSync(join(target,'..'))!==join(target,'..'))throw new Error('Canonical existing destination parent required');
 const parent=lstatSync(join(target,'..'));if(parent.uid!==process.getuid()||parent.mode&0o077)throw new Error('Owner-only destination parent required');
 const env={PATH:'/usr/bin:/bin',HOME:join(target,'..'),LANG:'en_US.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1'};
 const git=(root,args,input)=>execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null','-c','core.autocrlf=false','--git-dir='+join(root,'.git'),'--work-tree='+root,...args],{env,input,timeout:10000,maxBuffer:262144,stdio:['pipe','pipe','pipe']});
 const objectIds=git(source,['rev-list','--objects','--no-object-names',calculatorBaseline]).toString().trim().split('\n');
 if(objectIds.length>32||objectIds.some(x=>!/^[a-f0-9]{40}$/.test(x)))throw new Error('Approved fixture object graph is invalid');
 const objects=objectIds.map(id=>{const type=git(source,['cat-file','-t',id]).toString().trim();if(!['commit','tree','blob'].includes(type))throw new Error('Unsupported fixture object');const content=git(source,['cat-file',type,id]);if(createHash('sha1').update(Buffer.concat([Buffer.from(`${type} ${content.length}\0`),content])).digest('hex')!==id)throw new Error('Fixture object hash mismatch');return{id,type,content};});
 const committedPaths=git(source,['ls-tree','-r','--name-only',calculatorBaseline]).toString().trim().split('\n').sort();if(JSON.stringify(committedPaths)!==JSON.stringify([...paths].sort()))throw new Error('Unexpected fixture paths');
 if(hash(git(source,['show',calculatorBaseline+':src/main/java/dev/codovyn/Calculator.java']))!==calculatorSourceSha256)throw new Error('Approved source hash mismatch');
 mkdirSync(target,{mode:0o700}); // Exclusive: an existing user directory is never touched.
 git(target,['init','-q','--initial-branch=main','--template=']);git(target,['config','core.autocrlf','false']);
 for(const {id,type,content}of objects)if(git(target,['hash-object','-w','-t',type,'--stdin'],content).toString().trim()!==id)throw new Error('Recovered object mismatch');
 git(target,['update-ref','refs/heads/main',calculatorBaseline]);git(target,['read-tree',calculatorBaseline]);git(target,['checkout-index','--all']);
 git(target,['fsck','--full','--no-reflogs']);
 if(git(target,['rev-parse','HEAD']).toString().trim()!==calculatorBaseline||git(target,['status','--porcelain']).length)throw new Error('Recovered fixture is not clean');
 const fileHashes=Object.fromEntries(paths.map(p=>[p,hash(readFileSync(join(target,p)))]));if(fileHashes['src/main/java/dev/codovyn/Calculator.java']!==calculatorSourceSha256)throw new Error('Recovered source changed');
 return{baselineCommit:calculatorBaseline,fileHashes,recoveredObjects:objects.length,provenance:'Exact existing content-addressed objects; no regenerated author, timestamp or commit',clean:true,spendingApproval:'none',inferenceSubmissions:0};
}
