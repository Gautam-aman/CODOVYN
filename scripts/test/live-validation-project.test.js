import test from 'node:test';import assert from 'node:assert/strict';import{rm,readFile}from'node:fs/promises';import{dirname,join}from'node:path';
import{createJavaValidationProject,javaValidationFiles}from'../lib/live-validation-project.js';import{repositorySnapshot}from'../../packages/git-engine/src/index.js';
test('Java validation project has reproducible source/baseline, private evidence and no inference authorization',async()=>{
 const first=await createJavaValidationProject(),second=await createJavaValidationProject();
 try{assert.notEqual(first.project,second.project);assert.equal(first.baselineCommit,second.baselineCommit);assert.deepEqual(first.fileHashes,second.fileHashes);assert.equal((await repositorySnapshot(first.project)).dirty,false);assert.equal(first.inferenceTurns,0);assert.equal(first.liveAuthorization,'not-granted');assert.ok(Object.keys(javaValidationFiles).includes('src/main/java/dev/codovyn/TaskService.java'));assert.match(await readFile(join(first.project,'pom.xml'),'utf8'),/junit-jupiter/);assert.deepEqual(JSON.parse(await readFile(join(first.evidence,'baseline.json'),'utf8')).initialTasks,[]);}
 finally{await rm(dirname(first.project),{recursive:true,force:true});await rm(dirname(second.project),{recursive:true,force:true});}
});
