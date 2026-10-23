import { realpathSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { isAbsolute, join, relative, dirname } from 'node:path';
import { AgentFailure } from '../../agent-core/src/index.js';

export function openCodeBoundary({ cwd, stateDirectory, command, write = false }) {
  if (process.platform !== 'darwin') throw new AgentFailure('fatal','OpenCode execution is disabled: this platform has no verified filesystem/process boundary');
  if (!isAbsolute(command) || !statSync(command).isFile()) throw new TypeError('OpenCode requires a resolved executable');
  const root = realpathSync(cwd), executable = realpathSync(command);
  mkdirSync(stateDirectory,{recursive:true,mode:0o700});
  const state = realpathSync(stateDirectory);
  for(const path of [join(root,'opencode.json'),join(root,'opencode.jsonc'),join(root,'.opencode'),join(state,'config','opencode','opencode.json'),join(state,'config','opencode','opencode.jsonc'),'/Library/Application Support/opencode']) {
    if(existsSync(path))throw new AgentFailure('fatal','Guarded OpenCode mode refuses project plugins/custom or managed configuration until its policy can be verified');
  }
  if ((statSync(state).mode & 0o700) !== 0o700 || (statSync(state).mode & 0o077)) throw new TypeError('OpenCode private state must have owner-only permissions');
  const outside = path => path === '..' || path.startsWith('../') || isAbsolute(path);
  if (!outside(relative(root,state)) || !outside(relative(state,root))) throw new TypeError('OpenCode private state must be outside the project');
  for(const part of ['config','data','cache','tmp']) mkdirSync(join(state,part),{recursive:true,mode:0o700});
  const quoted = value => JSON.stringify(value);
  const reads = ['/System','/usr','/bin','/sbin','/Library/Apple','/opt/homebrew/Cellar',root,state].map(path=>`(subpath ${quoted(path)})`).join(' ');
  const profile = `(version 1)\n(allow default)\n(deny file-write*)\n(deny file-read* (subpath "/Users") (subpath "/private/var/folders") (subpath "/private/tmp") (subpath "/Volumes"))\n(deny process-exec)\n(allow process-fork)\n(allow process-exec (literal ${quoted(executable)}))\n(allow signal (target self))\n(allow sysctl-read)\n(allow mach-lookup)\n(allow file-read-metadata)\n(allow file-read* ${reads} (subpath "/dev") (literal ${quoted(executable)}))\n(allow file-write* (subpath ${quoted(state)}) (literal "/dev/null") ${write ? `(subpath ${quoted(root)})` : ''})\n(allow network*)\n(deny file-write* (regex #".*/[.]git(/.*)?$"))\n(deny file-read-data (regex #".*/[.]opencode(/.*)?$") (regex #".*/opencode[.]jsonc?$") (regex #".*/[.]env([.].*)?$"))`;
  const scope = { '*':'deny', read:'ask', glob:'ask', grep:'ask', edit:write?'ask':'deny', shell:'deny', bash:'deny', task:'deny', skill:'deny', lsp:'deny', webfetch:'deny', websearch:'deny', external_directory:'deny' };
  const policy = { autoupdate:false, snapshot:false, formatter:false, lsp:false, plugin:[], mcp:{}, permission:scope,
    agent:{build:{permission:scope,steps:8},plan:{permission:scope,steps:8}} };
  const env = { PATH:`${dirname(executable)}:/usr/bin:/bin:/usr/sbin:/sbin`, LANG:'en_US.UTF-8', HOME:state,
    TMPDIR:join(state,'tmp'), XDG_CONFIG_HOME:join(state,'config'), XDG_DATA_HOME:join(state,'data'), XDG_CACHE_HOME:join(state,'cache'),
    OPENCODE_CONFIG_CONTENT:JSON.stringify(policy), OPENCODE_PERMISSION:JSON.stringify(scope), OPENCODE_DISABLE_AUTOUPDATE:'true',
    OPENCODE_DISABLE_DEFAULT_PLUGINS:'true', OPENCODE_DISABLE_CLAUDE_CODE:'true', OPENCODE_DISABLE_LSP_DOWNLOAD:'true' };
  return { command:'/usr/bin/sandbox-exec', prefixArgs:['-p',profile,executable], cwd:root, env, stateDirectory:state };
}
