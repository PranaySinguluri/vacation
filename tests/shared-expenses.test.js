'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3);
const mod={exports:{}};vm.runInNewContext(scripts[1],{module:mod,TextEncoder,TextDecoder,Uint8Array,URL,Intl});
const Core=mod.exports,handlers={},local={};
const app={innerHTML:'',contains:()=>true,addEventListener:(name,fn)=>(handlers[name]||=[]).push(fn)};
const inputs={
 'sp-category':{value:'Food'},'sp-amount':{value:'21.00'},
 'sp-desc':{value:'Lunch for group'},'sp-payer':{value:'P'},
 'sp-date':{value:'2026-12-24'}
};
const error={textContent:'',hidden:true};
const document={getElementById:id=>id==='app'?app:inputs[id]||null,
 querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
const store={getItem:k=>local[k]||null,setItem:(k,v)=>{local[k]=String(v);},removeItem:k=>delete local[k]};
const window={confirm:()=>true};window.top=window.self=window;
const location={protocol:'file:',origin:'file://',pathname:'/index.html',hash:''};
const src=scripts[2].replace(/\}\)\(\);\s*$/,
 'return {act,render,sharedExpensesTab,spendingForm,expenseAuditHTML,activityHTML,expenseAuditEntries,data,ui,CLOUD,PEOPLE,setMe:(id)=>{me=id},getMe:()=>me};})();');
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:store,sessionStorage:store,location,navigator:{},
 fetch:()=>new Promise(()=>{}),Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,
 AbortController,console,setTimeout:()=>0,clearTimeout:()=>{}});
let chosen=['A','D','H','M','P','R','S'];
function submit(vals={}){
 for(const [id,v]of Object.entries(vals))inputs[id]={value:v};
 error.textContent='';error.hidden=true;
 const form={id:'spending-form',querySelector:sel=>sel==='[data-err]'?error:null,
 querySelectorAll:sel=>sel==='input[name="sp-split"]:checked'?chosen.map(value=>({value})):[]};
 for(const fn of handlers.submit||[])fn({target:form,preventDefault(){}});
 return error.textContent;
}
let passed=0;
function test(name,fn){try{fn();passed++;}catch(e){e.message='['+name+'] '+e.message;throw e;}}
test('Expenses tab is visible, with one Add expense action and 7 traveler totals',()=>{
 h.ui.tab='costs';h.setMe('P');h.render();
 const page=app.innerHTML;
 assert.match(page,/data-id="costs" aria-selected="true"/);
 assert.match(page,/Trip expenses/);
 assert.match(page,/Group spending recorded/);
 assert.match(page,/Paid by traveler/);
 assert.match(page,/Expense activity/);
 for(const person of h.PEOPLE)assert.match(page,new RegExp(person.name));
 assert.equal((page.match(/data-act="expense-add"/g)||[]).length,1);
 assert.doesNotMatch(page,/Settle up|Your balances|You owe/);
});
test('all seven may open the same shared Add expense form',()=>{
 for(const p of h.PEOPLE){
   h.setMe(p.id);
   h.act('expense-add',{});
   assert.equal(h.ui.tab,'costs');
   assert.match(app.innerHTML,/id="spending-form"/);
   assert.match(app.innerHTML,/id="sp-desc"/);
   assert.match(app.innerHTML,/id="sp-payer"/);
   assert.equal((app.innerHTML.match(/name="sp-split"/g)||[]).length,7);
   h.act('expense-close',{});
 }
});
test('Pranay can add an expense shared equally by all seven and log the actor',()=>{
 h.setMe('P');h.act('expense-add',{});
 assert.equal(submit(),'');
 assert.equal(h.data.expenses.length,1);
 const e=h.data.expenses[0];
 assert.equal(e.desc,'Lunch for group');assert.equal(e.amount,2100);
 assert.equal(e.paidBy,'P');assert.equal(e.by,'P');
 assert.equal(e.split.length,7);
 assert.equal(e.category,'Food');assert.equal(e.date,'2026-12-24');
 assert.equal(h.ui.tab,'costs');assert.equal(h.ui.showLog,false);
 assert.equal(h.data.log.filter(l=>l.kind==='expense'&&l.act==='added').length,1);
 assert.match(h.sharedExpensesTab(),/\$21\.00/);
 assert.match(h.sharedExpensesTab(),/Paid by Pranay/);
 assert.match(h.sharedExpensesTab(),/Added by Pranay/);
});
test('Akshaya can add an expense paid by Sahithi and split across two travelers',()=>{
 h.setMe('A');h.act('expense-add',{});
 chosen=['A','S'];
 assert.equal(submit({'sp-amount':'12.50','sp-desc':'Parking','sp-payer':'S','sp-category':'Transport'}),'');
 const e=h.data.expenses.at(-1);
 assert.equal(e.by,'A');assert.equal(e.paidBy,'S');assert.equal(e.amount,1250);
 assert.deepEqual(Array.from(e.split),['A','S']);
 const all=h.sharedExpensesTab();
 assert.match(all,/Parking/);assert.match(all,/Paid by Sahithi/);assert.match(all,/Added by Akshaya/);
 assert.match(all,/\$33\.50/);
});
test('invalid blank descriptions, invalid amounts and no participants are rejected',()=>{
 const before=h.data.expenses.length;h.setMe('R');h.act('expense-add',{});
 assert.match(submit({'sp-desc':'','sp-amount':'1.00'}),/what this expense was for/);
 assert.match(submit({'sp-desc':'Hotel','sp-amount':'-1.00'}),/valid amount/);
 chosen=[];assert.match(submit({'sp-desc':'Hotel','sp-amount':'2.00'}),/at least one traveler/);
 assert.equal(h.data.expenses.length,before);
 h.act('expense-close',{});chosen=['A','D','H','M','P','R','S'];
});
test('Ramya editing an expense records the editor but keeps its original author',()=>{
 h.setMe('R');
 const id=h.data.expenses[0].id;
 h.act('expense-edit',{id});
 assert.match(h.spendingForm(),/Lunch for group/);
 assert.equal(submit({'sp-desc':'Group dinner','sp-amount':'28.00','sp-payer':'R','sp-category':'Food'}),'');
 const e=h.data.expenses.find(e=>e.id===id);
 assert.equal(e.desc,'Group dinner');assert.equal(e.amount,2800);
 assert.equal(e.by,'P');assert.equal(e.updatedBy,'R');
 const edited=h.data.log.filter(l=>l.kind==='expense'&&l.act==='edited').at(-1);
 assert.equal(edited.who,'R');assert.equal(edited.expenseId,id);
 assert.match(h.expenseAuditHTML(),/Ramya edited an expense/);
});
test('Divya deleting an expense records history for everyone and hides it from active ledger',()=>{
 const id=h.data.expenses[1].id;
 h.setMe('D');h.act('expense-delete',{id});
 assert.equal(h.data.expenses.length,1);
 assert.ok(!h.data.expenses.some(e=>e.id===id));
 const deleted=h.data.log.filter(l=>l.kind==='expense'&&l.act==='removed').at(-1);
 assert.equal(deleted.who,'D');assert.equal(deleted.expenseId,id);
 assert.match(deleted.text,/Parking/);
 assert.match(h.activityHTML(),/DivyaTheja deleted an expense/);
 assert.doesNotMatch(h.sharedExpensesTab(),/Parking/);
});
test('expense-only activity log hides itinerary change events and lists all authors',()=>{
 h.setMe('H');h.data.log.push({id:'not-exp',who:'H',act:'removed',text:'Deleted a motel',at:'2026-12-26T18:00:00Z'});
 const log=h.activityHTML();
 for(const text of ['Pranay added an expense','Akshaya added an expense','Ramya edited an expense','DivyaTheja deleted an expense'])
  assert.ok(log.includes(text),'missing '+text);
 assert.doesNotMatch(log,/Deleted a motel/);
 h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.user={uid:'test',displayName:'Haneela'};
 h.ui.showLog=true;h.render();
 assert.match(app.innerHTML,/Expense activity · All travelers/);
 assert.match(app.innerHTML,/data-act="toggle-log"/);
 h.CLOUD.on=false;h.CLOUD.state='off';h.CLOUD.user=null;
});
test('expense input is HTML-escaped, not interpolated into markup',()=>{
 h.setMe('P');
 h.act('expense-add',{});
 chosen=['P'];
 const value='<img src=x onerror=alert(1)>';
 assert.equal(submit({'sp-desc':value,'sp-amount':'1','sp-payer':'P','sp-category':'Other'}),'');
 const page=h.sharedExpensesTab();
 assert.ok(!page.includes(value));
 assert.match(page,/&lt;img/);
});
console.log('PASS '+passed+' shared expense additions, edits, deletions and all-person activity log checks');
