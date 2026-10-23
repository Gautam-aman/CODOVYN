import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { inspectCodexReasoning } from './codex-models.js';
import { discoverOpenCode, discoveredModelId } from './opencode.js';
export function openCodeStateDirectory(dataDirectory,cwd) {
  return join(dataDirectory,'providers','opencode',createHash('sha256').update(realpathSync(cwd)).digest('hex').slice(0,24));
}
export async function discoverProvider(provider,{cwd,dataDirectory,modelId,configured,signal}={}) {
  if(provider==='codex'){
    const metadata=await inspectCodexReasoning({cwd});
    return {provider,defaultModel:metadata.defaultModel,authentication:'unknown',availability:'unknown',source:metadata.source,
      models:metadata.models.map(entry=>({id:discoveredModelId(provider,entry.model),provider,model:entry.model,reasoning:entry.reasoning,availability:'unknown',source:'discovered'}))};
  }
  if(provider==='opencode')return discoverOpenCode({cwd,stateDirectory:openCodeStateDirectory(dataDirectory,cwd),modelId,configured,signal});
  throw new TypeError('This provider has no verified automatic catalogue interface');
}
