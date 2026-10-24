import test from 'node:test';import assert from 'node:assert/strict';
import{inspectBrokeredOpenCode}from'../src/opencode-metadata.js';
test('broker metadata rejects unknown provider artifacts before inspection or process creation',async()=>{
 await assert.rejects(inspectBrokeredOpenCode({installation:{compatible:true,version:'2.1.2',binarySha256:'unverified',command:'/must-not-execute'},cwd:'/must-not-read'}),/artifact is unverified|requires supported/);
});
