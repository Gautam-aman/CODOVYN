/** Public distribution policy. No credential lookup or signing on import. */
export const alphaVersion='0.1.0-alpha';
const unsafe=new Set(['com.apple.security.get-task-allow','com.apple.security.cs.allow-dyld-environment-variables','com.apple.security.cs.disable-executable-page-protection']);
export function hardenedEntitlements(original,{node=false}={}){
 if(node)return {'com.apple.security.cs.allow-jit':true};
 return Object.fromEntries(Object.entries(original).filter(([key])=>!unsafe.has(key)));
}
export function signingArguments(args){
 const values={},flags=new Set();for(let i=0;i<args.length;i++){const key=args[i];if(['--authorize-signing','--authorize-notarization'].includes(key)){if(flags.has(key))throw new Error('Duplicate authorization');flags.add(key);}else if(['--identity','--team','--notary-profile'].includes(key)&&!values[key]&&args[i+1])values[key]=args[++i];else throw new Error('Unsupported distribution argument');}
 if(!flags.has('--authorize-signing')||!flags.has('--authorize-notarization'))throw new Error('Explicit owner signing and notarization authorization required');
 if(!/^[a-fA-F0-9]{40}$/.test(values['--identity']||'')||!/^[A-Z0-9]{10}$/.test(values['--team']||'')||!/^[a-zA-Z0-9_-]{1,80}$/.test(values['--notary-profile']||''))throw new Error('Valid identity fingerprint, team and existing notary profile required; never supply secrets in arguments');
 return {identity:values['--identity'],team:values['--team'],profile:values['--notary-profile']};
}
export function assertPublicEvidence(e){
 if(e.version!==alphaVersion||e.sourceDirty!==false||!e.signatureValid||!e.developerId||!e.hardenedRuntime||!e.noDebugEntitlements||!e.appStapled||!e.dmgStapled||!e.gatekeeperAccepted||!e.imageValid)throw new Error('Public alpha distribution gates have not passed');
 return true;
}
export function entitlementPlist(value){return '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'+Object.entries(value).map(([key,v])=>{if(!/^[a-zA-Z0-9.-]+$/.test(key)||typeof v!=='boolean')throw new Error('Unsupported entitlement value');return '<key>'+key+'</key><'+String(v)+'/>';}).join('')+'</dict></plist>';}
