import test from 'node:test';
import assert from 'node:assert/strict';
import {probeHeader,probeProcess} from './lib/opencode-git-probe.js';
test('research Git snapshot encoding rejects malformed data and cannot inject native source',()=>{
 const snapshot={root:'/disposable/"?\\\n',gitDirectory:'/g',commonDirectory:'/g',head:'abc',roots:'abc',branch:'main'};
 const header=probeHeader(snapshot);assert.ok(header.includes('\\042'));assert.ok(!header.includes(snapshot.root));
 for(const value of [{...snapshot,head:'bad\0value'},{...snapshot,root:'relative'},{...snapshot,head:'x'.repeat(16385)},{}])assert.throws(()=>probeHeader(value));
});


test('research probe cancellation is bounded and verifies its owned process group',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(probeProcess(process.execPath,['-e','process.exit(99)'],{signal:controller.signal}),/before launch/);
 const active=new AbortController();const timer=setTimeout(()=>active.abort(),150);
 try{await assert.rejects(probeProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:active.signal}),/cancelled/);}finally{clearTimeout(timer);}
 await assert.rejects(probeProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:100}),/timed out/);
});
