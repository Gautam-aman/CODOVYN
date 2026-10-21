import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoffPacket } from '../src/handoff.js';
test('portable handoff carries namespaced unresolved actions and verified worktree identity without tool payloads', () => {
  const history=[{seq:1,kind:'agent-started',data:{agent:'codex'}},
    {kind:'agent-event',data:{agent:'codex',event:{type:'tool-start',actionId:'1',action:'command_execution',parameters:{secret:'PRIVATE'}}}},
    {kind:'agent-event',data:{agent:'codex',event:{type:'text',text:'Tests may have run'}}},
    {seq:5,kind:'agent-started',data:{agent:'gemini'}},
    {kind:'agent-event',data:{agent:'gemini',event:{type:'tool-start',actionId:'1',action:'read_file',safeToRetry:true}}},
    {kind:'agent-event',data:{agent:'gemini',event:{type:'tool-complete',actionId:'1',success:true}}}];
  const packet=createHandoffPacket({request:'Continue task',snapshot:{root:'/isolated/draft',commit:'abc',workingTreeHash:'hash'},history});
  assert.equal(packet.actions[0].state,'unresolved');assert.equal(packet.actions[1].state,'completion-reported');
  assert.notEqual(packet.actions[0].id,packet.actions[1].id);
  assert.equal(packet.repository.root,undefined);assert.match(packet.repository.worktreeIdentity,/^[0-9a-f]{64}$/);assert.equal(packet.repository.workingTreeHash,'hash');
  assert.equal(packet.providerReports[0].verification,'provider-reported');
  assert.equal(JSON.stringify(packet).includes('PRIVATE'),false);
});
test('handoff refuses oversized histories rather than silently dropping write state', () => {
  const history=Array.from({length:129},(_,id)=>({kind:'agent-event',data:{agent:'codex',event:{type:'tool-start',actionId:String(id)}}}));
  assert.throws(()=>createHandoffPacket({request:'Continue',history}),/manual review/);
});
