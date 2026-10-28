// Public diagnostics are a closed vocabulary. Never render error.message,
// paths, provider stderr, account labels, credentials or arbitrary IPC text.
const entries=Object.freeze({
 WORKSPACE_REQUIRED:['workspace','Open and trust a workspace before inspecting this provider.','Choose the disposable Calculator for Ask validation.'],
 PROVIDER_BUSY:['model-catalogue','A provider inspection or task operation is already active.','Wait for the current operation; no duplicate discovery was started.'],
 EXECUTABLE_INVALID:['executable','Supported OpenCode executable could not be verified.','Configure the pinned OpenCode 2.1.2 native executable in Provider Settings.'],
 AUTH_CONTEXT_MISSING:['authentication-context','The isolated OpenCode credential database is missing.','Use OpenCode Setup for this project; global credentials are never imported.'],
 AUTH_NOT_CONFIGURED:['authentication-context','No stored integration is configured in this isolated OpenCode context.','Complete OpenCode Setup for the provider you intend to select.'],
 AUTH_CONTEXT_UNSAFE:['authentication-context','The isolated credential context failed ownership or path-integrity checks.','Inspect the private context permissions and links; do not copy global credentials.'],
 AUTH_METADATA_UNAVAILABLE:['authentication-context','OpenCode credential metadata could not be verified safely.','Finish or close provider setup, then inspect the supported version and database compatibility.'],
 AUTH_CONTEXT_CHANGED:['authentication-context','The isolated authentication context changed after review.','Start a fresh review; do not reuse the previous approval.'],
 MODEL_DISCOVERY_PENDING:['model-catalogue','Inspecting OpenCode model metadata.','No inference request is being sent.'],
 MODEL_SELECTION_READY:['model-selection','OpenCode model metadata is ready.','Select a model for review; account access and inference remain unverified.'],
 MODEL_DISCOVERY_FAILED:['model-catalogue','The model catalogue could not be refreshed.','Inspect the pinned CLI and provider connection. No model request was started.'],
 MODEL_NOT_ADVERTISED:['model-selection','The selected model is not in the current supported catalogue.','Refresh Models and select an advertised model; no fallback is performed.'],
 REPOSITORY_BASELINE_CHANGED:['repository-baseline','This Ask validation requires the unchanged disposable Calculator.','Open the approved Calculator fixture; do not reset or alter your project to bypass this check.'],
 REPOSITORY_IDENTITY_FAILED:['repository-identity','Repository identity could not be verified.','Inspect the workspace and Git metadata; replaced or unsupported repositories remain blocked.'],
 SANDBOX_STARTUP_FAILED:['sandbox-startup','The restricted provider process could not start.','Inspect local security diagnostics; do not broaden the sandbox.'],
 ACP_INITIALIZATION_FAILED:['acp-initialization','OpenCode ACP session initialization failed.','Inspect the supported executable and repository compatibility.'],
 MCP_INITIALIZATION_FAILED:['mcp-initialization','The task-bound MCP metadata connection did not initialize.','Inspect task diagnostics; file execution remains disabled.'],
 ACP_REMOTE_ERROR:['request','OpenCode returned a structured ACP error.','Inspect the bounded transport diagnostics and durable accounting; do not retry an uncertain request.'],
 ACP_AUTH_REQUIRED:['request','OpenCode reported an authentication error during the request.','Inspect isolated provider setup without inference; an uncertain request remains spent.'],
 ACP_QUOTA_REPORTED:['request','OpenCode reported a quota or usage-limit error.','In OpenCode Console inspect Settings > Billing, Activity > Logs and Controls budgets. The exact limit is unverified. No funding, policy change, fallback or retry is automatic.'],
 ACP_MODEL_REJECTED:['request','OpenCode rejected the selected model.','Catalogue presence does not prove entitlement; no fallback or retry is authorized.'],
 ACP_REMOTE_CANCELLED:['request','OpenCode reported request cancellation.','Preserve accounting; cancellation does not prove that no inference occurred.'],
 ACP_DISCONNECTED:['request','The ACP transport disconnected or its input stream failed.','The remote outcome may be unknown; do not retry or release an unverified process fence.'],
 ACP_REQUEST_TIMEOUT:['request','The local ACP request deadline expired.','The provider may have processed the request. Preserve uncertain accounting and inspect cleanup.'],
 ACP_PROTOCOL_FAILED:['request','ACP framing, correlation or event handling failed.','Inspect bounded phase diagnostics; do not replay an uncertain submission.'],
 ACP_EMPTY_RESPONSE:['request','OpenCode returned no verified complete text response.','An empty or incomplete response is not a successful Ask and does not authorize retry.'],
 TASK_ADMISSION_FAILED:['task-admission','The task could not obtain its required execution authority.','Reconcile existing repository ownership, task state and approval before another review.'],
 CONSENT_INVALID:['consent','The exact one-use approval is missing, expired or already used.','Obtain a fresh native review; no existing approval is recreated.'],
 REVIEW_ONLY:['consent','This qualification review cannot submit inference.','Cancel the review. A live request requires separate owner approval and a fresh native review.'],
 CLEANUP_UNVERIFIED:['cleanup','Owned-process cleanup could not be certified.','Inspect lifecycle diagnostics and reconcile ownership before starting another task.'],
 REQUEST_FAILED:['request','The approved request failed or its outcome is uncertain.','Inspect durable request accounting. Never automatically retry an uncertain submission.'],
 REQUEST_FENCED:['request-accounting','An earlier request is pending or uncertain; another Ask is blocked.','Review the existing request and provider billing. New approval or restored credits do not clear this fence. No retry, consent or request was created by this blocked preparation.'],
 PREPARATION_FAILED:['preparation','OpenCode preparation did not complete.','Inspect the displayed stage and provider diagnostics. No automatic retry is performed.']
});
const stages=new WeakMap(),known=code=>typeof code==='string'&&Object.hasOwn(entries,code);
function mark(error,code){if(!error||typeof error!=='object')error=new Error('OpenCode operation failed');if(known(code)&&!stages.has(error))stages.set(error,code);return error;}
function diagnostic(error,fallback='PREPARATION_FAILED'){const code=known(error)?error:stages.get(error)||fallback;const key=known(code)?code:'PREPARATION_FAILED';const [stage,message,action]=entries[key];return Object.freeze({code:key,stage,message,action});}
async function at(code,operation){try{return await operation();}catch(error){throw mark(error,code);}}
const inspectionStages=new Set(['repository-reader','repository-identity','repository-broker','sandbox-admission','model-catalogue','acp-ownership','acp-initialize','acp-session','session-configuration','provider-cleanup','broker-cleanup']);
// Host-only bounded metadata observation. No provider text, IDs, paths or
// exception fields are forwarded; observer failures cannot skip cleanup.
function inspection(observer){let emitted=0;return async(stage,operation)=>{
 if(!inspectionStages.has(stage))throw new TypeError('Unknown inspection stage');
 const start=performance.now(),emit=state=>{if(typeof observer==='function'&&emitted++<64)try{observer(Object.freeze({stage,state,elapsedMs:Math.round(performance.now()-start)}));}catch{}};
 emit('started');try{const value=await operation();emit('completed');return value;}catch(error){emit('failed');throw error;}
};}
module.exports={mark,diagnostic,at,known,inspection};
