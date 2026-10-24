import{readFile}from'node:fs/promises';import{verifyJavaProject}from'./lib/live-java-oracle.js';
const[manifestPath,mode='baseline',project]=process.argv.slice(2);if(!manifestPath)throw new Error('Usage: node scripts/verify-live-java.js <baseline.json> [baseline|division|task-service|subtract] [draft-project]');
const report=await verifyJavaProject(JSON.parse(await readFile(manifestPath,'utf8')),{mode,...(project?{project}:{})});console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:1;
