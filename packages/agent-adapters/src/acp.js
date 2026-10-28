import diagnostics from './opencode-diagnostics.cjs';
import { spawn } from 'node:child_process';
import { boundedJsonLines } from './jsonl.js';
import { manageAgentProcess } from './process.js';
import { AgentFailure } from '../../agent-core/src/index.js';

/** One owned ACP transport; no reconnect/replay and no arbitrary client methods. */
export class AcpConnection {
  constructor({ command, args = [], cwd, env, onUpdate = () => {}, onRequest = () => null, onDiagnostic = () => {}, timeoutMs = 10000, execution, signal }) {
    const started=performance.now();let observations=0;
    const phases=new Set(['request-created','write-enqueued','notification','response','remote-error','failed','process-exit','cancelled','cleanup','activity-accepted']);
    const categories=new Set(['none','stdin-error','signal','zero-exit','nonzero-exit','stdout-closed','protocol-or-handler','owner-signal','deadline','authority-revoked','request-signal','disposal','verified','unverified','authentication','cancelled','quota','model-unavailable','unknown-remote-error']);
    // No parameters, response/error text, stderr, paths or remote identities.
    // Unknown method names and error names are never copied into evidence.
    this.observe=(phase,method='transport',category='none')=>{if(!phases.has(phase)||!categories.has(category)||observations++>=128)return;const safeMethod=['initialize','session/new','session/set_config_option','session/prompt','session/cancel','session/update'].includes(method)?method:'transport';try{onDiagnostic(Object.freeze({phase,method:safeMethod,category,elapsedMs:Math.round(performance.now()-started)}));}catch{/* Diagnostics cannot change execution or cleanup. */}};
    this.incomingIds = new Set();
    this.methods = [];
    this.pending = new Map(); this.nextId = 1; this.closed = false; this.timeoutMs = timeoutMs;
    execution?.starting();
    this.child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
    this.lifecycle = manageAgentProcess(this.child);
    execution?.spawned({ pid: this.child.pid, group: process.platform !== 'win32' });
    this.execution = execution;
    this.child.stdin.on('error',()=>{this.observe('failed','transport','stdin-error');this.fail(diagnostics.mark(new AgentFailure('fatal','ACP input stream failed; do not replay'),'ACP_DISCONNECTED'));});
    this.child.once('exit',(code,signal)=>this.observe('process-exit','transport',signal?'signal':code===0?'zero-exit':'nonzero-exit'));
    let stderrBytes = 0;
    this.child.stderr.on('data', data => { stderrBytes += data.length; if (stderrBytes > 1048576) this.fail(new AgentFailure('fatal','ACP diagnostic output exceeded its bound')); });
    const boundedOutput=async function* (stream) {let bytes=0;for await(const chunk of stream){bytes+=chunk.length;if(bytes>8388608)throw new AgentFailure('fatal','ACP session output exceeded total byte limit');yield chunk;}};
    this.pump = (async () => {
      try {
        for await (const message of boundedJsonLines(boundedOutput(this.child.stdout), 1048576)) {
          if (!message || message.jsonrpc !== '2.0') throw new AgentFailure('fatal','Invalid ACP envelope');
          if (typeof message.method === 'string') {
            if (message.id !== undefined) {
              if (!(Number.isSafeInteger(message.id) || (typeof message.id === 'string' && message.id.length <= 80))) throw new AgentFailure('fatal','Invalid ACP request identity');
              if (this.incomingIds.has(message.id) || this.incomingIds.size >= 256) throw new AgentFailure('fatal','Repeated or excessive ACP client request');
              this.incomingIds.add(message.id);
              const response = onRequest(message.method, message.params);
              this.send(response === null ? { id: message.id, error: { code: -32601, message: 'Client capability unavailable' } } : { id: message.id, result: response });
            } else if (message.method === 'session/update') {this.observe('notification','session/update');onUpdate(message.params);}
          } else {
            const pending = this.pending.get(message.id);
            if (!pending) throw new AgentFailure('fatal','Unexpected or duplicate ACP response');
            // Validate before removing correlation: otherwise a malformed reply
            // can strand the caller forever after its timer has been cleared.
            const hasError=Object.hasOwn(message,'error'),hasResult=Object.hasOwn(message,'result');
            if (hasError===hasResult || (hasError&&(!message.error||typeof message.error!=='object'||Array.isArray(message.error)||!Number.isSafeInteger(message.error.code)))) throw new AgentFailure('fatal','ACP response has no unambiguous result');
            clearTimeout(pending.timer); this.pending.delete(message.id);
            if (message.error) {
              const category=remoteErrorCategory(message.error);
              this.observe('remote-error',pending.method,category);
              const code={authentication:'ACP_AUTH_REQUIRED',cancelled:'ACP_REMOTE_CANCELLED',quota:'ACP_QUOTA_REPORTED','model-unavailable':'ACP_MODEL_REJECTED'}[category]||'ACP_REMOTE_ERROR';
              pending.reject(diagnostics.mark(new AgentFailure(category==='authentication'?'authentication':category==='cancelled'?'cancelled':'fatal','OpenCode returned an ACP error; no safe replay'),code));
            } else {this.observe('response',pending.method);pending.resolve(message.result);}
          }
        }
        // stdout can close just before Darwin publishes child exit. Give that
        // owned exit a bounded settlement window before signalling its group.
        let exitTimer;
        try { await Promise.race([this.lifecycle.exited, new Promise(resolve => { exitTimer = setTimeout(resolve, 100); })]); }
        finally { clearTimeout(exitTimer); }
        if(!this.closed){this.observe('failed','transport','stdout-closed');this.fail(diagnostics.mark(new AgentFailure('fatal','ACP disconnected; action outcomes may require reconciliation'),'ACP_DISCONNECTED'));}
      } catch (error) { if(!this.closed){this.observe('failed','transport','protocol-or-handler');this.fail(diagnostics.mark(error,'ACP_PROTOCOL_FAILED'));} }
    })();
    this.child.once('error', () => this.fail(diagnostics.mark(new AgentFailure('fatal','ACP executable could not start'),'SANDBOX_STARTUP_FAILED')));
    this.signal=signal;this.abort=()=>{this.observe('cancelled','transport','owner-signal');this.fail(new AgentFailure('cancelled','ACP inspection cancelled'));};
    signal?.addEventListener('abort',this.abort,{once:true});if(signal?.aborted)this.abort();
  }
  send(message) {
    if (this.closed) throw new AgentFailure('fatal','ACP connection is closed');
    if(typeof message.method==='string'){if(this.methods.length>=256)throw new AgentFailure('fatal','ACP method budget exceeded');this.methods.push(message.method);}
    const line = JSON.stringify({ jsonrpc:'2.0', ...message }) + '\n';
    if (Buffer.byteLength(line) > 1048576) throw new AgentFailure('fatal','ACP message exceeds the size limit');
    this.child.stdin.write(line);
    if(typeof message.method==='string')this.observe('write-enqueued',message.method);
  }
  request(method, params, timeoutMs = this.timeoutMs) {
    if (this.closed || this.pending.size >= 32) return Promise.reject(new AgentFailure('fatal','ACP request limit or closed connection'));
    const id = this.nextId++;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {this.observe('failed',method,'deadline');this.fail(diagnostics.mark(new AgentFailure('fatal','ACP request deadline exceeded; do not replay unresolved actions'),'ACP_REQUEST_TIMEOUT'));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer,method});this.observe('request-created',method);
      try { this.send({ id, method, params }); } catch(error) { this.fail(error); }
    });
  }
  notify(method,params) { this.send({method,params}); }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.lifecycle.dispose().catch(() => {});
  }
  async dispose() {
    this.signal?.removeEventListener('abort',this.abort);
    this.observe('cancelled','transport','disposal');
    this.fail(new AgentFailure('cancelled','ACP connection disposed'));
    try{await this.lifecycle.dispose();await this.pump;this.execution?.stopped();this.observe('cleanup','transport','verified');}
    catch(error){this.observe('cleanup','transport','unverified');throw error;}
  }
}

function remoteErrorCategory(error){
  // Only pinned structured fields/codes, never fuzzy matching provider prose.
  if(error.code===-32000)return 'authentication';
  if(error.code===-32800)return 'cancelled';
  const name=error.data?.errorName;
  if(['provider.quota','provider.free-limit','QuotaExceeded'].includes(name))return 'quota';
  // Pinned ACPInvalidModelError is serialized as invalidParams with these
  // bounded identities, not necessarily with its original exception name.
  if(name==='ACPInvalidModelError'||(error.code===-32602&&[error.data?.providerId,error.data?.modelId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$/.test(v))))return 'model-unavailable';
  return 'unknown-remote-error';
}
