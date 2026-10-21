const modes=['auto','economy','balanced','performance','custom'];
const providers=['codex','gemini','claude'];
const number=(value)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value);
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export function classifyTask(request) {
 if(typeof request!=='string'||!request.trim()||request.length>10000)throw new TypeError('Invalid routing request');
 if(/\b(security|concurrency|race condition|distributed|architecture|deadlock|cryptograph)/i.test(request))return 'complex';
 if(/\b(implement|debug|refactor|endpoint|component|fix|test)/i.test(request))return 'moderate';
 return 'simple';
}
export function validateRouting(input) {
 if(!exactKeys(input,['mode','models','requiredCapabilities','reasoning','preferredProviders','customModel','complexity','tokens','budget','allowUnknownAvailability'])||
   !modes.includes(input.mode)||!Array.isArray(input.models)||!input.models.length||input.models.length>64)throw new TypeError('Invalid routing configuration');
 const ids=new Set();
 for(const model of input.models) {
  if(!exactKeys(model,['id','provider','model','capabilities','reasoning','quality','reliability','availability','price'])||
    !identifier(model.id)||ids.has(model.id)||!providers.includes(model.provider)||!identifier(model.model)||
    !Array.isArray(model.capabilities)||model.capabilities.some(c=>!['streaming','tools','writes'].includes(c))||
    !Array.isArray(model.reasoning)||model.reasoning.some(r=>!identifier(r))||
    !number(model.quality)||model.quality>100||!number(model.reliability)||model.reliability>1||
    !['available','unavailable','unknown'].includes(model.availability))throw new TypeError('Invalid routing model');
  ids.add(model.id);
  if(model.price!==null&&(!exactKeys(model.price,['inputPerMillionUsd','outputPerMillionUsd','source'])||
    !number(model.price.inputPerMillionUsd)||!number(model.price.outputPerMillionUsd)||
    typeof model.price.source!=='string'||!model.price.source.trim()||model.price.source.length>200))throw new TypeError('Invalid model price');
 }
 if(input.complexity!==undefined&&!['simple','moderate','complex'].includes(input.complexity))throw new TypeError('Invalid task complexity');
 if(input.reasoning!==undefined&&!identifier(input.reasoning))throw new TypeError('Invalid reasoning setting');
 if(input.requiredCapabilities!==undefined&&(!Array.isArray(input.requiredCapabilities)||input.requiredCapabilities.some(c=>!['streaming','tools','writes'].includes(c))))throw new TypeError('Invalid required capabilities');
 if(input.preferredProviders!==undefined&&(!Array.isArray(input.preferredProviders)||input.preferredProviders.some(p=>!providers.includes(p))))throw new TypeError('Invalid provider preference');
 if(input.allowUnknownAvailability!==undefined&&typeof input.allowUnknownAvailability!=='boolean')throw new TypeError('Invalid availability policy');
 if(input.mode==='custom'&&(!identifier(input.customModel)||!ids.has(input.customModel)))throw new TypeError('Choose a custom model');
 if(input.tokens!==undefined&&(!exactKeys(input.tokens,['input','output'])||!Number.isSafeInteger(input.tokens.input)||input.tokens.input<0||!Number.isSafeInteger(input.tokens.output)||input.tokens.output<0||input.tokens.input+input.tokens.output>10000000))throw new TypeError('Invalid token estimate');
 if(input.budget!==undefined&&(!exactKeys(input.budget,['taskUsd','sessionUsd','monthUsd','sessionSpentUsd','monthSpentUsd'])||Object.values(input.budget).some(v=>v!==null&&!number(v))))throw new TypeError('Invalid routing budget');
 return structuredClone(input);
}
export function routeModel(request,input) {
 const inferred=classifyTask(request);
 const policy=validateRouting(input),complexity=policy.complexity||inferred;
 // Classification and user catalogue scores are policy inputs, not measured model benchmarks.
 const minimum={simple:0,moderate:50,complex:80}[complexity];
 const considered=policy.models.map(model=>{
  const reasons=[];
  if(model.availability==='unavailable'||(model.availability==='unknown'&&!policy.allowUnknownAvailability))reasons.push('availability-not-confirmed');
  if((policy.requiredCapabilities||[]).some(c=>!model.capabilities.includes(c)))reasons.push('missing-capability');
  if(policy.reasoning&&!model.reasoning.includes(policy.reasoning))reasons.push('unsupported-reasoning');
  if(model.quality<minimum)reasons.push('below-task-quality-policy');
  if(policy.mode==='custom'&&model.id!==policy.customModel)reasons.push('not-custom-selection');
  const estimatedUsd=model.price&&policy.tokens?(policy.tokens.input*model.price.inputPerMillionUsd+policy.tokens.output*model.price.outputPerMillionUsd)/1000000:null;
  const cost=number(estimatedUsd)?estimatedUsd:null;
  for(const [limitKey,spentKey] of [['taskUsd',null],['sessionUsd','sessionSpentUsd'],['monthUsd','monthSpentUsd']]) {
   const limit=policy.budget?.[limitKey];if(limit===undefined||limit===null)continue;
   const spent=spentKey?policy.budget[spentKey]:0;
   if(cost===null||!number(spent))reasons.push(`${limitKey}-unobservable`);
   else if(cost+spent>limit)reasons.push(`${limitKey}-exceeded`);
  }
  return {id:model.id,provider:model.provider,model:model.model,quality:model.quality,reliability:model.reliability,
    availability:model.availability,reasoning:policy.reasoning||null,estimatedUsd:cost,
    priceSource:model.price?.source||null,reasons};
 });
 const eligible=considered.filter(c=>!c.reasons.length);
 const preference=c=>{const i=(policy.preferredProviders||[]).indexOf(c.provider);return i<0?100:i;};
 const cost=c=>c.estimatedUsd===null?Infinity:c.estimatedUsd;
 eligible.sort((a,b)=>{
  let difference=0;
  if(policy.mode==='economy')difference=cost(a)-cost(b);
  if(policy.mode==='auto')difference=b.reliability-a.reliability||cost(a)-cost(b);
  if(policy.mode==='performance')difference=b.quality-a.quality||b.reliability-a.reliability;
  if(policy.mode==='balanced')difference=Math.abs(a.quality-80)-Math.abs(b.quality-80)||b.reliability-a.reliability;
  return (Number.isNaN(difference)?0:difference)||preference(a)-preference(b)||cost(a)-cost(b)||b.quality-a.quality||a.id.localeCompare(b.id,'en');
 });
 const selected=eligible[0]||null;
 return {schemaVersion:1,mode:policy.mode,complexity,selected,considered,
  explanation:selected?`${policy.mode}: selected ${selected.id} from ${eligible.length} eligible candidates for ${complexity} work`:'No eligible model; no provider request authorized',
  budgetEnforcement:'admission-estimate-only',hardSpendingGuarantee:false,
  usage:'unknown',warning:'Prices, quality and availability are supplied catalogue evidence. CLI runtime spending and quota may be unavailable; estimates are not provider-reported charges.'};
}
