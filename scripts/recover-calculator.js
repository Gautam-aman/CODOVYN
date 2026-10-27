import{recoverCalculator}from'./lib/recover-calculator.js';
if(process.argv.length!==4)throw new Error('Usage: node scripts/recover-calculator.js surviving-fixture new-empty-destination');
try{console.log(JSON.stringify(recoverCalculator({source:process.argv[2],target:process.argv[3]}),null,2));}catch{console.error('Calculator recovery failed. No existing destination is overwritten; inspect the surviving objects and exclusive destination.');process.exitCode=1;}
