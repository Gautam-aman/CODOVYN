import test from 'node:test';import assert from 'node:assert/strict';
import {prepareCampaign,requirePreparedCampaign} from '../lib/phase16-campaign.js';
import {createJavaValidationProject} from '../lib/live-validation-project.js';
import {readFile,rm} from 'node:fs/promises';import {dirname,join} from 'node:path';
test('preparation blocks observed Codex post-action accounting and unselected models',()=>{
 const plan=prepareCampaign({codex:{compatible:true,restrictedTools:false,preActionBudget:false},opencode:{compatible:true,restrictedTools:true,preActionBudget:false}});
 assert.equal(plan.eligibleForApproval,false);assert.ok(plan.blockers.some(x=>x.includes('codex: restricted')));assert.ok(plan.blockers.some(x=>x.includes('exact model')));assert.throws(()=>requirePreparedCampaign(plan),/blocked/);
});
test('metadata and synthetic green preflight cannot grant spending or transfer consent',()=>{
 const p={compatible:true,model:'explicit/configured-model',preActionBudget:true,restrictedTools:true};const plan=prepareCampaign({codex:p,opencode:p});
 assert.equal(plan.eligibleForApproval,true);assert.throws(()=>requirePreparedCampaign(plan),/owner authorization/);assert.equal(plan.actualModelRequests,0);
 assert.deepEqual(plan.requests.filter(r=>r.logicalTask==='same-handoff-task').map(r=>r.mode),['agent','agent']);assert.ok(plan.requiredApprovals.some(x=>x.includes('one-use')));
 assert.ok(plan.requests.every(r=>r.retries===0&&r.fallbacks===0&&r.parallelism===1&&r.toolActions===8&&!r.automaticPatchApplication));
});
test('division fixture is reproducible, isolates one known defect and preserves legacy fixtures',async()=>{
 const a=await createJavaValidationProject({scenario:'division'}),b=await createJavaValidationProject({scenario:'division'}),legacy=await createJavaValidationProject();
 try{assert.equal(a.baselineCommit,b.baselineCommit);assert.notEqual(a.baselineCommit,legacy.baselineCommit);const source=await readFile(join(a.project,'src/main/java/dev/codovyn/Calculator.java'),'utf8');assert.match(source,/return b == 0 \? 0 : a \/ b/);assert.match(source,/return a - b/);assert.match(await readFile(join(legacy.project,'src/main/java/dev/codovyn/Calculator.java'),'utf8'),/Deliberate validation-fixture bug/);}
 finally{for(const p of [a,b,legacy])await rm(dirname(p.project),{recursive:true,force:true});}
});
