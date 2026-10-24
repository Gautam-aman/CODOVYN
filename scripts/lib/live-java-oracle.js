import {mkdtemp,mkdir,writeFile,readFile,copyFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {manageAgentProcess} from '../../packages/agent-adapters/src/process.js';
import {repositorySnapshot} from '../../packages/git-engine/src/index.js';
import {ownedProcessMembers} from './desktop-process.js';
const execute=promisify(execFile);
const dependencies=[['org/junit/jupiter/junit-jupiter-api','5.11.4'],['org/junit/jupiter/junit-jupiter-engine','5.11.4'],['org/junit/platform/junit-platform-commons','1.11.4'],['org/junit/platform/junit-platform-engine','1.11.4'],['org/junit/platform/junit-platform-launcher','1.11.4'],['org/opentest4j/opentest4j','1.3.0'],['org/apiguardian/apiguardian-api','1.1.2']];
export const javaOracles={
 division:'@Test void divisionByZeroThrows() { assertThrows(ArithmeticException.class, () -> new Calculator().divide(1, 0)); }',
 'task-service':'@Test void rejectsNull() { assertThrows(IllegalArgumentException.class, () -> new TaskService().createTask(null)); } @Test void rejectsBlank() { assertThrows(IllegalArgumentException.class, () -> new TaskService().createTask(" ")); } @Test void trimsValidTitle() { assertEquals("sample", new TaskService().createTask(" sample ")); }',
 subtract:'@Test void subtractsIntegers() { assertEquals(4, new Calculator().subtract(7, 3)); }'
};
export function javaOracleProfile({project,run,jdk,writeClasses=false}) {
 const quoted=JSON.stringify;const reads=['/System','/usr','/bin','/sbin','/Library/Java','/Library/Apple','/private/etc','/dev',jdk,project,run];
 return `(version 1) (allow default) (deny network*) (deny process-exec) (allow process-exec (literal ${quoted(join(jdk,'bin/java'))}) (literal ${quoted(join(jdk,'bin/javac'))})) (deny file-read* (subpath "/Users") (subpath "/private/var/folders") (subpath "/private/tmp") (subpath "/Volumes") (subpath "/opt") (subpath "/Library/Application Support") (subpath "/Library/Keychains")) (allow file-read-metadata) (allow file-read* ${reads.map(path=>'(subpath '+quoted(path)+')').join(' ')}) (deny file-write*) (allow file-write* (subpath ${quoted(join(run,'tmp'))}) ${writeClasses?'(subpath '+quoted(join(run,'classes'))+')':''} (literal "/dev/null"))`;
}
async function sources(directory,root=directory,result=[],budget={visited:0}) {
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(++budget.visited>256||relative(root,directory).split('/').length>16)throw new Error('Oracle source traversal bound exceeded');
  const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Oracle rejects symlinked source');if(entry.isDirectory())await sources(path,root,result,budget);else if(entry.name.endsWith('.java')){const info=await lstat(path);if(info.size>65536||result.length>=32)throw new Error('Oracle source bound exceeded');const rel=relative(root,await realpath(path));if(isAbsolute(rel)||rel.startsWith('../'))throw new Error('External oracle source');result.push(path);}
 }return result;
}
async function runOwned(command,args,{cwd,env,timeoutMs=60000}) {
 const child=spawn(command,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe']});const lifecycle=manageAgentProcess(child);child.stdin.end();let bytes=0,stdout='',stderr='',timedOut=false;const started=performance.now();
 const timer=setTimeout(()=>{timedOut=true;lifecycle.dispose().catch(()=>{});},timeoutMs);
 const consume=(kind,data)=>{bytes+=data.length;if(bytes>1048576){lifecycle.dispose().catch(()=>{});return;}if(kind==='stdout')stdout+=data.toString();else stderr+=data.toString();};child.stdout.on('data',data=>consume('stdout',data));child.stderr.on('data',data=>consume('stderr',data));
 try{const code=await lifecycle.closed;await lifecycle.dispose();if(child.pid&&(await ownedProcessMembers(child.pid)).length)throw new Error('Host verifier process group still has live members');return {code,signal:child.signalCode,error:lifecycle.error()?.message,timedOut,outputBoundExceeded:bytes>1048576,elapsedMs:performance.now()-started,cleanup:'verified',stdout,stderr};}finally{clearTimeout(timer);await lifecycle.dispose();}
}
/** Independent, credential-free JUnit execution; no provider, queue or inference is started. */
export async function verifyJavaProject(manifest,{mode='baseline',project=manifest.project}={}) {
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('The host Java oracle requires the verified macOS ARM64 process boundary');
 if(mode!=='baseline'&&!Object.hasOwn(javaOracles,mode))throw new Error('Unknown trusted Java oracle');
 project=await realpath(project);const baseline=await repositorySnapshot(project);if(baseline.root!==project||baseline.commit!==manifest.baselineCommit)throw new Error('Unexpected Java project baseline');
 const pom=await readFile(join(project,'pom.xml'));if(createHash('sha256').update(pom).digest('hex')!==manifest.fileHashes['pom.xml'])throw new Error('Unreviewed build configuration changed');
 const evidence=await realpath(manifest.evidence);const run=await mkdtemp(join(evidence,'host-java-'));for(const part of ['classes','tmp','sources','deps'])await mkdir(join(run,part));
 const jdk=(await execute('/usr/libexec/java_home',['-v','21'],{timeout:5000})).stdout.trim();
 const jars=[];const jarHashes={};for(const [group,version]of dependencies){const name=group.split('/').at(-1)+'-'+version+'.jar';const source=join(homedir(),'.m2/repository',group,version,name);const info=await lstat(source);if(!info.isFile()||info.size>8388608)throw new Error('Missing or oversized trusted JUnit dependency');const destination=join(run,'deps',name);await copyFile(source,destination);jars.push(destination);jarHashes[name]=createHash('sha256').update(await readFile(destination)).digest('hex');}
 const inputs=await sources(join(project,'src/main/java'));if(mode==='baseline')inputs.push(...await sources(join(project,'src/test/java')));
 else{const file=join(run,'sources','HostRequirementTest.java');await writeFile(file,'package dev.codovyn; import org.junit.jupiter.api.Test; import static org.junit.jupiter.api.Assertions.*; public class HostRequirementTest {'+javaOracles[mode]+'}\n');inputs.push(file);}
 const sentinel=join(evidence,'outside-oracle-sentinel.txt');await writeFile(sentinel,'non-sensitive host boundary sentinel\n');
 const safety=join(run,'sources','HostBoundaryTest.java');await writeFile(safety,`package dev.codovyn; import org.junit.jupiter.api.Test; import java.nio.file.*; import java.io.*; import java.net.*; import static org.junit.jupiter.api.Assertions.*; public class HostBoundaryTest {
 @Test void externalReadDenied(){ assertThrows(IOException.class,()->Files.readString(Path.of(${JSON.stringify(sentinel)}))); }
 @Test void originalWriteDenied(){ assertThrows(IOException.class,()->Files.writeString(Path.of(${JSON.stringify(join(project,'README.md'))}),"must not write")); }
 @Test void shellDenied(){ assertThrows(IOException.class,()->new ProcessBuilder("/bin/sh","-c","true").start()); }
 @Test void networkDenied(){ var e=assertThrows(IOException.class,()->{try(var socket=new Socket()){socket.connect(new InetSocketAddress("127.0.0.1",9),500);}}); assertTrue(e.getMessage().toLowerCase().contains("permitted"),e.toString()); }
 }`);inputs.push(safety);
 const runner=join(run,'sources','HostJUnitRunner.java');await writeFile(runner,`import org.junit.platform.launcher.core.*; import org.junit.platform.launcher.listeners.*; import static org.junit.platform.engine.discovery.DiscoverySelectors.*; public class HostJUnitRunner { public static void main(String[] args) { var listener=new SummaryGeneratingListener(); var launcher=LauncherFactory.create(); launcher.registerTestExecutionListeners(listener); launcher.execute(LauncherDiscoveryRequestBuilder.request().selectors(selectPackage("dev.codovyn")).build()); var s=listener.getSummary();System.out.println("HOST_JUNIT_REPORT {\\\"found\\\":"+s.getTestsFoundCount()+",\\\"passed\\\":"+s.getTestsSucceededCount()+",\\\"failed\\\":"+s.getTestsFailedCount()+",\\\"skipped\\\":"+s.getTestsSkippedCount()+"}"); System.exit(s.getTestsFoundCount()>0&&s.getTestsFailedCount()==0&&s.getTestsSkippedCount()==0?0:1); } }`);inputs.push(runner);
 const env={PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',TMPDIR:join(run,'tmp')};const common=['-XX:-UsePerfData','-Djava.io.tmpdir='+join(run,'tmp'),'-Duser.home='+join(run,'tmp')];const classpath=jars.join(delimiter);
 const compile=await runOwned('/usr/bin/sandbox-exec',['-p',javaOracleProfile({project,run,jdk,writeClasses:true}),join(jdk,'bin/javac'),'-J-XX:-UsePerfData','--release','17','-encoding','UTF-8','-proc:none','-cp',classpath,'-d',join(run,'classes'),...inputs],{cwd:project,env});
 const execution=compile.code===0?await runOwned('/usr/bin/sandbox-exec',['-p',javaOracleProfile({project,run,jdk}),join(jdk,'bin/java'),...common,'-cp',join(run,'classes')+delimiter+classpath,'HostJUnitRunner'],{cwd:project,env}):null;
 const match=execution?.stdout.match(/^HOST_JUNIT_REPORT (\{[^\n]+\})$/m);const tests=match?JSON.parse(match[1]):null;const after=await repositorySnapshot(project);
 const unchanged=JSON.stringify(after)===JSON.stringify(baseline);const report={version:1,mode,languageRelease:17,project,baselineCommit:baseline.commit,jdk,compileExitCode:compile.code,compileSignal:compile.signal,executionSignal:execution?.signal??null,executionExitCode:execution?.code??null,tests,unchanged,dependencyHashes:jarHashes,cleanup:[compile.cleanup,...(execution?[execution.cleanup]:[])],timedOut:compile.timedOut||execution?.timedOut===true,outputBoundExceeded:compile.outputBoundExceeded||execution?.outputBoundExceeded===true,elapsedMs:compile.elapsedMs+(execution?.elapsedMs||0),providerCalls:0};
 report.passed=compile.code===0&&execution?.code===0&&tests?.found>0&&tests.failed===0&&tests.skipped===0&&unchanged&&!report.timedOut&&!report.outputBoundExceeded;
 await writeFile(join(run,'result.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(run,'compiler.log'),compile.stderr);if(!unchanged)throw new Error('SECURITY BLOCKER: host verification modified the repository');return {...report,evidenceFile:join(run,'result.json')};
}
