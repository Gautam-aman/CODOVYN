import test from 'node:test';
import assert from 'node:assert/strict';
import {probeHeader} from './lib/opencode-git-probe.js';
test('research Git snapshot encoding rejects malformed data and cannot inject native source',()=>{
 const snapshot={root:'/disposable/"?\\\n',gitDirectory:'/g',commonDirectory:'/g',head:'abc',roots:'abc',branch:'main'};
 const header=probeHeader(snapshot);assert.ok(header.includes('\\042'));assert.ok(!header.includes(snapshot.root));
 for(const value of [{...snapshot,head:'bad\0value'},{...snapshot,root:'relative'},{...snapshot,head:'x'.repeat(16385)},{}])assert.throws(()=>probeHeader(value));
});
