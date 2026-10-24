import {createJavaValidationProject} from './lib/live-validation-project.js';
const manifest=await createJavaValidationProject();console.log(JSON.stringify(manifest,null,2));
