/** Cached successful-task evidence only: this policy never probes or spends. */
export function restorationDecision({ enabled=false, primary, current, safe=false, evidence, failedAt, switchedAt,
 now=Date.now(), cooldownMs=60000, maxAgeMs=120000 }) {
 if(typeof enabled!=='boolean'||!Number.isFinite(cooldownMs)||cooldownMs<0||!Number.isFinite(maxAgeMs)||maxAgeMs<=0)throw new TypeError('Invalid restoration policy');
 const deny=reason=>({restore:false,reason});
 if(!enabled)return deny('disabled');
 if(current===primary)return deny('already-primary');
 if(!safe)return deny('unverified-or-pending-operation');
 if(!evidence||evidence.agent!==primary||evidence.source!=='successful-task')return deny('no-supported-availability-evidence');
 const observed=Date.parse(evidence.observedAt),failure=Date.parse(failedAt),switched=Date.parse(switchedAt);
 if(!Number.isFinite(now)||!Number.isFinite(observed)||!Number.isFinite(failure)||!Number.isFinite(switched)||observed<failure||observed>now||now-observed>maxAgeMs)return deny('stale-or-invalid-evidence');
 if(now-Math.max(failure,switched)<cooldownMs)return deny('cooldown');
 return {restore:true,reason:'recent-success-at-verified-checkpoint',observedAt:evidence.observedAt};
}
