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
const app={innerHTML:'',addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);},contains:()=>true};
const nameInput={id:'place-name',value:'Go cars',setAttribute(){},removeAttribute(){}};
const suggestion={innerHTML:'',hidden:true};
const status={textContent:''};
const googleLink={href:''};
const googleWrap={hidden:true};
const dom={'app':app,'place-name':nameInput,'place-suggest':suggestion,'search-status':status,'search-google-link':googleLink,'search-google-fallback':googleWrap};
const document={getElementById:id=>dom[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const window={confirm:()=>true};window.top=window.self=window;
const storage={getItem:()=>null,setItem(){},removeItem(){}};
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const calls=[];
let photonFailures=1,photonEmpty=0;
const fetchMock=async function(url){
  calls.push(url);
  if(url.includes('photon.komoot.io')){
    if(photonFailures-->0) throw Error('Search service temporarily unavailable');
    if(photonEmpty-->0) return {ok:true,json:async()=>({features:[]})};
    return {ok:true,json:async()=>({features:[
      {properties:{name:'GoCar Tours',city:'Las Vegas',state:'Nevada'},geometry:{coordinates:[-115.12,36.15]}},
      {properties:{name:'Bad coordinates'},geometry:{coordinates:[999,999]}}
    ]})};
  }
  throw Error('Unexpected external API '+url);
};
const src=scripts[2].replace(/\}\)\(\);\s*$/, "return {runSearch,searchExactName,searchMapsHref,ui,getResults:()=>results};})();");
assert.notEqual(src,scripts[2],'Search test hook inserted');
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,
  navigator:{},fetch:fetchMock,Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,AbortController,
  console,setTimeout:()=>1,clearTimeout:()=>{}});
async function run(){
  h.ui.tab='lv';h.ui.adding=true;
  // A failed Photon request exposes a Google Maps search that includes the typed city.
  await h.runSearch('Go cars');
  assert.match(status.textContent,/temporarily unavailable/);
  assert.equal(suggestion.hidden,true);
  assert.equal(googleWrap.hidden,false);
  assert.match(googleLink.href,/Go%20cars/);
  assert.match(googleLink.href,/Las%20Vegas/);
  // A retry still uses Photon; success hides the Google Maps fallback.
  await h.runSearch('Go cars');
  assert.equal(suggestion.hidden,false);
  assert.match(suggestion.innerHTML,/GoCar Tours/);
  assert.equal(h.getResults().length,1,'invalid coordinates excluded');
  assert.equal(googleWrap.hidden,true);
  assert.equal(calls.filter(u=>u.includes('photon.komoot.io')).length,2);
  assert.ok(!html.includes('searchDown = true'),'no sticky outage flag');
  // The explicit Search button also uses Photon. No Nominatim required.
  nameInput.value='GoCar';
  photonEmpty=1;
  await h.searchExactName();
  assert.match(status.textContent,/Photon found no matches/);
  assert.equal(googleWrap.hidden,false);
  assert.match(googleLink.href,/GoCar/);
  await h.searchExactName();
  assert.match(suggestion.innerHTML,/GoCar Tours/);
  assert.equal(googleWrap.hidden,true);
  assert.equal(calls.filter(u=>u.includes('photon.komoot.io')).length,4);
  assert.equal(calls.filter(u=>u.includes('nominatim.openstreetmap.org')).length,0);
  // Changing the search text hides stale fallback; link updates to new query.
  nameInput.value='Go cars';
  for(const fn of handlers.input||[])fn({target:nameInput});
  assert.equal(googleWrap.hidden,true);
  assert.match(googleLink.href,/Go%20cars/);
  assert.match(googleLink.href,/Las%20Vegas/);
  // Too-short queries don't trigger the network or show the fallback.
  const count=calls.length;
  await h.runSearch('Go');
  assert.equal(calls.length,count);
  assert.equal(googleWrap.hidden,true);
  assert.match(status.textContent,/at least 3 letters/);
  console.log('PASS Photon-first search, fallback visibility, retry, explicit Search and link query checks');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
