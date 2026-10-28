import {hostname} from 'node:os';
import {validateCampaignSpec,campaignDigest,consumeInferenceApproval} from '../../agent-core/src/campaign-consent.js';
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw new TypeError('Invalid campaign request id');return value;};
export function initializeCampaignTables(db){db.exec(`
 CREATE TABLE IF NOT EXISTS campaign_consents(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), spec TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS campaign_requests(id TEXT PRIMARY KEY, consent_id TEXT NOT NULL REFERENCES campaign_consents(id), task_id TEXT NOT NULL REFERENCES tasks(id), segment TEXT NOT NULL, token TEXT NOT NULL, owner TEXT NOT NULL, state TEXT NOT NULL, ordinal INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, tool_calls INTEGER NOT NULL DEFAULT 0, acknowledged INTEGER NOT NULL DEFAULT 0, attempted INTEGER NOT NULL DEFAULT 0, UNIQUE(task_id,segment), UNIQUE(consent_id,ordinal));
 CREATE INDEX IF NOT EXISTS campaign_requests_state ON campaign_requests(state);
`);for(const column of ['tool_calls','acknowledged','attempted'])if(!db.prepare('PRAGMA table_info(campaign_requests)').all().some(c=>c.name===column))db.exec('ALTER TABLE campaign_requests ADD COLUMN '+column+' INTEGER NOT NULL DEFAULT 0');}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
function event(db,taskId,kind,data){db.prepare('INSERT INTO events(task_id,kind,data,created_at) VALUES(?,?,?,?)').run(taskId,kind,JSON.stringify(data),new Date().toISOString());}
function owned(db,taskId,token){const r=db.prepare('SELECT * FROM execution_leases WHERE task_id=?').get(taskId);if(!r||r.released_at!==null||r.token!==token)throw new Error('Current task execution lease required');const o=JSON.parse(r.owner);if(o.pid!==process.pid||o.host!==hostname())throw new Error('Foreign campaign executor');return o;}
function consent(db,consentId){const r=db.prepare('SELECT * FROM campaign_consents WHERE id=?').get(id(consentId));if(!r)throw new Error('Unknown campaign consent');return r;}
/** Read-only advisory for native review. The reservation transaction below
 * remains the final cross-connection authority; this never clears a fence. */
export function campaignSubmissionGate(db){
 const row=db.prepare("SELECT coalesce(sum(CASE WHEN state='uncertain' THEN 1 ELSE 0 END),0) uncertain,coalesce(sum(CASE WHEN state IN ('reserved','submitting','confirmed') THEN 1 ELSE 0 END),0) pending FROM campaign_requests WHERE state IN ('reserved','submitting','confirmed','uncertain')").get();
 const uncertain=Number(row.uncertain),pending=Number(row.pending);
 return Object.freeze({blocked:uncertain+pending>0,reason:uncertain?'uncertain':pending?'pending':null});
}
function current(db,consentId,selection){const r=consent(db,consentId),s=JSON.parse(r.spec);validateCampaignSpec(s);if(r.status!=='approved'||campaignDigest(s)!==r.digest||campaignDigest(validateCampaignSpec(selection))!==r.digest)throw new Error('Campaign revoked or provider/model/scope changed');return {r,s};}
export function verifyCampaignConsent(db,consentId,selection){return current(db,consentId,selection).r.digest;}
export function approveCampaign(db,{id:consentId,spec,approval}){id(consentId);const s=validateCampaignSpec(spec),hash=consumeInferenceApproval(approval,s);return transaction(db,()=>{
 const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(s.taskId);if(!task||task.repository_root!==s.repositoryRoot)throw new Error('Campaign task repository mismatch');
 db.prepare('INSERT INTO campaign_consents VALUES(?,?,?,?,?,?)').run(consentId,s.taskId,JSON.stringify(s),hash,'approved',Date.now());event(db,s.taskId,'campaign-approved',{id:consentId,digest:hash,purpose:s.purpose,maxRequests:s.maxRequests});return {id:consentId,digest:hash};
});}
export function reserveCampaignRequest(db,{consentId,requestId,taskId,token,segment,selection}){id(requestId);id(taskId);id(segment);return transaction(db,()=>{
 const {s}=current(db,consentId,selection);if(s.taskId!==taskId)throw new Error('Campaign belongs to another task');const owner=owned(db,taskId,token);
 const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId),configuration=JSON.parse(db.prepare("SELECT data FROM events WHERE task_id=? AND kind IN ('task-configuration','contextflow-segment-started') ORDER BY seq DESC LIMIT 1").get(taskId)?.data||'null');
 const policy=configuration?.configuration??configuration;if(task.status!=='running'||task.active_agent!==s.provider||policy?.provider!==s.provider||policy?.intent!==s.mode||policy?.permission!==(s.mode==='agent'?'read-write':'read')||campaignDigest(policy)!==s.configurationDigest)throw new Error('Campaign task configuration changed');
 if(campaignSubmissionGate(db).blocked)throw new Error('Campaign request is pending or uncertain; no retry or parallel submission');
 const count=Number(db.prepare('SELECT count(*) AS n FROM campaign_requests WHERE consent_id=?').get(consentId).n);if(count>=s.maxRequests)throw new Error('Campaign request budget exhausted');
 const now=Date.now();db.prepare('INSERT INTO campaign_requests(id,consent_id,task_id,segment,token,owner,state,ordinal,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(requestId,consentId,taskId,segment,token,JSON.stringify(owner),'reserved',count+1,now,now);event(db,taskId,'campaign-request-reserved',{requestId,consentId,segment,ordinal:count+1});return campaignRequest(db,requestId);
});}
export function campaignRequest(db,requestId){const row=db.prepare('SELECT * FROM campaign_requests WHERE id=?').get(id(requestId));if(!row)return undefined;return {id:row.id,consentId:row.consent_id,taskId:row.task_id,segment:row.segment,state:row.state,ordinal:row.ordinal,createdAt:row.created_at,updatedAt:row.updated_at,submissionIntent:row.attempted===1,acknowledged:row.acknowledged===1,mcpToolCalls:row.tool_calls};}
export function transitionCampaignRequest(db,{requestId,token,segment,state,selection}){return transaction(db,()=>{
 const row=db.prepare('SELECT * FROM campaign_requests WHERE id=?').get(id(requestId));if(!row||row.token!==token||row.segment!==segment)throw new Error('Campaign execution segment mismatch');owned(db,row.task_id,token);
 const next={reserved:['submitting','cancelled'],submitting:['confirmed','uncertain'],confirmed:['completed','failed','uncertain']};if(!next[row.state]?.includes(state))throw new Error('Invalid or duplicate campaign outcome');
 if(state==='submitting')current(db,row.consent_id,selection);
 db.prepare('UPDATE campaign_requests SET state=?,updated_at=?,acknowledged=CASE WHEN ?=\'confirmed\' THEN 1 ELSE acknowledged END,attempted=CASE WHEN ?=\'submitting\' THEN 1 ELSE attempted END WHERE id=? AND state=?').run(state,Date.now(),state,state,requestId,row.state);event(db,row.task_id,'campaign-request-state',{requestId,segment,state});return campaignRequest(db,requestId);
});}
export function revokeCampaign(db,consentId){return transaction(db,()=>{const r=consent(db,consentId);db.prepare("UPDATE campaign_consents SET status='revoked' WHERE id=?").run(consentId);event(db,r.task_id,'campaign-revoked',{id:consentId});});}
export function reserveCampaignToolCall(db,{requestId,token,segment,selection}){return transaction(db,()=>{
 const row=db.prepare('SELECT * FROM campaign_requests WHERE id=?').get(id(requestId));if(!row||row.token!==token||row.segment!==segment||!['submitting','confirmed'].includes(row.state))throw new Error('No active campaign tool authority');owned(db,row.task_id,token);const {s}=current(db,row.consent_id,selection);
 if(row.tool_calls>=s.maxMcpToolCalls)throw new Error('Campaign tool budget exhausted');
 const ordinal=row.tool_calls+1;db.prepare('UPDATE campaign_requests SET tool_calls=?,updated_at=? WHERE id=?').run(ordinal,Date.now(),requestId);event(db,row.task_id,'campaign-tool-reserved',{requestId,segment,ordinal});return ordinal;
});}
export function campaignAccounting(db,consentId){const r=consent(db,consentId),spec=JSON.parse(r.spec),rows=db.prepare('SELECT state,count(*) n FROM campaign_requests WHERE consent_id=? GROUP BY state').all(consentId),states=Object.fromEntries(rows.map(r=>[r.state,Number(r.n)])),reserved=rows.reduce((n,r)=>n+Number(r.n),0),observed=db.prepare('SELECT coalesce(sum(tool_calls),0) tools,coalesce(sum(acknowledged),0) acks,coalesce(sum(attempted),0) intents FROM campaign_requests WHERE consent_id=?').get(consentId);return {consentId,status:r.status==='approved'&&spec.expiresAt<=Date.now()?'expired':r.status,reservations:reserved,remaining:spec.maxRequests-reserved,states,acknowledgedSubmissions:Number(observed.acks),submissionIntents:Number(observed.intents),uncertain:states.uncertain||0,internalInferenceTurns:null,mcpToolCalls:Number(observed.tools),mcpToolCallProvenance:'host-reserved-attempts; includes denied calls, not completion or billing',inputTokens:null,outputTokens:null};}
/** A dead host may have submitted before crashing. Never refund or replay.
 * PID reuse/foreign host/EPERM remain pending and block new admission. This
 * changes accounting only, never releases TaskEngine execution ownership. */
export function recoverCampaignRequests(db){return transaction(db,()=>{const recovered=[];for(const r of db.prepare("SELECT * FROM campaign_requests WHERE state IN ('reserved','submitting','confirmed')").all()){
 const o=JSON.parse(r.owner);if(o.host!==hostname())continue;let absent=false;try{process.kill(o.pid,0);}catch(e){absent=e.code==='ESRCH';}if(!absent)continue;
 db.prepare("UPDATE campaign_requests SET state='uncertain',updated_at=? WHERE id=?").run(Date.now(),r.id);event(db,r.task_id,'campaign-request-state',{requestId:r.id,segment:r.segment,state:'uncertain',reason:'host-process-absent-no-replay'});recovered.push(r.id);
 }return recovered;});}
