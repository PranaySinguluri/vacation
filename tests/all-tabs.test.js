'use strict';
/* Deterministic tests: no real accounts, Firebase writes, or external API calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3,'expected footer, Core, and application scripts');
const mod = {exports:{}};
vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core = mod.exports;
const handlers = {};
const app = {innerHTML:'',addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);},contains:()=>true};
const storageData = new Map();
const storage = {getItem:k=>storageData.get(k)||null,setItem:(k,v)=>storageData.set(k,String(v)),removeItem:k=>storageData.delete(k)};
const document = {getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const window = {confirm:()=>true};window.top=window.self=window;
const location = {protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const noNetwork = ()=>new Promise(()=>{});
const src = scripts[2].replace(/\}\)\(\);\s*$/, 'return {act,render,cityTab,photosTab,costsTab,spendingForm,activityHTML,data,ui,CITIES,PEOPLE,CLOUD,person,validExpense,validPayment,cleanExpense,cleanPayment,merge,exportData,cleanLink,setMe:function(id){me=id;}};})();');
assert.notEqual(src,scripts[2],'test hook inserted');
const appContext = {document,window,localStorage:storage,sessionStorage:storage,location,navigator:{},fetch:noNetwork,Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,console,setTimeout:()=>0,clearTimeout:()=>{}};
const h = vm.runInNewContext(src,appContext);
let passed=0;
function test(name,fn){try{fn();passed++;}catch(err){err.message='['+name+'] '+err.message;throw err;}}
const ids=h.PEOPLE.map(p=>p.id);
const [a,b,c,d,p,r,t]=ids;
test('all 7 traveler identities are unique',()=>assert.equal(new Set(ids).size,7));
for(let n=1;n<=7;n++){
  for(const amount of [0,1,2,3,10,99,100,101,1000,1001,7000,999999]){
    test('equal split '+amount+' cents / '+n,()=>{
      const v=Object.values(Core.shares(amount,ids.slice(0,n)));
      assert.equal(v.reduce((x,y)=>x+y,0),amount);
      assert.ok(Math.max(...v)-Math.min(...v)<=1);
      assert.ok(v.every(Number.isSafeInteger));
    });
  }
}
for(const [name,amount,members] of [['negative',-1,[a]],['fractional',1.5,[a]],['empty',100,[]],['duplicate',100,[a,a]],['blank',100,['']]]){
  test('reject '+name+' split',()=>assert.throws(()=>Core.shares(amount,members)));
}
test('two-person expense balance',()=>{
  const bal=Core.balances({people:h.PEOPLE,expenses:[{amount:1001,paidBy:p,split:[p,r]}],payments:[]});
  assert.equal(bal[p],500);assert.equal(bal[r],-500);
});
test('payer not in split',()=>{
  const bal=Core.balances({people:h.PEOPLE,expenses:[{amount:1000,paidBy:p,split:[a,r]}],payments:[]});
  assert.equal(bal[p],1000);assert.equal(bal[a],-500);assert.equal(bal[r],-500);
});
test('partial payment updates balances',()=>{
  const bal=Core.balances({people:h.PEOPLE,expenses:[{amount:1000,paidBy:p,split:[p,r]}],payments:[{amount:200,from:r,to:p}]});
  assert.equal(bal[p],300);assert.equal(bal[r],-300);
});
test('settlement amounts conserve balances',()=>{
  const bal=Core.balances({people:h.PEOPLE,expenses:[{amount:1001,paidBy:p,split:ids}],payments:[]});
  assert.equal(Core.settle(bal).reduce((sum,x)=>sum+x.amount,0),1001-Core.shares(1001,ids)[p]);
});
for(const c of h.CITIES){
  test(c.id+' city renders itinerary',()=>{
    h.ui.tab=c.id;h.render();assert.match(app.innerHTML,/Add stop/);assert.ok(app.innerHTML.includes(c.name));
  });
  test(c.id+' city includes seeded stops',()=>{
    const out=h.cityTab(c);assert.match(out,/Bookings|stop/);assert.ok(out.length>300);
  });
  test(c.id+' city tab switch',()=>{
    h.act('tab',{id:c.id});assert.equal(h.ui.tab,c.id);assert.match(app.innerHTML,/Add stop/);
  });
}
test('photos signed-out message',()=>assert.match(h.photosTab(),/Sign in with Google/));
test('photos signed-in shared album',()=>{
  h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.user={displayName:'Test'};
  assert.match(h.photosTab(),/Open Trip Photos/);
  assert.match(h.photosTab(),/photos\.app\.goo\.gl/);
  h.CLOUD.on=false;h.CLOUD.state='off';h.CLOUD.user=null;
});
test('expenses empty state',()=>assert.match(h.costsTab(),/No shared expenses yet/));
test('expense form includes seven travelers',()=>assert.equal((h.spendingForm().match(/name="sp-split"/g)||[]).length,7));
test('expense form has all checkbox',()=>assert.match(h.spendingForm(),/All 7 travelers/));
test('valid expense with metadata',()=>assert.ok(h.validExpense({id:'x',desc:'',amount:100,paidBy:p,split:[p,r]})));
test('reject duplicate participant import',()=>assert.ok(!h.validExpense({id:'x',desc:'',amount:100,paidBy:p,split:[r,r]})));
test('reject negative expense import',()=>assert.ok(!h.validExpense({id:'x',desc:'',amount:-100,paidBy:p,split:[r]})));
test('reject same-person payment',()=>assert.ok(!h.validPayment({id:'x',amount:100,from:p,to:p})));
test('reject negative payment',()=>assert.ok(!h.validPayment({id:'x',amount:-100,from:p,to:r})));
test('expense import retains category, author and date',()=>{
  const e=h.cleanExpense({id:'x',desc:'',amount:100,paidBy:p,split:[r],date:'2026-12-24',category:'Gas',currency:'USD',by:p,at:'2026-11-19T12:00:00Z'});
  assert.equal(e.category,'Gas');assert.equal(e.by,p);assert.equal(e.date,'2026-12-24');assert.equal(e.currency,'USD');
});
test('payment import retains author',()=>{
  const x=h.cleanPayment({id:'x',amount:100,from:r,to:p,date:'2026-12-24',by:r});
  assert.equal(x.by,r);
});
test('import rejects malformed trip',()=>assert.throws(()=>h.merge({v:3}),/bad code/));
test('merge preserves category and does not duplicate',()=>{
  const inc={v:3,places:[],expenses:[{id:'test-merge',desc:'',category:'Food',amount:500,paidBy:p,split:[p,r],date:'2026-12-24'}]};
  h.merge(inc);h.merge(inc);
  assert.equal(h.data.expenses.filter(e=>e.id==='test-merge').length,1);
  assert.equal(h.data.expenses.find(e=>e.id==='test-merge').category,'Food');
});
test('merge rejects invalid participant expense',()=>{
  h.merge({v:3,places:[],expenses:[{id:'bad-split',desc:'',amount:100,paidBy:p,split:[r,r]}]});
  assert.ok(!h.data.expenses.some(e=>e.id==='bad-split'));
});
test('merge respects deletion tombstones',()=>{
  h.merge({v:3,places:[],deleted:['test-merge'],expenses:[]});
  assert.ok(!h.data.expenses.some(e=>e.id==='test-merge'));
});
test('expense timeline includes actual record',()=>{
  h.data.expenses.push({id:'timeline',amount:700,paidBy:p,split:ids,date:'2026-12-24',category:'Food',desc:''});
  h.setMe(p);h.ui.tab='costs';
  assert.match(h.costsTab(),/December 2026/);
  assert.match(h.costsTab(),/Your share/);
});
for(const id of ids){
  test('personalized expense tab '+id,()=>{
    h.setMe(id);const page=h.costsTab();assert.match(page,/Expense history/);assert.ok(page.includes(h.person(id)+'’s expenses'));
  });
}
test('edit expense opens existing category and selected travelers',()=>{
  h.setMe(p);h.act('expense-edit',{id:'timeline'});
  assert.match(h.spendingForm(),/Save Changes/);
  assert.match(h.spendingForm(),/<option selected>Food<\/option>/);
});
test('delete expense removes record',()=>{
  h.act('expense-delete',{id:'timeline'});
  assert.ok(!h.data.expenses.some(e=>e.id==='timeline'));
});
test('settle up records payment',()=>{
  const count=h.data.payments.length;
  h.act('expense-settle',{from:r,to:p,amount:'100'});
  assert.equal(h.data.payments.length,count+1);
  assert.equal(h.data.payments.at(-1).amount,100);
});
test('photos tab navigation',()=>{h.CLOUD.on=false;h.act('tab',{id:'photos'});assert.match(app.innerHTML,/Photos/);});
test('expenses tab navigation',()=>{h.act('tab',{id:'costs'});assert.match(app.innerHTML,/Expense history/);});
test('light and dark CSS rules present',()=>{
  assert.match(html,/@media\(prefers-color-scheme:dark\)/);
  assert.match(html,/\.expense-sheet \.sp-people label/);
});
test('service worker present',()=>assert.ok(fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8').includes('activate')));
console.log('PASS '+passed+' deterministic regression checks across 4 city tabs, Photos, Expenses, forms, import, themes and split calculations.');
