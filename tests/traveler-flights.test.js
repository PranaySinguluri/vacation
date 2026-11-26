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
  'return {ui,flightFor,flightLeg,flightPanel,flightOCRCandidates,flightOCRRead,saveFlightFor,flightCanEdit,airportLocalLabel,flightTrackingInfo,flightTrackingHTML,act,CLOUD};})();');
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
  test('Frontier outbound and return flights have correct flight-number tracking links',()=>{
    const outbound=h.flightTrackingInfo(h.flightFor('P').arrival);
    const inbound=h.flightTrackingInfo(h.flightFor('P').departure);
    assert.equal(outbound.id,'F94655');
    assert.equal(outbound.date,'2026-12-15');
    assert.equal(outbound.tracker,'https://www.flightradar24.com/data/flights/f94655');
    assert.equal(inbound.id,'F93832');
    assert.equal(inbound.date,'2027-01-05');
    assert.equal(inbound.tracker,'https://www.flightradar24.com/data/flights/f93832');
    assert.equal(outbound.airlineStatus,'https://www.flyfrontier.com/travel/my-trips/flight-status');
    assert.equal(inbound.airlineStatus,outbound.airlineStatus);
  });
  test('flight tracker actions are shown for both flights, with booking schedule preserved',()=>{
    h.ui.flightPerson='P';
    const html=h.flightPanel();
    assert.match(html,/Track F94655/);
    assert.match(html,/Track F93832/);
    assert.match(html,/Airline flight status/);
    assert.match(html,/data\/flights\/f94655/);
    assert.match(html,/data\/flights\/f93832/);
    assert.match(html,/may be unavailable until close to departure/);
    assert.match(html,/Dec 15, 2026/);
    assert.match(html,/Jan 6, 2027/);
    assert.match(html,/8:31 PM/);
    assert.match(html,/12:40 AM/);
    assert.ok(!html.includes('KBBU7Y'));
    h.ui.flightPerson=null;
  });
  test('flight number normalization works for other travelers and numeric-only Frontier flights',()=>{
    assert.equal(h.flightTrackingInfo({flight:'f9 4655',airline:'Frontier Airlines'}).id,'F94655');
    assert.equal(h.flightTrackingInfo({flight:'4655',airline:'Frontier Airlines'}).id,'F94655');
    assert.equal(h.flightTrackingInfo({flight:'AA 1234',airline:'American Airlines'}).tracker,
      'https://www.flightradar24.com/data/flights/aa1234');
    assert.equal(h.flightTrackingInfo({flight:'1234',airline:'Unknown carrier'}),null);
    assert.equal(h.flightTrackingInfo({flight:'',airline:'Frontier Airlines'}),null);
  });
  test('untrusted flight-number text cannot inject a URL or markup',()=>{
    const malicious={flight:'F9"><script>alert(1)</script>',airline:'Frontier Airlines'};
    assert.equal(h.flightTrackingInfo(malicious),null);
    assert.ok(!h.flightTrackingHTML(malicious).includes('<script>'));
    assert.equal(h.flightTrackingInfo({flight:'javascript:alert(1)',airline:'Frontier'}),null);
  });
  test('Ramya Frontier flights match her Dec 16 and Jan 5 screenshot',()=>{
    const r=h.flightFor('R');
    assert.equal(r.arrival.date,'2026-12-16');
    assert.equal(r.arrival.time,'18:51');
    assert.equal(r.arrival.arrivalDate,'2026-12-16');
    assert.equal(r.arrival.arrivalTime,'20:34');
    assert.equal(r.arrival.from,'Dallas/Ft. Worth (DFW)');
    assert.equal(r.arrival.to,'Phoenix Sky Harbor (PHX)');
    assert.equal(r.arrival.flight,'F9 4655');
    assert.equal(r.departure.date,'2027-01-05');
    assert.equal(r.departure.time,'19:06');
    assert.equal(r.departure.arrivalDate,'2027-01-05');
    assert.equal(r.departure.arrivalTime,'22:29');
    assert.equal(r.departure.from,'Phoenix Sky Harbor (PHX)');
    assert.equal(r.departure.to,'Dallas/Ft. Worth (DFW)');
    assert.equal(r.departure.flight,'F9 3832');
    assert.equal(r.arrival.duration,'');
    assert.equal(r.departure.duration,'');
  });
  test('Ramya flight card shows its own airport-local times and flight tracker',()=>{
    h.ui.flightPerson='R';
    const html=h.flightPanel();
    assert.match(html,/Ramya · Flights/);
    assert.match(html,/Dec 16, 2026, 6:51 PM/);
    assert.match(html,/Dec 16, 2026, 8:34 PM/);
    assert.match(html,/Jan 5, 2027, 7:06 PM/);
    assert.match(html,/Jan 5, 2027, 10:29 PM/);
    assert.match(html,/Dallas local time \(CST\)/);
    assert.match(html,/Phoenix Sky Harbor local time \(MST\)/);
    assert.match(html,/Track F94655/);
    assert.match(html,/Track F93832/);
    assert.doesNotMatch(html,/Jan 6, 2027/);
    assert.doesNotMatch(html,/6:48 PM/);
    assert.doesNotMatch(html,/KBBU7Y/);
    h.ui.flightPerson=null;
  });
  test('Ramya itinerary is separate from Pranay and other travelers remain blank',()=>{
    const pranay=h.flightFor('P'),ramya=h.flightFor('R');
    assert.equal(pranay.arrival.date,'2026-12-15');
    assert.equal(pranay.departure.time,'21:19');
    assert.notEqual(pranay.arrival.date,ramya.arrival.date);
    assert.notEqual(pranay.departure.time,ramya.departure.time);
    for(const id of ['A','D','H','M']){
      const x=h.flightFor(id);
      assert.equal(x.arrival.date,'');
      assert.equal(x.departure.date,'');
    }
  });
  test('Sahithi outbound has two distinct connecting flights via St. Louis',()=>{
    const f=h.flightFor('S'),out=f.arrival;
    assert.equal(out.date,'2026-12-23');
    assert.equal(out.time,'20:30');
    assert.equal(out.arrivalDate,'2026-12-24');
    assert.equal(out.arrivalTime,'','Phoenix landing minute is cut off in screenshot');
    assert.equal(out.from,'Columbus (CMH)');
    assert.equal(out.to,'Phoenix Sky Harbor (PHX)');
    assert.equal(out.flight,'','No single flight number applies to the entire trip');
    assert.equal(out.segments.length,2);
    const first=out.segments[0],second=out.segments[1];
    assert.equal(first.from,'Columbus (CMH)');
    assert.equal(first.to,'St. Louis (STL)');
    assert.equal(first.date,'2026-12-23');
    assert.equal(first.time,'20:30');
    assert.equal(first.arrivalDate,'2026-12-23');
    assert.equal(first.arrivalTime,'21:00');
    assert.equal(first.flight,'WN 1282');
    assert.equal(first.duration,'1h 30m');
    assert.equal(second.from,'St. Louis (STL)');
    assert.equal(second.to,'Phoenix Sky Harbor (PHX)');
    assert.equal(second.date,'2026-12-23');
    assert.equal(second.time,'21:45');
    assert.equal(second.arrivalDate,'2026-12-24');
    assert.equal(second.arrivalTime,'');
    assert.equal(second.flight,'');
  });
  test('Sahithi return is Jan 5 PHX to CMH with known times but unknown flight number',()=>{
    const back=h.flightFor('S').departure;
    assert.equal(back.date,'2027-01-05');
    assert.equal(back.time,'17:10');
    assert.equal(back.arrivalDate,'2027-01-05');
    assert.equal(back.arrivalTime,'22:45');
    assert.equal(back.from,'Phoenix Sky Harbor (PHX)');
    assert.equal(back.to,'Columbus (CMH)');
    assert.equal(back.airline,'Southwest Airlines');
    assert.equal(back.flight,'');
    assert.equal(back.stops,'','Do not invent nonstop service');
  });
  test('Sahithi panel shows separate connection and only the verified WN1282 tracking action',()=>{
    h.ui.flightPerson='S';
    const html=h.flightPanel();
    assert.match(html,/Sahithi · Flights/);
    assert.match(html,/Dec 23, 2026, 8:30 PM/);
    assert.match(html,/Dec 23, 2026, 9 PM/);
    assert.match(html,/Dec 23, 2026, 9:45 PM/);
    assert.match(html,/Dec 24, 2026/);
    assert.match(html,/Jan 5, 2027, 5:10 PM/);
    assert.match(html,/Jan 5, 2027, 10:45 PM/);
    assert.match(html,/1 connection via St. Louis/);
    assert.match(html,/Flight connections \(2 legs\)/);
    assert.match(html,/Track WN1282/);
    assert.match(html,/data\/flights\/wn1282/);
    assert.match(html,/Exact time not shown/);
    assert.match(html,/Flight number not shown/);
    assert.ok(!html.includes('12:00 AM'),'must not guess Phoenix arrival time');
    assert.ok(!html.includes('B7QLKP'),'must not display confirmation number');
    assert.ok(!html.includes('WN1283'),'must not guess second flight number');
    h.ui.flightPerson=null;
  });
  test('Sahithi edit form exposes both connecting legs for corrections',()=>{
    h.ui.flightPerson='S';
    h.act('flight-edit',{});
    const html=h.flightPanel();
    assert.match(html,/Connecting flights — edit each leg separately/);
    assert.ok(html.includes('id="flt-arrival-seg0-flight"'));
    assert.ok(html.includes('id="flt-arrival-seg1-flight"'));
    assert.ok(html.includes('id="flt-arrival-seg1-arrivalTime"'));
    assert.ok(html.includes('id="flt-departure-time"'));
    h.act('flight-cancel',{});
    h.ui.flightPerson=null;
  });
  test('saving an edited flight itinerary retains both connection legs',()=>{
    const out=h.flightFor('S').arrival,back=h.flightFor('S').departure;
    h.saveFlightFor('S',{arrival:out,departure:back});
    const saved=h.flightFor('S');
    assert.equal(saved.arrival.segments.length,2);
    assert.equal(saved.arrival.segments[0].flight,'WN 1282');
    assert.equal(saved.arrival.segments[1].time,'21:45');
    assert.equal(saved.arrival.arrivalTime,'');
    assert.equal(saved.departure.arrivalTime,'22:45');
    const stored=JSON.parse(local['tripwallet.flights.v1']);
    assert.equal(stored.S.arrival.segments.length,2);
    assert.equal(stored.P,undefined);
    assert.equal(stored.R,undefined);
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
      assert.match(app.innerHTML,new RegExp('>'+name+'(?:\\s|<)'));
    assert.match(app.innerHTML,/data-id="P"[^>]*title="Your profile/);
    assert.match(app.innerHTML,/class="av me selected"/);
    assert.match(app.innerHTML,/data-act="flight-person"/);
  });
  test('Pranay stays highlighted while Akshaya is selected',()=>{
    h.act('flight-person',{id:'A'});
    assert.equal(h.ui.flightPerson,'A');
    const header=app.innerHTML.split('</header>')[0];
    assert.match(header,/class="av me" data-act="flight-person" data-id="P"/);
    assert.match(header,/class="av selected" data-act="flight-person" data-id="A"/);
    assert.match(h.flightPanel(),/Akshaya · Flights/);
    assert.match(h.flightPanel(),/Flight details have not been added for this person yet/);
    assert.doesNotMatch(h.flightPanel(),/F9 4655/);
  });
  test('Divya selection displays only Divya and does not change self-highlight',()=>{
    h.act('flight-person',{id:'D'});
    assert.equal(h.ui.flightPerson,'D');
    const header=app.innerHTML.split('</header>')[0];
    assert.match(header,/class="av me" data-act="flight-person" data-id="P"/);
    assert.match(header,/class="av selected" data-act="flight-person" data-id="D"/);
    assert.match(h.flightPanel(),/DivyaTheja · Flights/);
    assert.doesNotMatch(h.flightPanel(),/Phoenix Sky Harbor/);
    h.act('flight-person',{id:'P'});
    assert.equal(h.ui.flightPerson,'P');
    assert.match(app.innerHTML,/class="av me selected" data-act="flight-person" data-id="P"/);
  });
  test('airport-local time zone labels match December and January airports',()=>{
    assert.equal(h.airportLocalLabel('Dallas/Ft. Worth (DFW)','2026-12-15').abbrev,'CST');
    assert.equal(h.airportLocalLabel('Phoenix Sky Harbor (PHX)','2026-12-15').abbrev,'MST');
    assert.equal(h.airportLocalLabel('Los Angeles (LAX)','2026-12-26').abbrev,'PST');
    assert.equal(h.airportLocalLabel('Unknown Airport','2026-12-26').abbrev,'');
    const flight=h.flightPanel();
    assert.match(flight,/Dallas local time \(CST\)/);
    assert.match(flight,/Phoenix Sky Harbor local time \(MST\)/);
    assert.match(flight,/Jan 6, 2027/);
    assert.match(flight,/12:40 AM/);
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
