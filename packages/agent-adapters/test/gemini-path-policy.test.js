import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { geminiWritePattern, geminiPolicy, assertGeminiDraft } from '../src/gemini.js';
test('Gemini write policy matches only an unambiguous top-level draft file path', () => {
  const root='/tmp/draft [special].dir';const pattern=new RegExp(geminiWritePattern(root));
  const matches=value=>pattern.test(JSON.stringify(value));
  assert.equal(matches({file_path:root+'/src/main.js',content:'source\n"quoted"'}),true);
  assert.equal(matches({content:'text',file_path:root+'/new.txt',allow_multiple:true}),true);
  for(const path of ['/tmp/outside/file',root+'-other/file',root+'/../outside',root+'/dir/../../outside',root+'/dir/.\0./outside',root+'/.git',root+'/.git/config',root+'/space /../outside']) {
    assert.equal(matches({file_path:path,content:'text'}),false,path);
  }
  assert.equal(matches({file_path:'/outside',content:`,"file_path":"${root}/safe"`}),false);
  assert.equal(matches({file_path:'/outside',nested:{file_path:root+'/safe'}}),false);
  assert.equal(pattern.test(`{"file_path":"${root}/safe","file_path":"/outside","content":"bad"}`),false);
  assert.equal(pattern.test(`{"file_path":"/outside","file_path":"${root}/safe","content":"bad"}`),false);
  assert.equal(new RegExp(geminiWritePattern('C:\\draft', 'win32')).test(JSON.stringify({file_path:'C:/draft/file.txt',content:'ok'})),true);
  assert.throws(()=>geminiWritePattern('/tmp/back\\slash','linux'), /Unsupported/);
  const serialized=geminiPolicy(true,root).split('\n').find(line=>line.startsWith('argsPattern = ')).slice('argsPattern = '.length);
  assert.equal(new RegExp(JSON.parse(serialized)).test(JSON.stringify({file_path:root+'/file',content:'ok'})),true);
});
test('Gemini draft preflight rejects nested symlinks before provider execution', async () => {
  const root=await mkdtemp(join(tmpdir(),'codovyn-gemini-paths-'));
  try {
    await mkdir(join(root,'nested'));await assertGeminiDraft(root);
    await symlink(root,join(root,'nested','loop'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(assertGeminiDraft(root),/symbolic links/);
  } finally {await rm(root,{recursive:true,force:true});}
});
