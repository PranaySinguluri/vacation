'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.equal(scripts.length,3);
const mod={exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports, local={}, handlers={};
const app={innerHTML:'',contains:()=>true,addEventListener:(name,fn)=>(handlers[name]||=[]).push(fn)};
const fields={};
const document={getElementById:id=>id==='app'?app:fields[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const storage={getItem:key=>local[key]??null,setItem:(key,value)=>{local[key]=String(value);},removeItem:key=>{delete local[key];}};
const window={confirm:()=>true};window.top=window.self=window;
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const hook='return {ui,flightFor,flightLeg,flightPanel,flightOCRCandidates,flightCanEdit,'+
 'airportLocalLabel,flightTrackingInfo,flightTrackingHTML,flightSegmentsHTML,act,CLOUD,onUser,render,'+
 'saveFlightFor,setMe:function(pid){me=pid},setFlights:function(value){flights=value}};})();';
const src=scripts[2].replace(/\}\)\(\);\s*$/,hook);
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,
 navigator:{},fetch:()=>new Promise(()=>{}),Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,
 AbortController,console,setTimeout:()=>0,clearTimeout:()=>{}});
const SAMPLE={arrival:{
 date:'2026-12-25',time:'09:45',arrivalDate:'2026-12-25',arrivalTime:'12:05',
 from:'Dallas (DFW)',to:'Phoenix (PHX)',airline:'American Airlines',flight:'AA 123',
 duration:'3h 20m',stops:'Nonstop'
},departure:{
 date:'2027-01-04',time:'16:30',arrivalDate:'2027-01-04',arrivalTime:'22:00',
 from:'Phoenix (PHX)',to:'New York (JFK)',airline:'American Airlines',
 flight:'AA 456',duration:'4h 30m',stops:'Nonstop'
}};
let count=0;
function test(name,fn){try{fn();count++}catch(e){e.message='['+name+'] '+e.message;throw e;}}
async function run(){
 test('public HTML does not contain real flight schedules or booking references',()=>{
  for(const privateToken of ['PRANAY_FLIGHT_DEFAULT','RAMYA_FLIGHT_DEFAULT',
   'AKSHAYA_FLIGHT_DEFAULT','DIVYA_FLIGHT_DEFAULT','HANEELA_FLIGHT_DEFAULT',
   'SAHITHI_FLIGHT_DEFAULT','KBBU7Y','F9 4655','AA 3853','WN 1282']){
    assert.ok(!html.includes(privateToken),'public source still contains '+privateToken);
  }
 });
 test('all seven traveler flight documents start blank without Firestore',()=>{
  for(const pid of ['A','D','H','M','P','R','S']){
   const x=h.flightFor(pid);
   assert.equal(x.arrival.date,'');
   assert.equal(x.departure.flight,'');
   assert.equal(x.arrival.segments.length,0);
  }
 });
 test('offline browser is not an authorized flight editor',()=>{
  h.ui.flightPerson='P';h.act('flight-edit',{});
  assert.equal(h.ui.flightEditing,false);
  assert.equal(h.flightCanEdit('P'),false);
 });
 test('unapproved auth and loading snapshots block all flight editors',()=>{
  h.CLOUD.on=true;h.CLOUD.state='pending';h.CLOUD.flightSync='loading';
  h.CLOUD.user={uid:'uid-p'};h.setMe('');
  assert.equal(h.flightCanEdit('P'),false);
  h.CLOUD.state='ready';h.CLOUD.flightSync='loading';h.setMe('P');
  assert.equal(h.flightCanEdit('P'),false);
 });
 test('approved traveler can edit only their own flight; owner can edit others',()=>{
  h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.flightSync='ready';
  h.CLOUD.user={uid:'uid-p'};h.CLOUD.person='P';h.CLOUD.admin=false;h.ui.admin=false;h.setMe('P');
  assert.equal(h.flightCanEdit('P'),true);
  assert.equal(h.flightCanEdit('A'),false);
  h.CLOUD.admin=true;
  assert.equal(h.flightCanEdit('A'),true);
  h.CLOUD.admin=false;
 });
 test('new flight data appears only from a private record, using local airport times',()=>{
  h.setFlights({P:SAMPLE});
  h.ui.flightPerson='P';
  const result=h.flightPanel();
  assert.match(result,/Arrival journey/);
  assert.match(result,/Return journey/);
  assert.match(result,/Dallas \(DFW\) → Phoenix \(PHX\)/);
  assert.match(result,/Phoenix \(PHX\) → New York \(JFK\)/);
  assert.match(result,/Dec 25, 2026, 9:45 AM/);
  assert.match(result,/Jan 4, 2027, 10 PM/);
  assert.match(result,/CST/);
  assert.match(result,/MST/);
  assert.match(result,/Track AA123/);
  assert.match(result,/Track AA456/);
  assert.doesNotMatch(result,/Different cities:/,'matching arrival and return city needs no warning');
 });
 test('separate arrival and return legs preserve their own connections',()=>{
  const connected={arrival:{date:'2026-12-26',time:'06:00',arrivalDate:'2026-12-26',arrivalTime:'16:00',
    from:'Los Angeles (LAX)',to:'New York (JFK)',
    stops:'1 connection',segments:[
      {date:'2026-12-26',time:'06:00',arrivalDate:'2026-12-26',arrivalTime:'09:00',
       from:'Los Angeles (LAX)',to:'Denver (DEN)',airline:'United Airlines',flight:'UA 777'},
      {date:'2026-12-26',time:'10:30',arrivalDate:'2026-12-26',arrivalTime:'16:00',
       from:'Denver (DEN)',to:'New York (JFK)',airline:'United Airlines',flight:'UA 888'}
    ]},departure:SAMPLE.departure};
  h.setFlights({D:connected});h.ui.flightPerson='D';
  const html=h.flightPanel();
  assert.match(html,/2 flight legs/);
  assert.match(html,/Different cities:/,'different arrival and return cities need a clear note');
  assert.match(html,/Track UA777/);
  assert.match(html,/Track UA888/);
  assert.match(html,/Track AA456/);
  assert.equal((html.match(/Track UA777/g)||[]).length,1);
 });
 test('external tracking URLs normalize verified airline codes and reject injection',()=>{
  assert.equal(h.flightTrackingInfo({flight:'AA 123'}).id,'AA123');
  assert.equal(h.flightTrackingInfo({flight:'123',airline:'American Airlines'}).id,'AA123');
  assert.equal(h.flightTrackingInfo({flight:'123',airline:''}),null);
  assert.equal(h.flightTrackingInfo({flight:'javascript:evil()'}),null);
  assert.doesNotMatch(h.flightTrackingHTML({flight:'<script>alert(1)</script>'}),/<script>/);
 });
 test('airport local time abbreviation uses correct December DST rules',()=>{
  assert.equal(h.airportLocalLabel('Dallas (DFW)','2026-12-25').abbrev,'CST');
  assert.equal(h.airportLocalLabel('Phoenix (PHX)','2026-12-25').abbrev,'MST');
  assert.equal(h.airportLocalLabel('San Diego (SAN)','2026-12-25').abbrev,'PST');
 });
 test('OCR extracts candidates but does not automatically fill or save',()=>{
  const p=h.flightOCRCandidates('Flight Dec 25 2026\n09:45 AM\n12:05 PM\nJan 04 2027');
  assert.ok(p.dates.includes('2026-12-25'));
  assert.ok(p.dates.includes('2027-01-04'));
  assert.ok(p.times.includes('09:45'));
  assert.ok(p.times.includes('12:05'));
 });
 test('server-confirmed save writes UID and does not write localStorage',()=>{
  h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.flightSync='ready';
  h.CLOUD.person='P';h.CLOUD.user={uid:'uid-p'};h.setMe('P');
  let resolveSave, write=null;
  h.CLOUD.db={};
  h.CLOUD.fs={doc:(db,...parts)=>parts.join('/'),setDoc:(ref,data)=>{
    write={ref,data};return new Promise(resolve=>{resolveSave=resolve;});
  }};
  h.saveFlightFor('P',SAMPLE);
  assert.equal(write.ref,'trips/main/flights/P');
  assert.equal(write.data.actorUid,'uid-p');
  assert.equal(write.data.by,'P');
  assert.equal(h.ui.flightMsg,'Saving flight details…');
  assert.ok(!Object.keys(local).some(x=>x.includes('flight')));
  assert.equal(h.flightFor('P').arrival.flight,'','unconfirmed write must not update the UI');
  resolveSave();return write;
 });
 await Promise.resolve();
 await Promise.resolve();
 test('signed-out and switched account purge in-memory flight records',()=>{
  h.setFlights({P:SAMPLE,A:SAMPLE});h.CLOUD.unsub=[];
  h.onUser(null);
  assert.equal(h.CLOUD.state,'signedout');
  assert.equal(h.flightFor('P').arrival.flight,'');
  assert.equal(h.flightFor('A').arrival.flight,'');
  assert.equal(h.ui.flightPerson,null);
  assert.equal(h.flightCanEdit('P'),false);
 });
 console.log('PASS '+count+' secure flight, identity isolation, tracking and private-data scenarios');
}
run().catch(e=>{console.error(e);process.exitCode=1});
