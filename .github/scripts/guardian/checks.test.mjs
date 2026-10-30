import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateChecks } from './checks.mjs';
import { createApi, makePull, checkRun, NOW } from './test-helpers.mjs';
const names=['test (ubuntu-latest)','test (macos-latest)','test (windows-latest)'];
const passing=()=>names.map(name=>checkRun(name));
async function run({runs=passing(),files=['README.md'],errors={},policy={},date='2026-10-22T10:00:00Z',statuses=[]}={}){const pull=makePull();const api=createApi({checkRuns:runs,errors,commitDate:date,statuses});return evaluateChecks({api,pull,now:NOW,changedFiles:files,repositoryPolicy:policy});}
test('all CI matrix checks must succeed',async()=>{assert.equal((await run()).status,'passed');});
for(const conclusion of ['failure','timed_out','cancelled','action_required','startup_failure','stale','skipped','neutral',null,'unexpected'])test(`required conclusion ${conclusion} cannot pass`,async()=>{const runs=passing();runs[0]=checkRun(names[0],{conclusion});assert.notEqual((await run({runs})).status,'passed');});
for(const status of ['queued','in_progress','waiting','requested','unknown'])test(`required status ${status} remains running`,async()=>{const runs=passing();runs[0]=checkRun(names[0],{status,conclusion:null});assert.equal((await run({runs})).status,'running');});
test('missing one matrix check blocks after grace period',async()=>{const r=await run({runs:passing().slice(0,2)});assert.equal(r.status,'blocked');assert.deepEqual(r.missing,[names[2]]);});
test('recent missing checks remain running',async()=>{assert.equal((await run({runs:[],date:'2026-10-22T11:59:00Z'})).status,'running');});
test('security success cannot substitute for CI',async()=>{assert.equal((await run({runs:[checkRun('GitGuardian Security Checks',{app:'gitguardian'})]})).status,'blocked');});
test('security failure cannot be hidden by CI success',async()=>{assert.equal((await run({runs:[...passing(),checkRun('GitGuardian Security Checks',{app:'gitguardian',conclusion:'failure'})]})).status,'failed');});
test('automation changes require dedicated test job',async()=>{const r=await run({files:['.github/scripts/guardian/index.mjs']});assert.equal(r.status,'blocked');assert.ok(r.missing.includes('guardian + bot tests'));});
test('dedicated automation test failure blocks readiness',async()=>{assert.equal((await run({files:['.github/scripts/guardian/index.mjs'],runs:[...passing(),checkRun('guardian + bot tests',{conclusion:'failure'})]})).status,'failed');});
test('checks API refusal is unknown not passing',async()=>{assert.equal((await run({errors:{listCheckRunsForRef:{status:403}}})).status,'unknown');});
test('missing changed files is unknown',async()=>{assert.equal((await run({files:null})).status,'unknown');});
test('required failure dominates pending checks',async()=>{const runs=passing();runs[0]=checkRun(names[0],{conclusion:'failure'});runs[1]=checkRun(names[1],{status:'queued',conclusion:null});assert.equal((await run({runs})).status,'failed');});
test('optional infrastructure failure is visible without replacing required checks',async()=>{const r=await run({runs:[...passing(),checkRun('Vercel',{conclusion:'failure'})]});assert.equal(r.status,'passed');assert.deepEqual(r.optionalFailing,['Vercel']);});
test('branch requirements are added to static requirements',async()=>{assert.equal((await run({policy:{requiredChecks:[{name:'extra-security'}]}})).status,'blocked');});
test('an incorrect app cannot satisfy an app-bound requirement',async()=>{assert.notEqual((await run({policy:{requiredChecks:[{name:names[0],appId:99}]}})).status,'passed');});
test('latest rerun supersedes old failure',async()=>{const old=checkRun(names[0],{conclusion:'failure'});old.completed_at='2026-10-21T10:00:00Z';assert.equal((await run({runs:[old,...passing()]})).status,'passed');});
test('legacy status cannot hide failed required action',async()=>{assert.equal((await run({runs:[checkRun(names[0],{conclusion:'failure'}),...passing().slice(1)],statuses:[{context:names[0],state:'success'}]})).status,'failed');});
test('Guardian advisory is ignored only by its external identifier',async()=>{assert.equal((await run({runs:[...passing(),{...checkRun('CODOVYN Guardian / readiness (advisory)',{conclusion:'failure'}),external_id:'codovyn-guardian:abc'}]})).status,'passed');});

test('explicit CI infrastructure failure remains unknown and blocked',async()=>{const runs=passing();runs[0]={...checkRun(names[0],{conclusion:'failure'}),output:{title:'Job was not started',summary:'Billing restrictions'}};const r=await run({runs});assert.equal(r.status,'unknown');assert.ok(r.findings.some(x=>x.id==='checks.infrastructure-blocked'));});
