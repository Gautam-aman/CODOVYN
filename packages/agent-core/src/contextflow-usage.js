/** Preserve provider telemetry per execution segment. Never infer billing or add cumulative reports. */
export function contextFlowUsage(events) {
 const attempts=[];let current=null;
 for(const event of events) {
  if(event.kind==='agent-started') {
   current={provider:event.data.agent,segment:attempts.length+1,provenance:'provider-reported',reports:[],duplicateReports:0};attempts.push(current);
  }
  const usage=event.kind==='agent-event'&&event.data?.event?.type==='completed'?event.data.event.usage:null;
  if(!current||current.provider!=='codex'||!usage||typeof usage!=='object')continue;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  const report={inputTokens:count(usage.input_tokens),outputTokens:count(usage.output_tokens),cachedInputTokens:count(usage.cached_input_tokens)};
  if(Object.values(report).every(value=>value===null))continue;
  if(current.reports.some(existing=>JSON.stringify(existing)===JSON.stringify(report)))current.duplicateReports++;
  else if(current.reports.length<8)current.reports.push(report);
  else current.overflow=true;
 }
 return {attempts:attempts.slice(-32).map(attempt=>({...attempt,usage:attempt.reports.length===1&&!attempt.overflow?attempt.reports[0]:null,status:attempt.reports.length>1||attempt.overflow?'multiple reports; aggregation unknown':attempt.reports.length===1?'reported':'unknown'})),costUsd:null,aggregateTokens:null,note:'Reports are not exact billing. Duplicate telemetry is suppressed. Different reports are not summed without verified cumulative/incremental semantics.'};
}
