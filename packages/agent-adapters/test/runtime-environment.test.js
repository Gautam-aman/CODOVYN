import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { agentEnvironment } from '../src/process.js';
test('agent subprocess PATH prefers the shared engine runtime without changing the parent environment', () => {
  const old=process.env.PATH;const env=agentEnvironment();
  const key=Object.keys(env).find(k=>k.toLowerCase()==='path');
  assert.equal(env[key].split(delimiter)[0],dirname(process.execPath));assert.equal(process.env.PATH,old);
});
test('a Node-based provider shim works with no global Node on PATH', {skip:process.platform==='win32'}, async () => {
  const directory=mkdtempSync(join(tmpdir(),'codovyn-node-shim-'));const old=process.env.PATH;
  try {
    const shim=join(directory,'provider');writeFileSync(shim,'#!/usr/bin/env node\nconsole.log(process.execPath);\n',{mode:0o700});
    process.env.PATH='/usr/bin:/bin';
    const {stdout}=await promisify(execFile)(shim,[],{env:agentEnvironment(),timeout:5000});
    assert.equal(stdout.trim(),process.execPath);
  } finally {if(old===undefined)delete process.env.PATH;else process.env.PATH=old;rmSync(directory,{recursive:true,force:true});}
});
