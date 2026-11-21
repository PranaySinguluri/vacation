'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3);
const mod={exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports;
const handlers={};
const app={innerHTML:'',addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);},contains:()=>true};
const inputs={'place-name':{value:''},'place-link':{value:''},'place-note':{value:''},'place-date':{value:''},'place-time':{value:''}};
const errorSlot={textContent:'',hidden:true};
const document={
  getElementById:id=>id==='app'?app:inputs[id]||null,
  querySelector:()=>null,querySelectorAll:()=>[],activeElement:null
};
const window={confirm:()=>true};window.top=window.self=window;
const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
let fetchCalls=0;
const noNetwork=()=>{fetchCalls++;return new Promise(()=>{});};
const src=scripts[2].replace(/\}\)\(\);\s*$/, 'return {act,render,cityTab,data,ui,locationEntry,mapURL,locLine};})();');
assert.notEqual(src,scripts[2],'test hook');
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,
  navigator:{},fetch:noNetwork,Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,console,
  setTimeout:()=>0,clearTimeout:()=>{}});
let passed=0;
function test(name,fn){try{fn();passed++;}catch(err){err.message='['+name+'] '+err.message;throw err;}}
function start(){
  h.ui.tab='lv';
  h.ui.adding=true;
  h.ui.editing=null;
  h.render();
  inputs['place-name'].value='';
  inputs['place-link'].value='';
  errorSlot.hidden=true;
  errorSlot.textContent='';
}
function submit(name,address){
  inputs['place-name'].value=name;
  inputs['place-link'].value=address;
  const form={id:'place-form',classList:{contains:()=>false},dataset:{},
    querySelector:sel=>sel==='[data-err]'?errorSlot:null,querySelectorAll:()=>[]};
  const ev={target:form,preventDefault(){}};
  for (const fn of handlers.submit||[]) fn(ev);
}
test('Add stop form has no broken search box',()=>{
  start();
  const form=h.cityTab(h.ui.tab==='lv'?h.CITIES?.[2]||{id:'lv',name:'Las Vegas'}:{id:'lv',name:'Las Vegas'});
  assert.ok(form.includes('id="place-form"'));
  const inputForm=form.split('id="place-form"')[1].split('</form>')[0];
  assert.ok(inputForm.includes('id="place-name"'));
  assert.ok(inputForm.includes('id="place-link"'));
  assert.ok(!inputForm.includes('Search places'));
  assert.ok(!inputForm.includes('place-suggest'));
  assert.ok(!inputForm.includes('search-exact'));
  assert.ok(inputForm.includes('Add stop'));
});
test('address only can be saved without a geocoder response',()=>{
  start();
  const count=h.data.places.length;
  submit('','723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.equal(errorSlot.textContent,'');
  assert.equal(h.data.places.length,count+1);
  const p=h.data.places.at(-1);
  assert.equal(p.name,'723 S Casino Center Blvd');
  assert.equal(p.q,'723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.equal(p.lat,null);
  assert.ok(h.mapURL(p).includes('723%20S%20Casino%20Center'));
  assert.equal(h.ui.adding,false);
});
test('name and address both save correctly without autocomplete',()=>{
  start();
  const count=h.data.places.length;
  submit('GoCar Tours','723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.equal(h.data.places.length,count+1);
  const p=h.data.places.at(-1);
  assert.equal(p.name,'GoCar Tours');
  assert.equal(p.q,'723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.match(h.locLine(p),/Address: 723 S Casino Center Blvd/);
});
test('street address entered in the name field alone also saves address',()=>{
  start();const count=h.data.places.length;
  submit('724 S Casino Center Blvd','');
  assert.equal(h.data.places.length,count+1);
  const p=h.data.places.at(-1);
  assert.equal(p.q,'724 S Casino Center Blvd, Las Vegas');
  assert.equal(p.pin,false);
});
test('unrelated URL is rejected without saving',()=>{
  start();const count=h.data.places.length;
  submit('Bad link','https://invalid.example/path');
  assert.equal(h.data.places.length,count);
  assert.match(errorSlot.textContent,/valid street address/);
});
test('duplicate named stop is rejected',()=>{
  start();const count=h.data.places.length;
  submit('GoCar Tours','723 S Casino Center Blvd, Las Vegas, NV 89101');
  assert.equal(h.data.places.length,count);
  assert.match(errorSlot.textContent,/already on the list/);
});
test('typing a name cannot trigger hidden search fetches',()=>{
  start();
  const count=fetchCalls;
  for(const fn of handlers.input||[])fn({target:{id:'place-name',value:'GoCar Tours'}});
  assert.equal(fetchCalls,count);
});
console.log('PASS '+passed+' direct add-stop regression scenarios');
