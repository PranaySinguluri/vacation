'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3,'Expected version, core, app scripts');
const mod={exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports;
const handlers={};
const local={};
const app={innerHTML:'',contains:()=>true,addEventListener:(name,fn)=>{(handlers[name]||=[]).push(fn);}};
const fields={};
const document={getElementById:id=>id==='app'?app:fields[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const storage={
  getItem:k=>Object.prototype.hasOwnProperty.call(local,k)?local[k]:null,
  setItem:(k,v)=>{local[k]=String(v);},
  removeItem:k=>{delete local[k];}
};
const window={confirm:()=>true};window.top=window.self=window;
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const src=scripts[2].replace(/\}\)\(\);\s*$/,
  'return {ui,flightFor,flightLeg,flightPanel,flightOCRCandidates,flightOCRRead,saveFlightFor,flightCanEdit,act,CLOUD};})();');
assert.notEqual(src,scripts[2],'Flight test hook inserted');
const h=vm.runInNewContext(src,{document,window,localStorage:storage,sessionStorage:storage,location,
  navigator:{},fetch:()=>new Promise(()=>{}),Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,AbortController,
  console,setTimeout:()=>0,clearTimeout:()=>{}});
const sample=[
  'Depart: Tuesday Dec 15, 2026',
  'F9 4655 06:48 PM Dallas/Ft. Worth (DFW) 08:31 PM Phoenix (PHX)',
  'Return: Tuesday Jan 05, 2027',
  'F9 3832 09:19 PM Phoenix Sky Harbor (PHX) 12:40 AM Dallas/Ft. Worth (DFW)',
  'Wednesday, Jan 06, 2027'
].join('\n');
let pass=0;
function test(name,fn){try{fn();pass++;}catch(e){e.message='['+name+'] '+e.message;throw e;}}
async function run(){
  test('Pranay outbound departs Dallas Dec 15 at 6:48 PM and lands Phoenix at 8:31 PM',()=>{
    const p=h.flightFor('P'),a=p.arrival;
    assert.equal(a.date,'2026-12-15');
    assert.equal(a.time,'18:48');
    assert.equal(a.arrivalDate,'2026-12-15');
    assert.equal(a.arrivalTime,'20:31');
    assert.equal(a.flight,'F9 4655');
    assert.equal(a.from,'Dallas/Ft. Worth (DFW)');
    assert.equal(a.to,'Phoenix Sky Harbor (PHX)');
    assert.equal(a.duration,'2h 43m');
    assert.equal(a.stops,'Nonstop');
  });
  test('Pranay returns Jan 5 departing Phoenix and arrives Dallas Jan 6 after midnight',()=>{
    const r=h.flightFor('P').departure;
    assert.equal(r.date,'2027-01-05');
    assert.equal(r.time,'21:19');
    assert.equal(r.arrivalDate,'2027-01-06');
    assert.equal(r.arrivalTime,'00:40');
    assert.equal(r.flight,'F9 3832');
    assert.equal(r.duration,'2h 21m');
    assert.equal(r.stops,'Nonstop');
  });
  test('each other traveler has an independent blank itinerary',()=>{
    for(const id of ['A','D','H','M','R','S']){
      const x=h.flightFor(id);
      assert.equal(x.arrival.date,'');
      assert.equal(x.departure.date,'');
    }
  });
  test('tapping Pranay opens details with correct overnight date and times',()=>{
    h.act('flight-person',{id:'P'});
    assert.equal(h.ui.flightPerson,'P');
    const panel=h.flightPanel();
    assert.match(panel,/Dec 15, 2026/);
    assert.match(panel,/Jan 5, 2027/);
    assert.match(panel,/Jan 6, 2027/);
    assert.match(panel,/6:48 PM/);
    assert.match(panel,/8:31 PM/);
    assert.match(panel,/9:19 PM/);
    assert.match(panel,/12:40 AM/);
    assert.match(panel,/F9 4655/);
    assert.match(panel,/F9 3832/);
    assert.ok(!panel.includes('KBBU7Y'),'booking confirmation must not be displayed');
  });
  test('all travelers are clickable and itinerary opens from header',()=>{
    for(const name of ['Pranay','Akshaya','DivyaTheja','Haneela','Megha','Ramya','Sahithi'])
      assert.match(app.innerHTML,new RegExp('>'+name+'<'));
    assert.match(app.innerHTML,/data-act="flight-person"/);
  });
  test('flight edit has both takeoff and landing dates and times',()=>{
    h.act('flight-edit',{});
    assert.equal(h.ui.flightEditing,true);
    const panel=h.flightPanel();
    for(const id of ['flt-arrival-date','flt-arrival-time','flt-arrival-arrivalDate','flt-arrival-arrivalTime',
      'flt-departure-date','flt-departure-time','flt-departure-arrivalDate','flt-departure-arrivalTime'])
      assert.ok(panel.includes('id="'+id+'"'),'missing '+id);
    assert.ok(panel.includes('id="flight-shot"'));
  });
  test('screenshots extract candidate dates/times without automatically choosing legs',()=>{
    const result=h.flightOCRCandidates(sample);
    for(const date of ['2026-12-15','2027-01-05','2027-01-06'])
      assert.ok(result.dates.includes(date),'missing '+date);
    for(const time of ['18:48','20:31','21:19','00:40'])
      assert.ok(result.times.includes(time),'missing '+time);
    assert.equal(h.ui.flightDraft.arrival.time,'18:48');
  });
  test('date/time candidates assign to selected leg, including overnight arrival',()=>{
    fields['flt-departure-arrivalDate']={value:''};
    fields['flt-departure-arrivalTime']={value:''};
    h.act('flight-ocr-use',{kind:'departure',field:'arrivalDate',value:'2027-01-06'});
    h.act('flight-ocr-use',{kind:'departure',field:'arrivalTime',value:'00:40'});
    assert.equal(fields['flt-departure-arrivalDate'].value,'2027-01-06');
    assert.equal(fields['flt-departure-arrivalTime'].value,'00:40');
  });
  test('saving another traveler in local mode does not modify Pranay',()=>{
    const initial=h.flightFor('P').departure.arrivalDate;
    h.saveFlightFor('A',{arrival:{date:'2026-12-24',time:'10:15'},departure:{date:'2027-01-02',time:'14:30'}});
    assert.equal(h.flightFor('A').arrival.date,'2026-12-24');
    assert.equal(h.flightFor('P').departure.arrivalDate,initial);
    const saved=JSON.parse(local['tripwallet.flights.v1']);
    assert.equal(saved.A.arrival.date,'2026-12-24');
    assert.equal(saved.P,undefined);
  });
  test('flight OCR raw text and booking reference are not stored',()=>{
    const saved=local['tripwallet.flights.v1'];
    assert.ok(!saved.includes('KBBU7Y'));
    assert.ok(!saved.includes('Tuesday Dec 15'));
    assert.ok(!saved.includes('data:image'));
  });
  test('user with different identity cannot edit another traveler in cloud mode',()=>{
    h.CLOUD.on=true;h.CLOUD.state='ready';h.ui.admin=false;
    assert.equal(h.flightCanEdit('P'),false);
    h.CLOUD.on=false;
  });
  console.log('PASS '+pass+' traveler flights, Pranay exact itinerary, OCR candidate and isolation checks');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
