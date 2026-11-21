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
const inp={id:'place-name',value:'',setAttribute(){},removeAttribute(){}};
const suggestion={innerHTML:'',hidden:true};
const status={textContent:''};
const mapLink={href:''};
const els={'app':app,'place-name':inp,'place-suggest':suggestion,'search-status':status,'search-google-link':mapLink};
const document={getElementById:id=>els[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const window={confirm:()=>true};window.top=window.self=window;
const storage={getItem:()=>null,setItem(){},removeItem(){}};
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
let fetchError=false,callCount=0;
const fetchMock=async url=>{
  callCount++;
  if(fetchError) throw Error('Photon temporary outage');
  return {ok:true,json:async()=>({features:[]})};
};
const src=scripts[2].replace(/\}\)\(\);\s*$/,
  'return {ui,data,typedAddress,showSuggest,runSearch,pickTypedAddress,locLine,labelOf,cityPlaces};})();');
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,navigator:{},
  fetch:fetchMock,Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,AbortController,console,
  setTimeout:()=>0,clearTimeout:()=>{}});
let passed=0;
async function test(name,fn){try{await fn();passed++;}catch(e){e.message='['+name+'] '+e.message;throw e;}}
function type(q){
  inp.value=q;
  for(const fn of handlers.input||[]) fn({target:inp});
}
async function run(){
  h.ui.tab='lv'; h.ui.adding=true;
  await test('house number alone does not claim a full address',()=>{
    type('723');assert.equal(h.typedAddress(),null);assert.equal(suggestion.hidden,true);
  });
  await test('street address appears instantly before any network response',()=>{
    const before=callCount;
    type('723 S Casino Center Blvd');
    assert.equal(callCount,before);
    assert.equal(suggestion.hidden,false);
    assert.match(suggestion.innerHTML,/723 S Casino Center Blvd, Las Vegas/);
    assert.match(suggestion.innerHTML,/data-act="pick-address"/);
    assert.match(suggestion.innerHTML,/not verified in map data/);
  });
  await test('complete address renders without duplicate city',()=>{
    type('723 S Casino Center Blvd, Las Vegas, NV 89101');
    const visible=suggestion.innerHTML;
    assert.ok(visible.includes('723 S Casino Center Blvd, Las Vegas, NV 89101'));
    assert.ok(!visible.includes('Las Vegas, NV 89101, Las Vegas'));
  });
  await test('provider labels house number and street when searching by address',()=>{
    const result=h.labelOf({properties:{name:'GoCar Tours',housenumber:'723',street:'S Casino Center Blvd',city:'Las Vegas',state:'Nevada'}},'723 S Casino');
    assert.equal(result.name,'723 S Casino Center Blvd');
    assert.ok(result.where.includes('GoCar Tours'));
  });
  await test('a failed online search keeps typed address available',async()=>{
    fetchError=true;
    await h.runSearch('723 S Casino Center Blvd, Las Vegas, NV 89101');
    assert.equal(suggestion.hidden,false);
    assert.match(suggestion.innerHTML,/data-act="pick-address"/);
    assert.match(status.textContent,/Photon is temporarily unavailable/);
  });
  await test('clicking typed address creates stop with correct Google Maps address',()=>{
    const count=h.data.places.length;
    h.pickTypedAddress();
    assert.equal(h.data.places.length,count+1);
    const p=h.data.places.at(-1);
    assert.equal(p.city,'lv');
    assert.equal(p.q,'723 S Casino Center Blvd, Las Vegas, NV 89101');
    assert.equal(p.lat,null);
    assert.equal(p.lng,null);
    assert.equal(p.pin,false);
    assert.equal(p.geo,'none');
    assert.ok(!h.ui.adding);
    assert.match(h.locLine(p),/Address: 723 S Casino Center Blvd/);
  });
  await test('duplicate typed address does not create duplicate stop',()=>{
    h.ui.adding=true;
    type('723 S Casino Center Blvd, Las Vegas, NV 89101');
    const count=h.data.places.length;
    h.pickTypedAddress();
    assert.equal(h.data.places.length,count);
    assert.match(status.textContent,/already a stop/);
  });
  await test('names without a street number remain normal place searches',()=>{
    type('GoCar Tours');
    assert.equal(h.typedAddress(),null);
    assert.equal(suggestion.hidden,true);
  });
  await test('unsafe markup is not displayed as HTML',()=>{
    type("723 S Casino Center Blvd <img src=x onerror=alert(1)>");
    assert.equal(h.typedAddress(),null);
    assert.ok(!suggestion.innerHTML.includes('<img'));
  });
  console.log('PASS '+passed+' direct-address autocomplete regression scenarios');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
