import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createJavaValidationProject} from './lib/live-validation-project.js';
import {prepareCampaign} from './lib/phase16-campaign.js';
const execute=promisify(execFile);
if(process.argv.length!==2)throw new Error('Preparation only; no execution or approval flags supported');
const java=await createJavaValidationProject({scenario:'division'}),cwd=java.project;
const run=async()=>{try{const r=await execute('mvn',['-o','test'],{cwd,timeout:30000,maxBuffer:1048576});return {exitCode:0,output:r.stdout};}catch(e){if(typeof e.code!=='number')throw e;return {exitCode:e.code,output:e.stdout};}};
const baseline=await run();assert.equal(baseline.exitCode,0);assert.match(baseline.output,/Tests run: 3, Failures: 0, Errors: 0, Skipped: 0/);
// Independent host oracle, never a provider self-report. Preserve the original
// accepted baseline: run the intentionally failing regression in a second repo.
const oracle=await createJavaValidationProject({scenario:'division'}),path=join(oracle.project,'src/test/java/dev/codovyn/CalculatorTest.java');
const original=await readFile(path,'utf8');await writeFile(path,original.replace('class CalculatorTest {','class CalculatorTest {\n    @Test void rejectsZeroDivisor() { assertThrows(ArithmeticException.class, () -> new Calculator().divide(9, 0)); }'));
let regression;try{await execute('mvn',['-o','test'],{cwd:oracle.project,timeout:30000,maxBuffer:1048576});throw new Error('Known-bug regression unexpectedly passed');}catch(e){if(typeof e.code!=='number')throw e;regression={exitCode:e.code,expectedFailure:/Failures: 1/.test(e.stdout)};}assert.equal(regression.expectedFailure,true);
const source=join(oracle.project,'src/main/java/dev/codovyn/Calculator.java');await writeFile(source,(await readFile(source,'utf8')).replace('return b == 0 ? 0 : a / b;','return a / b;'));
const fixed=await execute('mvn',['-o','test'],{cwd:oracle.project,timeout:30000,maxBuffer:1048576});assert.match(fixed.stdout,/Tests run: 4, Failures: 0, Errors: 0, Skipped: 0/);
const version=async(command,args)=>{try{return (await execute(command,args,{timeout:5000,maxBuffer:65536})).stdout.trim();}catch{return 'unavailable';}};
const command='/opt/homebrew/Cellar/opencode/2.1.2/bin/opencode';let sha;try{sha=createHash('sha256').update(await readFile(command)).digest('hex');}catch{}
let codexMetadata;try{codexMetadata=JSON.parse(await readFile('dist/desktop/phase16-codex-metadata.json','utf8'));}catch{}
const codexDefault=codexMetadata?.metadataVerified&&codexMetadata.cleanupVerified?codexMetadata.models?.find(m=>m.isDefault)?.model:null;
const campaign=prepareCampaign({codex:{compatible:!!codexDefault,model:codexDefault,preActionBudget:false,restrictedTools:false},opencode:{compatible:sha==='3f01e2ba8efd4242c638add9248b88696221d76588d9511e63cb2d727c278fcc',model:null,preActionBudget:true,restrictedTools:true}});
// Never save raw login-status/config output: only the known status enum.
const login=await version('codex',['login','status']);
const result={sourceCommit:await version('/usr/bin/git',['rev-parse','HEAD']),classification:'PREPARED — NOT EXECUTED',java,
 baseline:{exitCode:baseline.exitCode,tests:3,failures:0,skipped:0},oracle:{project:oracle.project,regression,fixed:{exitCode:0,tests:4,failures:0,skipped:0},origin:'independent host fixture repair; no provider'},
 providers:{codex:{version:await version('codex',['--version']),authentication:login==='Logged in using ChatGPT'?'CLI reports ChatGPT login':'unknown',accountIdentity:'not inspected',adapter:'exec --json; app-server not integrated',model:codexDefault??'not verified',modelProvenance:'local app-server model/list metadata only',inferenceAccess:'unverified'},opencode:{version:await version(command,['--version']),sha256:sha,authentication:'unknown; separate CODOVYN owner-only context',inferenceAccess:'unverified'}},campaign};
await mkdir('dist/desktop',{recursive:true});await writeFile('dist/desktop/phase16-preparation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({evidence:'dist/desktop/phase16-preparation.json',baselineTests:3,oracleTests:4,actualModelRequests:0,eligibleForApproval:campaign.eligibleForApproval,blockers:campaign.blockers},null,2));
