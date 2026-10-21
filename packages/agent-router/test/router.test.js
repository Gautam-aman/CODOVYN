import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTask,routeModel,validateRouting} from '../src/index.js';
const model=(id,quality,price)=>({id,provider:'gemini',model:id,capabilities:['streaming','tools','writes'],reasoning:[],quality,reliability:0.9,availability:'available',price:price===null?null:{inputPerMillionUsd:price,outputPerMillionUsd:price,source:'test fixture only'}});
const policy={mode:'auto',models:[model('small',30,1),model('medium',70,2),model('large',95,4)],tokens:{input:1000,output:1000}};
test('all five routing modes are deterministic and preserve task adequacy',()=>{
 assert.equal(routeModel('Explain docs',policy).selected.id,'small');
 assert.equal(routeModel('Implement endpoint',policy).selected.id,'medium');
 assert.equal(routeModel('Debug concurrency',policy).selected.id,'large');
 assert.equal(routeModel('Explain docs',{...policy,mode:'economy'}).selected.id,'small');
 assert.equal(routeModel('Explain docs',{...policy,mode:'balanced'}).selected.id,'medium');
 assert.equal(routeModel('Explain docs',{...policy,mode:'performance'}).selected.id,'large');
 assert.equal(routeModel('Explain docs',{...policy,mode:'custom',customModel:'large'}).selected.id,'large');
 assert.deepEqual(routeModel('Explain docs',policy),routeModel('Explain docs',policy));
 assert.equal(classifyTask('Fix cryptography'),'complex');
});
test('capabilities, reasoning, availability and custom eligibility fail closed',()=>{
 for(const changes of [{requiredCapabilities:['writes'],models:[{...model('a',90,1),capabilities:['streaming']}]},
  {reasoning:'high'},{models:[{...model('a',90,1),availability:'unknown'}]},
  {models:[{...model('a',90,1),availability:'unavailable'}]}])assert.equal(routeModel('Explain',{...policy,...changes}).selected,null);
 assert.equal(routeModel('Explain',{...policy,models:[{...model('a',90,1),availability:'unknown'}],allowUnknownAvailability:true}).selected.availability,'unknown');
});
test('finite budgets reject unknown prices, unknown consumed usage and excessive estimated charges',()=>{
 for(const budget of [{taskUsd:0.001},{sessionUsd:1},{monthUsd:1,monthSpentUsd:1}])assert.equal(routeModel('Explain',{...policy,budget}).selected,null);
 const decision=routeModel('Explain',{...policy,budget:{taskUsd:0.01,sessionUsd:1,sessionSpentUsd:0}});
 assert.equal(decision.selected.estimatedUsd,0.002);assert.equal(decision.hardSpendingGuarantee,false);
 assert.equal(routeModel('Explain',{...policy,models:[model('unknown',90,null)],budget:{taskUsd:1}}).selected,null);
 const unknown=routeModel('Explain',{...policy,models:[model('unknown',90,null)]});assert.equal(unknown.selected.estimatedUsd,null);
});
test('invalid policy never silently becomes a provider request',()=>{
 for(const changes of [{mode:'invalid'},{models:[model('a',90,-1)]},{tokens:{input:Infinity,output:1}},{budget:{taskUsd:-1}},
 {mode:'custom',customModel:'missing'},{secret:'not-accepted'}])assert.throws(()=>validateRouting({...policy,...changes}),TypeError);
});

test('Auto favors reliable adequate candidates while Economy explicitly minimizes known estimated cost',()=>{
 const models=[{...model('cheap',90,1),reliability:0.2},{...model('reliable',90,2),reliability:0.95}];
 assert.equal(routeModel('Explain',{...policy,models}).selected.id,'reliable');
 assert.equal(routeModel('Explain',{...policy,models,mode:'economy'}).selected.id,'cheap');
 assert.throws(()=>routeModel('',{...policy,complexity:'simple'}),/Invalid routing request/);
});
