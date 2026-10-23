import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { agentEnvironment, manageAgentProcess } from './process.js';

const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
/** Read only documented metadata RPCs. Never creates a thread, turn or login. */
export async function inspectCodexReasoning({ cwd, command = 'codex', prefixArgs = [], timeout = 6000 } = {}) {
  const child = spawn(command, [...prefixArgs, 'app-server'], { cwd, env: agentEnvironment(), detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  const managed = manageAgentProcess(child);
  const decoder = new StringDecoder('utf8');
  let buffer = '', bytes = 0, models, configuration;
  const send = (id, method, params) => child.stdin.write(JSON.stringify({ ...(id !== null ? { id } : {}), method, params }) + '\n');
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Codex metadata inspection timed out')), timeout);
      const finish = (error, result) => { clearTimeout(timer); error ? reject(error) : resolve(result); };
      child.once('error', () => finish(new Error('Codex metadata CLI unavailable')));
      child.once('close', () => finish(new Error('Codex metadata inspection closed before completion')));
      child.stderr.on('data', data => { bytes += data.length; if (bytes > 1048576) finish(new Error('Codex metadata exceeded size limit')); });
      child.stdout.on('data', data => {
        bytes += data.length;
        if (bytes > 1048576) { finish(new Error('Codex metadata exceeded size limit')); return; }
        buffer += decoder.write(data);
        while (buffer.includes('\n')) {
          const newline = buffer.indexOf('\n'), line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let response; try { response = JSON.parse(line); } catch { finish(new Error('Malformed Codex metadata')); return; }
          if (response.error && [1, 2, 3].includes(response.id)) { finish(new Error('Codex metadata RPC unavailable')); return; }
          if (response.id === 1) { send(null, 'initialized', {}); send(2, 'model/list', { limit: 100, includeHidden: false }); send(3, 'config/read', { includeLayers: false, cwd }); }
          if (response.id === 2) models = response.result;
          if (response.id === 3) configuration = response.result;
          if (models && configuration) {
            if (!Array.isArray(models.data) || models.data.length > 100) { finish(new Error('Invalid Codex model metadata')); return; }
            // Keep only model IDs and advertised efforts. Discard all other config immediately.
            const configuredModel = configuration.config?.model;
            const entries = models.data.filter(entry => typeof entry.model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(entry.model)).map(entry => ({
              model: entry.model, isDefault: entry.isDefault === true,
              reasoning: [...new Set((Array.isArray(entry.supportedReasoningEfforts) ? entry.supportedReasoningEfforts : []).map(option => option.reasoningEffort).filter(value => efforts.has(value)))],
            }));
            const selected = typeof configuredModel === 'string' ? entries.find(entry => entry.model === configuredModel) : entries.find(entry => entry.isDefault);
            finish(null, { source: 'codex-app-server', defaultModel: selected?.model || null, models: entries }); return;
          }
        }
      });
      send(1, 'initialize', { clientInfo: { name: 'codovyn', title: 'CODOVYN', version: '0.0.0' } });
    });
  } finally { await managed.dispose(); }
}
