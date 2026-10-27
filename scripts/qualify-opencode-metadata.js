/** Bounded real metadata qualification only. This module has no prompt/approval
 * transport. Stop on first failure or uncertain cleanup; never auto-retry. */
import{realpathSync,readFileSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';import{openCodeAccountContext}from'../packages/agent-adapters/src/opencode-campaign.js';import{inspectOpenCodeInstallation,discoverOpenCode}from'../packages/agent-adapters/src/opencode.js';import diagnostics from'../packages/agent-adapters/src/opencode-diagnostics.cjs';import{ownedProcessMembers}from'./lib/desktop-process.js';import{repositorySnapshot}from'../packages/git-engine/src/index.js';import{calculatorBaseline,calculatorSourceSha256}from'./lib/recover-calculator.js';
if(process.argv.length!==5)throw new Error('Explicit restored project, isolated context and supported executable required');
const result={inferenceSubmissions:0,repetitions:[],mcpCatalogue:'Not started: no task execution authority or prompt is admitted by this metadata-only harness'};let stage='repository-baseline';
try{
 const cwd=realpathSync(process.argv[2]),stateDirectory=realpathSync(process.argv[3]),baseline=await repositorySnapshot(cwd),sourceHash=()=>createHash('sha256').update(readFileSync(join(cwd,'src/main/java/dev/codovyn/Calculator.java'))).digest('hex');
 if(baseline.commit!==calculatorBaseline||baseline.dirty||sourceHash()!==calculatorSourceSha256)throw new Error('Approved clean baseline required');
 stage='executable-validation';const installation=await inspectOpenCodeInstallation(process.argv[4]);result.executable={version:installation.version,sha256:installation.binarySha256,supported:installation.compatible};
 stage='authentication-context';const contextBefore=openCodeAccountContext(stateDirectory);result.authentication='Stored isolated context metadata verified; authenticated inference unverified';
 for(let i=0;i<3;i++){
  const trial={number:i+1,stages:[]};result.repetitions.push(trial);stage='metadata-startup';
  const observed=await discoverOpenCode({cwd,stateDirectory,configured:installation.command,signal:AbortSignal.timeout(45000),observe:event=>trial.stages.push(event)});
  trial.elapsedMs=Math.round(observed.inspection.elapsedMs);trial.models=observed.models.length;trial.selectedModel=observed.selectedModel;trial.defaultModel=observed.defaultModel;trial.acpInitialization=observed.metadataInitialization;trial.cleanupVerified=true;
  for(const group of [...observed.metadataOwnedGroups,...observed.inspection.ownedGroups])if((await ownedProcessMembers(group)).length)trial.cleanupVerified=false;
  if(!trial.cleanupVerified)throw diagnostics.mark(new Error('Owned cleanup remains unverified'),'CLEANUP_UNVERIFIED');
  if(openCodeAccountContext(stateDirectory)!==contextBefore||sourceHash()!==calculatorSourceSha256||JSON.stringify(await repositorySnapshot(cwd))!==JSON.stringify(baseline))throw new Error('Context or repository changed');
 }
 result.success=true;
}catch(error){result.success=false;result.failedStage=stage;result.diagnostic=diagnostics.diagnostic(error);result.failurePolicy='Stopped; cleanup and startup require reconciliation before another run';process.exitCode=1;}
console.log(JSON.stringify(result,null,2));
