'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const mod={exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports;
const app={innerHTML:'',addEventListener(){},contains(){return true;}};
const document={getElementById:id=>id==='app'?app:null,querySelector(){return null;},querySelectorAll(){return [];},activeElement:null};
const window={confirm(){return true;}};window.top=window.self=window;
const storage={getItem(){return null;},setItem(){},removeItem(){}};
const loc={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const src=scripts[2].replace(/\}\)\(\);\s*$/,'return {safeMapsLink,locationEntry,applyLocation,locLine,mapURL,searchText,cleanPlace};})();');
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location:loc,
  navigator:{},fetch:()=>new Promise(()=>{}),Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,
  console,setTimeout:()=>0,clearTimeout:()=>{}});
let total=0;
function test(name,fn){try{fn();total++;}catch(e){e.message='['+name+'] '+e.message;throw e;}}
const address='723 S Casino Center Blvd, Las Vegas, NV 89101';
const link='https://maps.app.goo.gl/wshd9nGtnU4hvwNg9';
test('specific GoCar Tours address accepted even without coordinates',()=>{
  const parsed=h.locationEntry(address,'lv');
  assert.equal(parsed.kind,'address');
  assert.equal(parsed.q,address);
  assert.equal(parsed.lat,undefined);
});
test('partial address automatically includes destination city',()=>{
  const parsed=h.locationEntry('723 S Casino Center Blvd','lv');
  assert.equal(parsed.q,'723 S Casino Center Blvd, Las Vegas');
});
test('shortened Google Maps URL is accepted as external link',()=>{
  const parsed=h.locationEntry(link,'lv');
  assert.equal(parsed.kind,'mapslink');
  assert.equal(parsed.mapLink,link);
});
test('Google Maps short link does not invent coordinates',()=>{
  const p={id:'gocar',name:'Gocars tours',city:'lv',lat:null,lng:null,q:''};
  h.applyLocation(p,h.locationEntry(link,'lv'));
  assert.equal(p.lat,null);
  assert.equal(p.lng,null);
  assert.equal(h.mapURL(p),link);
  assert.match(h.locLine(p),/Google Maps link saved/);
  assert.match(h.locLine(p),/No GPS pin yet/);
});
test('street address appears as saved and opens correct Google Maps search',()=>{
  const p={id:'gocar',name:'Gocars tours',city:'lv',lat:null,lng:null,q:''};
  h.applyLocation(p,h.locationEntry(address,'lv'));
  assert.equal(p.geo,'none');
  assert.equal(p.q,address);
  assert.match(h.locLine(p),/Address saved for Google Maps directions/);
  const url=new URL(h.mapURL(p));
  assert.equal(url.hostname,'www.google.com');
  assert.equal(url.searchParams.get('query'),address);
});
test('replace Google Maps link with address clears stale link',()=>{
  const p={name:'GoCar',city:'lv'};
  h.applyLocation(p,h.locationEntry(link,'lv'));
  h.applyLocation(p,h.locationEntry(address,'lv'));
  assert.equal(p.mapLink,undefined);
  assert.equal(p.q,address);
});
test('valid coordinates create pin and clear previous share URL',()=>{
  const p={name:'GoCar',city:'lv',q:address};
  h.applyLocation(p,h.locationEntry(link,'lv'));
  h.applyLocation(p,h.locationEntry('36.1, -115.2','lv'));
  assert.equal(p.pin,true);
  assert.equal(p.lat,36.1);
  assert.equal(p.lng,-115.2);
  assert.equal(p.mapLink,undefined);
  assert.equal(h.locLine(p),'');
});
test('malicious URI schemes and unrelated URLs are refused',()=>{
  for (const v of ['javascript:alert(1)','https://evil.example/','http://maps.app.goo.gl/fake',
                   'https://maps.app.goo.gl.evil.example/foo','']) {
    assert.equal(h.locationEntry(v,'lv'),null,'Unsafe input accepted: '+v);
  }
});
test('invalid map URL is not emitted when imported',()=>{
  const cleaned=h.cleanPlace({id:'x',city:'lv',name:'GoCar',q:address,mapLink:'javascript:alert(1)'});
  assert.equal(cleaned.mapLink,'');
  assert.equal(cleaned.q,address);
});
test('forms explicitly support addresses and short Google Maps links',()=>{
  assert.match(html,/Street address, Google Maps link, or coordinates/);
  assert.match(html,/applyLocation\(target, entry\)/);
  assert.ok(!html.includes('No location found in that. Use the full link'));
});
console.log('PASS '+total+' location-input regression checks');
