import test from 'node:test';import assert from 'node:assert/strict';import{rm,readFile,writeFile}from'node:fs/promises';import{dirname,join}from'node:path';
import{createJavaValidationProject,javaValidationFiles}from'../lib/live-validation-project.js';import{repositorySnapshot}from'../../packages/git-engine/src/index.js';
test('Java validation project has reproducible source/baseline, private evidence and no inference authorization',async()=>{
 const first=await createJavaValidationProject(),second=await createJavaValidationProject();
 try{assert.notEqual(first.project,second.project);assert.equal(first.baselineCommit,second.baselineCommit);assert.deepEqual(first.fileHashes,second.fileHashes);assert.equal((await repositorySnapshot(first.project)).dirty,false);assert.equal(first.inferenceTurns,0);assert.equal(first.liveAuthorization,'not-granted');assert.ok(Object.keys(javaValidationFiles).includes('src/main/java/dev/codovyn/TaskService.java'));assert.match(await readFile(join(first.project,'pom.xml'),'utf8'),/junit-jupiter/);assert.deepEqual(JSON.parse(await readFile(join(first.evidence,'baseline.json'),'utf8')).initialTasks,[]);}
 finally{await rm(dirname(first.project),{recursive:true,force:true});await rm(dirname(second.project),{recursive:true,force:true});}
});

test('disposable Java setup ignores inherited Git repository and configuration redirection',async()=>{
 const foreign=await createJavaValidationProject();let fixture;const saved={};const overrides={GIT_DIR:join(foreign.project,'.git'),GIT_WORK_TREE:foreign.project,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.fsmonitor',GIT_CONFIG_VALUE_0:'/must-not-execute'};
 try{await writeFile(join(foreign.project,'foreign-only.txt'),'must remain uncommitted');const before=await repositorySnapshot(foreign.project);for(const[key,value]of Object.entries(overrides)){saved[key]=process.env[key];process.env[key]=value;}try{fixture=await createJavaValidationProject();}finally{for(const key of Object.keys(overrides))if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  assert.notEqual(fixture.project,foreign.project);assert.equal(fixture.baselineCommit,foreign.baselineCommit);assert.deepEqual(await repositorySnapshot(foreign.project),before);
 }finally{await rm(dirname(foreign.project),{recursive:true,force:true});if(fixture)await rm(dirname(fixture.project),{recursive:true,force:true});}
});
