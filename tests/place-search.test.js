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
const dom={'app':app,'place-name':nameInput,'place-suggest':suggestion,'search-status':status,'search-google-link':googleLink};
const document={getElementById:id=>dom[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const window={confirm:()=>true};window.top=window.self=window;
const storage={getItem:()=>null,setItem(){},removeItem(){}};
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const calls=[];
let photonFailures=1,manualFailures=0;
const fetchMock=async function(url){
  calls.push(url);
  if(url.includes('photon.komoot.io')){
    if(photonFailures-->0) throw Error('Search service temporarily unavailable');
    return {ok:true,json:async()=>({features:[
      {properties:{name:'GoCar Tours',city:'Las Vegas',state:'Nevada'},geometry:{coordinates:[-115.12,36.15]}},
      {properties:{name:'Bad coordinates'},geometry:{coordinates:[999,999]}}
    ]})};
  }
  if(url.includes('nominatim.openstreetmap.org')){
    if(manualFailures-->0) throw Error('Manual lookup temporarily unavailable');
    return {ok:true,json:async()=>[{name:'GoCar Tours',display_name:'GoCar Tours, Las Vegas, Nevada',lat:'36.15',lon:'-115.12'}]};
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
  // A single Photon error must not disable every future query.
  await h.runSearch('Go cars');
  assert.match(status.textContent,/temporarily unavailable/);
  assert.equal(suggestion.hidden,true);
  await h.runSearch('Go cars');
  assert.equal(suggestion.hidden,false);
  assert.match(suggestion.innerHTML,/GoCar Tours/);
  assert.equal(h.getResults().length,1,'invalid coordinates excluded');
  assert.equal(calls.filter(u=>u.includes('photon.komoot.io')).length,2,'second request really retried');
  assert.ok(!html.includes('searchDown = true'),'no sticky outage flag');
  // Explicit lookup uses separate service; not requested on every keypress.
  nameInput.value='GoCar';
  photonFailures=1;
  await h.runSearch('GoCar');
  await h.searchExactName();
  assert.match(suggestion.innerHTML,/GoCar Tours/);
  assert.equal(calls.filter(u=>u.includes('nominatim.openstreetmap.org')).length,1);
  assert.ok(calls.find(u=>u.includes('nominatim.openstreetmap.org')).includes('Las%20Vegas'));
  // Google Maps link updates without an API call.
  nameInput.value='Go cars';
  for(const fn of handlers.input||[]) fn({target:nameInput});
  assert.match(googleLink.href,/google.com\/maps\/search/);
  assert.match(googleLink.href,/Go%20cars/);
  assert.match(googleLink.href,/Las%20Vegas/);
  // Clearing input should not produce network requests.
  const count=calls.length;
  await h.runSearch('Go');
  assert.equal(calls.length,count);
  assert.match(status.textContent,/at least 3 letters/);
  console.log('PASS 8 place-search regression checks (failure recovery, exact lookup, Google Maps fallback, coordinate validation, short query)');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
