import { createHash } from 'node:crypto';
import { createHandoffPacket } from './handoff.js';
export const contextFlowLimit = 32768;
export const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
export function redactContext(value) {
  return String(value).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{25,})\b/g,'[REDACTED TOKEN]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g,'[REDACTED TOKEN]')
    .replace(/(<(?:password|token|secret|apiKey)>)[^<]+(<\/[^>]+>)/gi,'$1[REDACTED]$2')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@/\s]+@/gi,'$1[REDACTED]@')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi,'$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|authorization)["']?\s*[=:]\s*["']?)[^\s,;"']+/gi,'$1[REDACTED]');
}
export function contextPath(path) {
  return text(path,512) && path.length>0 && !/[\x00-\x1f]/.test(path) && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part=>
    !part || part==='.' || part==='..' || /^(?:\.git|\.opencode|\.ssh|\.aws|\.config|\.docker|\.npmrc|\.netrc|\.pypirc|node_modules|vendor|dist|build)$/i.test(part) ||
    /(?:^\.env|credential|secret|auth\.json|^id_rsa|\.(?:pem|key|p12|pfx|keystore)$)/i.test(part));
}
function safeStrings(value) {
  if(typeof value==='string' && redactContext(value)!==value)throw new TypeError('ContextFlow contains unredacted sensitive text');
  if(Array.isArray(value))value.forEach(safeStrings);else if(object(value))Object.values(value).forEach(safeStrings);
}
export function validateContextFlow(packet) {
  if(!keys(packet,['version','task','repository','context','handoff','instructions','accounting']) || packet.version!==1 ||
    !keys(packet.task,['id','objective','requirements','acceptanceCriteria']) || !/^[a-zA-Z0-9_-]{1,80}$/.test(packet.task.id) || !text(packet.task.objective,10000) ||
    !keys(packet.repository,['identity','branch','commit','fingerprint','originalFingerprint','changedFiles']) ||
    !hash(packet.repository.identity)||!hash(packet.repository.fingerprint)||!hash(packet.repository.originalFingerprint)||!text(packet.repository.branch,256)||!text(packet.repository.commit,128)||
    !keys(packet.context,['files','actions','providerClaims','verifiedActions','pendingSteps','testResults','decisions']) ||
    !keys(packet.handoff,['fromProvider','toProvider','model','reason','requiresApproval']) || packet.handoff.fromProvider!=='codex'||packet.handoff.toProvider!=='opencode'||packet.handoff.requiresApproval!==true||!text(packet.handoff.model,256) ||
    !['quota','authentication','temporary','unavailable','user-requested-switch'].includes(packet.handoff.reason)||!text(packet.instructions,1024)||
    !keys(packet.accounting,['reportedInputTokens','reportedOutputTokens','reportedCostUsd'])||Object.keys(packet.accounting).length!==3||Object.values(packet.accounting).some(v=>v!==null))throw new TypeError('Invalid ContextFlow version or structure');
  for(const list of [packet.task.requirements,packet.task.acceptanceCriteria,packet.context.pendingSteps,packet.context.decisions])
    if(!Array.isArray(list)||list.length>16||list.some(v=>!text(v,512)))throw new TypeError('Invalid bounded ContextFlow instructions');
  if(!Array.isArray(packet.repository.changedFiles)||packet.repository.changedFiles.length>128||packet.repository.changedFiles.some(v=>!contextPath(v)))throw new TypeError('Sensitive or excessive changed paths require review');
  if(!Array.isArray(packet.context.files)||packet.context.files.length>8||packet.context.files.some(file=>!keys(file,['path','sha256','excerpt','verification','truncated'])||!contextPath(file.path)||!hash(file.sha256)||!text(file.excerpt,2048)||file.verification!=='host-read'||typeof file.truncated!=='boolean'))throw new TypeError('Invalid ContextFlow source excerpts');
  const arrays=[['actions',128],['providerClaims',6],['verifiedActions',16],['testResults',16]];
  for(const [key,max]of arrays)if(!Array.isArray(packet.context[key])||packet.context[key].length>max)throw new TypeError('Invalid ContextFlow evidence bounds');
  for(const action of packet.context.actions)if(!keys(action,['id','provider','actionId','action','state','safeToRetry','success'])||!text(action.id,400)||!text(action.provider,64)||!text(action.actionId,256)||!text(action.action,128)||!['unresolved','completion-reported'].includes(action.state)||typeof action.safeToRetry!=='boolean'||(action.success!==undefined&&action.success!==null&&typeof action.success!=='boolean'))throw new TypeError('Invalid ContextFlow action ledger');
  for(const claim of packet.context.providerClaims)if(!keys(claim,['agent','text','verification'])||!text(claim.agent,64)||!text(claim.text,500)||claim.verification!=='provider-reported')throw new TypeError('Invalid provider claim');
  for(const evidence of packet.context.verifiedActions)if(!keys(evidence,['kind','verification'])||!['draft-created','draft-reconciled','draft-accepted','contextflow-completed'].includes(evidence.kind)||evidence.verification!=='host-journal')throw new TypeError('Unverified ContextFlow evidence');
  for(const result of packet.context.testResults)if(!keys(result,['label','exitCode','verification'])||!text(result.label,256)||!Number.isSafeInteger(result.exitCode)||result.verification!=='host-journal')throw new TypeError('Invalid host test evidence');
  safeStrings(packet);
  if(Buffer.byteLength(JSON.stringify(packet))>contextFlowLimit)throw new TypeError('ContextFlow packet exceeds 32 KiB; manual context review required');
  return packet;
}
export function createContextFlow({task,snapshot,fingerprint,originalFingerprint,history,files=[],reason,destinationModel='unknown',requirements=[],acceptanceCriteria=[]}) {
  const legacy=createHandoffPacket({request:task.request,snapshot,history,step:task.step});
  if(legacy.actions.some(action=>action.state==='unresolved'))throw new Error('Unresolved tool actions block ContextFlow; no replay or guessed outcome is permitted');
  const changedFiles=snapshot.changedPaths||[];
  const packet={version:1,task:{id:task.id,objective:redactContext(task.request),requirements:requirements.map(redactContext),acceptanceCriteria:acceptanceCriteria.map(redactContext)},
    repository:{identity:digest(snapshot.root),branch:snapshot.branch||'',commit:snapshot.commit||'',fingerprint,originalFingerprint,changedFiles},
    context:{files:files.map(file=>({...file,excerpt:redactContext(file.excerpt)})),actions:legacy.actions.map(action=>Object.fromEntries(Object.entries(action).map(([key,value])=>[key,typeof value==='string'?redactContext(value):value]))),
      providerClaims:[...new Map(legacy.providerReports.map(report=>{const value={...report,agent:report.agent||'unknown',text:redactContext(report.text)};return [digest(value.text),value];})).values()],
      verifiedActions:history.filter(event=>['draft-created','draft-reconciled','draft-accepted','contextflow-completed'].includes(event.kind)).slice(-16).map(event=>({kind:event.kind,verification:'host-journal'})),
      pendingSteps:['Inspect current files and verify remaining work against the original objective.','Do not repeat completed or ambiguous commands or writes.'],decisions:[],
      testResults:history.filter(event=>event.kind==='host-test-result'&&event.data?.verification==='host-journal'&&Number.isSafeInteger(event.data.exitCode)).slice(-16).map(event=>({label:redactContext(String(event.data.label).slice(0,256)),exitCode:event.data.exitCode,verification:'host-journal'}))},
    handoff:{fromProvider:'codex',toProvider:'opencode',model:destinationModel,reason,requiresApproval:true},
    instructions:'New authorized provider session, not native session migration. Host file hashes establish observed content, not test success. Provider claims remain unverified. Inspect the worktree and continue without replaying the action ledger. Review all draft changes before application.',
    accounting:{reportedInputTokens:null,reportedOutputTokens:null,reportedCostUsd:null}};
  return validateContextFlow(packet);
}
export function contextFlowAccounting(packet) {
  const json=JSON.stringify(validateContextFlow(packet));return {utf8Bytes:Buffer.byteLength(json),sha256:digest(json),inputTokens:null,outputTokens:null,costUsd:null,provenance:'local-serialization; provider usage unknown'};
}
