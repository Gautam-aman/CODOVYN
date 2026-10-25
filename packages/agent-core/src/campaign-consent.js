import {createHash} from 'node:crypto';
const reviews=new WeakMap(),approvals=new WeakMap();
export const campaignDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['version','purpose','taskId','provider','model','reasoning','mode','repositoryRoot','repositoryFingerprint','configurationDigest','executableSha256','accountContextDigest','scopeDigest','promptSha256','maxRequests','maxMcpToolCalls','maxRequestMs','expiresAt'];
export function validateCampaignSpec(input,now=Date.now()) {
 if(!input||Array.isArray(input)||Object.keys(input).length!==fields.length||Object.keys(input).some(k=>!fields.includes(k)))throw new TypeError('Invalid campaign fields');
 const s=Object.fromEntries(fields.map(k=>[k,input[k]]));
 if(s.version!==1||!['fixture','live'].includes(s.purpose)||typeof s.taskId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(s.taskId||'')||!['codex','opencode'].includes(s.provider)||!['ask','plan','agent'].includes(s.mode)||typeof s.repositoryRoot!=='string'||!s.repositoryRoot.startsWith('/')||/[\0\r\n]/.test(s.repositoryRoot)||s.repositoryRoot.length>4096)throw new TypeError('Invalid campaign identity');
 if(typeof s.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,127}$/.test(s.model)||typeof s.reasoning!=='string'||!/^[a-zA-Z0-9_-]{0,40}$/.test(s.reasoning))throw new TypeError('Exact provider model and effort required');
 for(const k of ['repositoryFingerprint','configurationDigest','executableSha256','accountContextDigest','scopeDigest','promptSha256'])if(typeof s[k]!=='string'||!/^[a-f0-9]{64}$/.test(s[k]))throw new TypeError('Invalid campaign binding');
 for(const[k,min,max]of [['maxRequests',1,6],['maxMcpToolCalls',0,8],['maxRequestMs',1,120000]])if(!Number.isSafeInteger(s[k])||s[k]<min||s[k]>max)throw new TypeError('Invalid campaign limits');
 if(!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=now||s.expiresAt>now+600000)throw new TypeError('Campaign approval expired or too distant');
 return Object.freeze(s);
}
/** Host-only review capabilities. No renderer/JSON/boolean is an approval.
 * The trusted host supplies its native confirmation callback. Production has
 * no message handler exposing this seam and live dispatch remains disabled. */
export function reviewInferenceCampaign(spec){const s=validateCampaignSpec(spec),review=Object.freeze({spec:s,digest:campaignDigest(s)});reviews.set(review,s);return review;}
export async function confirmInferenceCampaign(review,nativeConfirm){
 const spec=reviews.get(review);if(!spec||typeof nativeConfirm!=='function')throw new Error('Host-issued campaign review required');reviews.delete(review);
 const answer=await nativeConfirm(Object.freeze({spec,digest:review.digest,action:'Approve bounded inference',warning:'May consume quota or paid credits; internal inference turns and cost are unknown. ContextFlow and Agent approvals remain separate.'}));
 validateCampaignSpec(spec);if(answer!=='Approve bounded inference')throw new Error('Explicit native campaign approval not granted');
 const approval=Object.freeze({});approvals.set(approval,{spec,digest:review.digest});return approval;
}
export function consumeInferenceApproval(approval,spec){const issued=approvals.get(approval);if(!issued||issued.digest!==campaignDigest(spec))throw new Error('Matching host-issued owner approval required');approvals.delete(approval);validateCampaignSpec(issued.spec);return issued.digest;}
