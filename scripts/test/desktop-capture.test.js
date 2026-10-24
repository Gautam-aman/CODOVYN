import test from 'node:test';import assert from 'node:assert/strict';import{desktopDebugPort,desktopWindowTarget,captureDesktopWindow}from'../lib/desktop-capture.js';
test('native capture selects only the unique CODOVYN workbench and never a browser or entire display',async()=>{
 const target={type:'page',url:'vscode-file://vscode-app/workbench.html',title:'project — CODOVYN'};
 assert.equal(desktopWindowTarget([target,{type:'page',url:'https://private.invalid',title:'Private browser'}]),target);
 assert.throws(()=>desktopWindowTarget([{type:'page',url:'https://private.invalid',title:'CODOVYN'}]));assert.throws(()=>desktopWindowTarget([target,target]));assert.throws(()=>desktopWindowTarget(Array(129).fill(target)));
 const port=await desktopDebugPort();assert.ok(port>=1024&&port<=65535);await assert.rejects(captureDesktopWindow(0),/port/);
});
