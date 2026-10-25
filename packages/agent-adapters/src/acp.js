import { spawn } from 'node:child_process';
import { boundedJsonLines } from './jsonl.js';
import { manageAgentProcess } from './process.js';
import { AgentFailure } from '../../agent-core/src/index.js';

/** One owned ACP transport; no reconnect/replay and no arbitrary client methods. */
export class AcpConnection {
  constructor({ command, args = [], cwd, env, onUpdate = () => {}, onRequest = () => null, timeoutMs = 10000, execution, signal }) {
    this.incomingIds = new Set();
    this.methods = [];
    this.pending = new Map(); this.nextId = 1; this.closed = false; this.timeoutMs = timeoutMs;
    execution?.starting();
    this.child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
    this.lifecycle = manageAgentProcess(this.child);
    execution?.spawned({ pid: this.child.pid, group: process.platform !== 'win32' });
    this.execution = execution;
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
            } else if (message.method === 'session/update') onUpdate(message.params);
          } else {
            const pending = this.pending.get(message.id);
            if (!pending) throw new AgentFailure('fatal','Unexpected or duplicate ACP response');
            clearTimeout(pending.timer); this.pending.delete(message.id);
            if (message.error) pending.reject(new AgentFailure(message.error.code === -32000 ? 'authentication' : message.error.code === -32800 ? 'cancelled' : 'fatal', message.error.code === -32000 ? 'OpenCode authentication is required in the isolated provider context' : 'OpenCode ACP request failed'));
            else if ('result' in message) pending.resolve(message.result);
            else throw new AgentFailure('fatal','ACP response has no result');
          }
        }
        // stdout can close just before Darwin publishes child exit. Give that
        // owned exit a bounded settlement window before signalling its group.
        let exitTimer;
        try { await Promise.race([this.lifecycle.exited, new Promise(resolve => { exitTimer = setTimeout(resolve, 100); })]); }
        finally { clearTimeout(exitTimer); }
        this.fail(new AgentFailure('fatal','ACP disconnected; action outcomes may require reconciliation'));
      } catch (error) { this.fail(error); }
    })();
    this.child.once('error', () => this.fail(new AgentFailure('fatal','ACP executable could not start')));
    this.signal=signal;this.abort=()=>this.fail(new AgentFailure('cancelled','ACP inspection cancelled'));
    signal?.addEventListener('abort',this.abort,{once:true});if(signal?.aborted)this.abort();
  }
  send(message) {
    if (this.closed) throw new AgentFailure('fatal','ACP connection is closed');
    if(typeof message.method==='string'){if(this.methods.length>=256)throw new AgentFailure('fatal','ACP method budget exceeded');this.methods.push(message.method);}
    const line = JSON.stringify({ jsonrpc:'2.0', ...message }) + '\n';
    if (Buffer.byteLength(line) > 1048576) throw new AgentFailure('fatal','ACP message exceeds the size limit');
    this.child.stdin.write(line);
  }
  request(method, params, timeoutMs = this.timeoutMs) {
    if (this.closed || this.pending.size >= 32) return Promise.reject(new AgentFailure('fatal','ACP request limit or closed connection'));
    const id = this.nextId++;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => this.fail(new AgentFailure('fatal','ACP request deadline exceeded; do not replay unresolved actions')),timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
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
    this.fail(new AgentFailure('cancelled','ACP connection disposed'));
    await this.lifecycle.dispose();
    await this.pump;
    this.execution?.stopped();
  }
}
