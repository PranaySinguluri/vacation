'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const mod={exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports;
const handlers={};
const app={innerHTML:'',contains:()=>true,addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);}};
const inputs={
  'place-name':{value:'',setAttribute(){},removeAttribute(){}},
  'place-link':{value:''},
  'place-note':{value:''},'place-date':{value:''},'place-time':{value:''},
  'map-link-preview':{hidden:true},
  'map-link-status':{textContent:''},
  'map-link-open':{href:'',hidden:true},
  'search-status':{textContent:''},
  'place-suggest':{hidden:true,innerHTML:''},
  'search-google-link':{href:''}
};
const document={getElementById:id=>id==='app'?app:inputs[id]||null,querySelector:()=>null,
  querySelectorAll:()=>[],activeElement:null};
const window={confirm:()=>true};window.top=window.self=window;
const storage={getItem:()=>null,setItem(){},removeItem(){}};
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
let networkCalls=0;
const fetchMock=()=>{networkCalls++;return new Promise(()=>{});};
const src=scripts[2].replace(/\}\)\(\);\s*$/,
  'return {safeMapsLink,googleMapsDetails,explicitGoogleCoords,locationEntry,applyLocation,previewGoogleLink,ui,data,cityTab,mapURL,runSearch};})();');
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,
  navigator:{},fetch:fetchMock,Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,
  AbortController,console,setTimeout:()=>1,clearTimeout:()=>{}});
const full='https://www.google.com/maps/place/GoCar+Tours/@36.172,-115.149,17z/data=!4m6!3m5!1sabc!8m2!3d36.1645!4d-115.1456';
const fullAddress='https://www.google.com/maps/search/?api=1&query=723%20S%20Casino%20Center%20Blvd%2C%20Las%20Vegas%2C%20NV%2089101';
const short='https://maps.app.goo.gl/wshd9nGtnU4hvwNg9';
let passed=0;
function test(name,fn){try{fn();passed++;}catch(err){err.message='['+name+'] '+err.message;throw err;}}
h.ui.tab='lv';h.ui.adding=true;
test('full Google Maps place link extracts display name and selected coordinates',()=>{
  const info=h.googleMapsDetails(full);
  assert.equal(info.name,'GoCar Tours');
  assert.equal(info.coords.lat,36.1645);
  assert.equal(info.coords.lng,-115.1456);
  const entry=h.locationEntry(full,'lv');
  assert.equal(entry.kind,'mapslink');
  const p={id:'gocar',name:'GoCar Tours',city:'lv'};
  h.applyLocation(p,entry);
  assert.equal(p.pin,true);assert.equal(p.lat,36.1645);
  assert.equal(h.mapURL(p),full);
});
test('full Google Maps address link extracts and retains the entire address',()=>{
  const info=h.googleMapsDetails(fullAddress);
  assert.equal(info.name,'723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.equal(info.coords,null);
  const entry=h.locationEntry(fullAddress,'lv');
  assert.equal(entry.kind,'mapslink');
  assert.equal(entry.q,'723 S Casino Center Blvd, Las Vegas, NV 89101');
});
test('Google Maps query coordinates are handled as a precise location',()=>{
  const entry=h.locationEntry('https://www.google.com/maps/search/?api=1&query=36.17%2C-115.14','lv');
  assert.equal(entry.coords.lat,36.17);
  assert.equal(entry.coords.lng,-115.14);
});
test('map viewport coordinates are not treated as precise place pin',()=>{
  const entry=h.locationEntry('https://www.google.com/maps/place/GoCar+Tours/@36.11,-115.22,17z','lv');
  assert.equal(entry.kind,'mapslink');
  assert.equal(entry.coords,null);
  const p={name:'GoCar',city:'lv'};
  h.applyLocation(p,entry);
  assert.equal(p.pin,false);
});
test('short share links are accepted but are not falsely expanded',()=>{
  const info=h.googleMapsDetails(short);
  assert.equal(info.name,'');
  assert.equal(info.coords,null);
  assert.equal(info.short,true);
  assert.equal(h.locationEntry(short,'lv').mapLink,short);
});
test('unsafe or unrelated URLs cannot be saved',()=>{
  for(const bad of ['javascript:alert(1)','https://maps.app.goo.gl.bad.example/x',
    'https://example.com/maps/place/Foo/@36,-115','http://www.google.com/maps/place/x']){
    assert.equal(h.locationEntry(bad,'lv'),null,bad);
  }
});
test('full Google Maps link auto-fills an empty place name on paste',()=>{
  inputs['place-name'].value='';
  inputs['place-link'].value=full;
  const old=networkCalls;
  for(const fn of handlers.input||[])fn({target:{id:'place-link'}});
  assert.equal(inputs['place-name'].value,'GoCar Tours');
  assert.equal(inputs['map-link-preview'].hidden,false);
  assert.equal(inputs['map-link-open'].hidden,false);
  assert.equal(inputs['map-link-open'].href,full);
  assert.match(inputs['map-link-status'].textContent,/coordinates found/);
  assert.equal(networkCalls,old);
});
test('pasting a URL does not overwrite an existing name',()=>{
  inputs['place-name'].value='My GoCar outing';
  inputs['place-link'].value=fullAddress;
  h.previewGoogleLink();
  assert.equal(inputs['place-name'].value,'My GoCar outing');
  assert.equal(inputs['map-link-open'].href,fullAddress);
  assert.match(inputs['map-link-status'].textContent,/recognized/);
});
test('short link says name needs manual entry',()=>{
  inputs['place-name'].value='';inputs['place-link'].value=short;
  h.previewGoogleLink();
  assert.equal(inputs['place-name'].value,'');
  assert.match(inputs['map-link-status'].textContent,/Enter the place name yourself/);
  assert.equal(inputs['map-link-open'].href,short);
});
test('pasting a street address gives a Google Maps preview link',()=>{
  inputs['place-link'].value='723 S Casino Center Blvd, Las Vegas, NV 89101';
  h.previewGoogleLink();
  assert.match(inputs['map-link-status'].textContent,/Address ready/);
  const u=new URL(inputs['map-link-open'].href);
  assert.equal(u.searchParams.get('query'),'723 S Casino Center Blvd, Las Vegas, NV 89101');
});
test('clearing the fallback field hides the map preview',()=>{
  inputs['place-link'].value='';
  h.previewGoogleLink();
  assert.equal(inputs['map-link-preview'].hidden,true);
});
test('Add stop includes restored autocomplete and visible fallback input',()=>{
  const form=h.cityTab({id:'lv',name:'Las Vegas'});
  const fields=form.split('id="place-form"')[1].split('</form>')[0];
  assert.match(fields,/place-suggest/);
  assert.match(fields,/Find places/);
  assert.match(fields,/id="place-link"/);
  assert.match(fields,/Open location in Google Maps/);
  assert.match(fields,/Add stop/);
});
console.log('PASS '+passed+' Google Maps link autofill and search regression checks');
