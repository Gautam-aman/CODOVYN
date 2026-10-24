import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {repositorySnapshot} from '../../packages/git-engine/src/index.js';
import {recoveryFingerprint} from '../../packages/task-engine/src/recovery.js';
const execute=promisify(execFile);
export const javaValidationFiles={
 '.gitignore':'target/\n',
 'pom.xml':`<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>dev.codovyn</groupId><artifactId>live-validation</artifactId><version>1.0.0</version><properties><maven.compiler.release>17</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.4</version><scope>test</scope></dependency></dependencies><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.13.0</version></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.5.2</version></plugin></plugins></build></project>\n`,
 'README.md':'# Disposable CODOVYN validation project\nJava 17+ / JUnit 5. Run mvn test independently. Calculator and TaskService are deliberately small. Baseline tests leave division by zero and input validation uncovered. Calculator.subtract deliberately contains an untested arithmetic bug for a separate bounded repair task. No credentials or external services are needed.\n',
 'src/main/java/dev/codovyn/Calculator.java':`package dev.codovyn;
public final class Calculator {
    public int add(int a, int b) { return a + b; }
    public int subtract(int a, int b) { return a + b; } // Deliberate validation-fixture bug.
    public int divide(int a, int b) { return a / b; }
}
`,
 'src/main/java/dev/codovyn/TaskService.java':`package dev.codovyn;
public final class TaskService {
    public String createTask(String title) { return title.trim(); }
}
`,
 'src/test/java/dev/codovyn/CalculatorTest.java':`package dev.codovyn;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class CalculatorTest {
    @Test void addsTwoIntegers() { assertEquals(5, new Calculator().add(2, 3)); }
    @Test void dividesIntegers() { assertEquals(3, new Calculator().divide(9, 3)); }
    @Test void trimsTaskTitle() { assertEquals("sample", new TaskService().createTask(" sample ")); }
}
`
};
export async function createJavaValidationProject() {
 const directory=await mkdtemp(join(tmpdir(),'codovyn-live-validation-'));const project=join(directory,'project');const evidence=join(directory,'evidence');await mkdir(project);await mkdir(evidence,{mode:0o700});
 const gitEnv={PATH:process.env.PATH,LANG:'en_US.UTF-8',HOME:directory,...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot}:{}),GIT_AUTHOR_NAME:'CODOVYN Validation',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_NAME:'CODOVYN Validation',GIT_COMMITTER_EMAIL:'test@example.invalid',GIT_AUTHOR_DATE:'2026-10-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-10-01T00:00:00Z',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0'};
 const git=async(...args)=>(await execute(process.platform==='win32'?'git':'/usr/bin/git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null','-C',project,...args],{timeout:10000,env:gitEnv})).stdout.trim();
 for(const[path,content]of Object.entries(javaValidationFiles)){await mkdir(join(project,path,'..'),{recursive:true});await writeFile(join(project,path),content);}
 await git('init','-q','--initial-branch=main');await git('config','core.autocrlf','false');await git('add','.');await git('-c','user.name=CODOVYN Validation','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Deterministic Java validation baseline');
 const snapshot=await repositorySnapshot(project,{env:gitEnv});const hashes=Object.fromEntries(await Promise.all(Object.keys(javaValidationFiles).map(async path=>[path,createHash('sha256').update(await readFile(join(project,path))).digest('hex')])));
 const manifest={version:1,project,evidence,baselineCommit:snapshot.commit,fingerprint:recoveryFingerprint(snapshot),fileHashes:hashes,initialTasks:[],inferenceTurns:0,liveAuthorization:'not-granted'};await writeFile(join(evidence,'baseline.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
