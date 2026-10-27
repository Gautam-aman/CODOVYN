import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';import{createJavaValidationProject}from'./lib/live-validation-project.js';import{recoverCalculator,calculatorBaseline,calculatorSourceSha256}from'./lib/recover-calculator.js';
test('persistent Calculator recovery preserves original objects and refuses existing destinations',async()=>{
 const fixture=await createJavaValidationProject({scenario:'division'}),base=realpathSync(mkdtempSync(join(tmpdir(),'calculator-recovery-'))),target=join(base,'Calculator');try{
  const source=realpathSync(fixture.project),before=execFileSync('/usr/bin/git',['-C',source,'cat-file','commit',calculatorBaseline]);
  writeFileSync(join(source,'src/main/java/dev/codovyn/Calculator.java'),'Uncommitted changes must not be copied');
  const evidence=recoverCalculator({source,target});assert.equal(evidence.baselineCommit,calculatorBaseline);assert.equal(evidence.fileHashes['src/main/java/dev/codovyn/Calculator.java'],calculatorSourceSha256);assert.deepEqual(execFileSync('/usr/bin/git',['-C',target,'cat-file','commit',calculatorBaseline]),before);assert.equal(evidence.inferenceSubmissions,0);
  const original=readFileSync(join(target,'README.md'));assert.throws(()=>recoverCalculator({source,target}),/EEXIST/);assert.deepEqual(readFileSync(join(target,'README.md')),original);
 }finally{rmSync(base,{recursive:true,force:true});rmSync(join(realpathSync(fixture.project),'..'),{recursive:true,force:true});}
});
