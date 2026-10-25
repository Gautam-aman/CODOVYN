/** Preparation policy only. This module cannot authorize or launch inference.
 * Provider-internal inference calls differ from submitted tasks and remain unknown. */
export const campaignLimits=Object.freeze({submissions:6,requestMilliseconds:120000,toolActions:8,parallelism:1,retries:0,fallbacks:0});
const tasks=[
 ['codex-ask','codex','ask','Explain Calculator, identify division-by-zero behavior and recommend the smallest safe fix. Do not modify files.'],
 ['codex-agent','codex','agent','Add a division-by-zero regression test and the minimal fix. Keep all changes in the approved draft.'],
 ['opencode-ask','opencode','ask','Use the authorized MCP project-reading tool to read Calculator and explain division. Do not modify files.'],
 ['opencode-agent','opencode','agent','Use only approved project MCP tools to add a division-by-zero regression test and minimal fix in the draft.'],
 ['handoff-source','codex','ask','Inspect Calculator and prepare a bounded plan for fixing division by zero. Do not modify files.'],
 ['handoff-destination','opencode','agent','Continue the approved original division task using the recipient-bound ContextFlow packet and approved MCP draft tools.']
];
export function prepareCampaign({codex,opencode}){
 const providers={codex,opencode},blockers=[];
 for(const [id,p] of Object.entries(providers)){
  if(!p||p.compatible!==true)blockers.push(`${id}: compatible executable not verified`);
  if(!p||typeof p.model!=='string'||!p.model.trim())blockers.push(`${id}: exact model not selected`);
  if(p?.preActionBudget!==true)blockers.push(`${id}: eight-action pre-execution budget not verified`);
  if(p?.restrictedTools!==true)blockers.push(`${id}: restricted tool boundary not verified`);
 }
 return {version:1,status:'PREPARED — NOT EXECUTED',authorization:'not-granted',actualModelRequests:0,
  estimatedCost:'unknown',providerInternalRequestCount:'unknown',limits:campaignLimits,
  sourceDisclosure:'Permitted source can contain sensitive data. Review excerpts before provider transfer.',
  requiredApprovals:['Explicit owner approval of exact campaign and provider/model scope','Fresh native Agent draft approval','Separate one-use native ContextFlow recipient/packet approval'],
  blockers,eligibleForApproval:blockers.length===0,
  requests:tasks.map(([id,provider,mode,prompt])=>({id,provider,model:providers[provider]?.model??null,mode,prompt,
   freshBaseline:!id.startsWith('handoff-'),logicalTask:id.startsWith('handoff-')?'same-handoff-task':id,
   ...campaignLimits,submissions:1,automaticPatchApplication:false}))};
}
/** This is a fail-closed inspection gate, not a spending consent mechanism. */
export function requirePreparedCampaign(plan){
 if(plan?.version!==1||plan.authorization!=='not-granted'||plan.actualModelRequests!==0||
  plan.requests?.length!==6||plan.blockers?.length||plan.eligibleForApproval!==true)throw new Error('Campaign remains blocked; no inference authorization issued');
 throw new Error('Explicit owner authorization is still required; preparation cannot launch inference');
}
