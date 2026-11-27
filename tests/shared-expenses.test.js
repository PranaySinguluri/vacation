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
 'return {act,render,sharedExpensesTab,spendingForm,expenseAuditHTML,activityHTML,expenseAuditEntries,validExpenseAmount,validExpenseDate,data,ui,CLOUD,PEOPLE,setMe:(id)=>{me=id},getMe:()=>me};})();');
assert.notEqual(src,scripts[2]);
const h=vm.runInNewContext(src,{document,window,localStorage:store,sessionStorage:store,location,navigator:{},
 fetch:()=>new Promise(()=>{}),Core,URL,Intl,TextEncoder,TextDecoder,Uint8Array,
 AbortController,console,setTimeout:()=>0,clearTimeout:()=>{}});
let chosen=['A','D','H','M','P','R','S'];
function submit(vals={},existingForm=null){
 const defaults={'sp-category':'Food','sp-amount':'21.00','sp-desc':'Lunch for group',
   'sp-payer':'P','sp-date':'2026-12-24'};
 for(const [id,v]of Object.entries({...defaults,...vals}))inputs[id]={value:v};
 error.textContent='';error.hidden=true;
 const form=existingForm||{id:'spending-form',classList:{contains:()=>false},dataset:{}};
 form.querySelector=sel=>sel==='[data-err]'?error:null;
 form.querySelectorAll=sel=>sel==='input[name="sp-split"]:checked'?chosen.map(value=>({value})):[];
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
 assert.doesNotMatch(page,/Paid by traveler|Expense activity/);
 h.act('expense-section',{id:'totals'});assert.match(app.innerHTML,/Paid by traveler/);assert.equal((app.innerHTML.match(/class="expense-paid-row"/g)||[]).length,8);
 h.act('expense-section',{id:'activity'});assert.match(app.innerHTML,/Expense activity/);
 h.act('expense-section',{id:'balances'});assert.match(app.innerHTML,/Your balances/);
 h.act('expense-section',{id:'expenses'});assert.match(app.innerHTML,/All expenses/);
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
 assert.match(h.expenseAuditHTML(),/DivyaTheja deleted an expense/);
 const ledger=h.sharedExpensesTab().split('id="expense-activity"')[0];
 assert.doesNotMatch(ledger,/Parking/);
 assert.match(h.expenseAuditHTML(),/Parking/);
});
test('profile activity shows registered travelers and device sessions only',()=>{
 h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.user={uid:'test',displayName:'Haneela'};
 h.CLOUD.members={test:{person:'H'}};
 h.data.log.push({id:'login-test',who:'H',kind:'session',act:'login',deviceId:'device1',text:'iPhone · Safari',at:'2026-12-26T19:00:00Z'},{id:'old-login',who:'P',kind:'session',act:'login',deviceId:'device2',text:'Mac · Chrome',at:'2026-12-26T18:00:00Z'},{id:'logout-test',who:'P',kind:'session',act:'logout',deviceId:'device2',text:'Mac · Chrome',at:'2026-12-26T20:00:00Z'},{id:'place',who:'H',act:'edited',text:'Edited a motel in San Diego',at:'2026-12-26T20:00:00Z'});
 h.ui.tab='costs';h.ui.menu=true;h.render();
 h.act('toggle-log',{});
 assert.equal(h.ui.tab,'activity');
 assert.doesNotMatch(app.innerHTML,/Registered travelers|iPhone · Safari/);
 assert.match(app.innerHTML,/Edited a motel in San Diego/);
 h.act('activity-accounts',{});
 assert.match(app.innerHTML,/Registered travelers \(1\/7\)/);
 assert.match(app.innerHTML,/iPhone · Safari/);
 assert.doesNotMatch(app.innerHTML,/Mac · Chrome|added an expense|deleted an expense/);
 assert.match(h.expenseAuditHTML(),/added an expense/);
 h.act('activity-back',{});
 assert.equal(h.ui.tab,'costs');
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

// Additional adversarial multi-user scenario matrix. It exercises real handlers,
// not a reimplementation of the expense mutations.
const ids=['A','D','H','M','P','R','S'];
const personName=Object.fromEntries(h.PEOPLE.map(x=>[x.id,x.name]));
function fresh(){
 h.CLOUD.on=false;h.CLOUD.state='off';h.CLOUD.user=null;
 h.data.expenses=[];h.data.log=[];h.data.payments=[];
 h.ui.tab='costs';h.setMe('P');chosen=ids.slice();window.confirm=()=>true;
}
function addAs(actor,amount,description,payer=actor,members=ids,date='2026-12-24'){
 h.setMe(actor);h.act('expense-add',{});chosen=members.slice();
 const before=h.data.expenses.length;
 assert.equal(submit({'sp-desc':description,'sp-amount':amount,
   'sp-payer':payer,'sp-date':date}),'');
 assert.equal(h.data.expenses.length,before+1);
 return h.data.expenses.at(-1);
}
test('every traveler adds one item and all seven see the same totals and records',()=>{
 fresh();
 for(const [n,actor] of ids.entries()){
  const exp=addAs(actor,(n+1).toFixed(2),personName[actor]+' paid',actor,ids);
  assert.equal(exp.by,actor);
  assert.equal(exp.paidBy,actor);
  assert.equal(exp.amount,(n+1)*100);
  assert.equal(exp.split.length,7);
  assert.equal(h.data.log.at(-1).who,actor);
  assert.equal(h.data.log.at(-1).expenseId,exp.id);
 }
 for(const viewer of ids){
  h.setMe(viewer);const html=h.sharedExpensesTab();
  assert.match(html,/Group spending recorded/);
  assert.match(html,/\$28\.00/);
  h.act('expense-section',{id:'totals'});assert.equal((h.sharedExpensesTab().match(/class="expense-paid-row"/g)||[]).length,8);h.act('expense-section',{id:'expenses'});
  for(const actor of ids)
   assert.ok(html.includes(personName[actor]+' paid'),viewer+' cannot see '+actor);
 }
 assert.equal(h.expenseAuditEntries().length,7);
});
test('49 creator/editor combinations keep original author, latest editor and snapshots',()=>{
 fresh();
 for(const owner of ids)for(const editor of ids){
  const item=addAs(owner,'10.00','Before '+owner,owner,[owner]);
  h.setMe(editor);h.act('expense-edit',{id:item.id});
  chosen=[editor,owner].filter((x,i,a)=>a.indexOf(x)===i);
  assert.equal(submit({'sp-desc':'After '+editor,'sp-amount':'13.37',
    'sp-payer':editor,'sp-category':'Transport','sp-date':'2026-12-31'}),'');
  const after=h.data.expenses.find(x=>x.id===item.id);
  assert.equal(after.by,owner);
  assert.equal(after.updatedBy,editor);
  assert.equal(after.paidBy,editor);
  assert.equal(after.amount,1337);
  assert.equal(after.date,'2026-12-31');
  assert.equal(after.category,'Transport');
  assert.equal(after.desc,'After '+editor);
  assert.deepEqual(Array.from(after.split),chosen);
  const event=h.data.log.at(-1);
  assert.equal(event.act,'edited');
  assert.equal(event.who,editor);
  assert.equal(event.expenseId,item.id);
  assert.equal(event.before.amount,1000);
  assert.equal(event.before.paidBy,owner);
  assert.equal(event.after.amount,1337);
  assert.equal(event.after.paidBy,editor);
  assert.match(h.sharedExpensesTab(),new RegExp('Last edited by '+personName[editor]));
  h.data.expenses=[];h.data.log=[];
 }
});
test('49 creator/deleter combinations remove the charge but preserve who deleted it',()=>{
 fresh();
 for(const owner of ids)for(const deleter of ids){
  const exp=addAs(owner,'9.99','Snack '+owner,owner,ids);
  h.setMe(deleter);h.act('expense-delete',{id:exp.id});
  assert.equal(h.data.expenses.length,0);
  const event=h.data.log.at(-1);
  assert.equal(event.act,'removed');
  assert.equal(event.who,deleter);
  assert.equal(event.expenseId,exp.id);
  assert.equal(event.before.amount,999);
  assert.equal(event.before.desc,'Snack '+owner);
  assert.ok(h.expenseAuditHTML().includes(personName[deleter]+' deleted an expense'));
  h.data.log=[];
 }
});
test('uneven cents and payer outside split work without rounding away money',()=>{
 fresh();
 const e=addAs('H','10.01','Parking','H',['A','D','S']);
 assert.equal(e.amount,1001);
 assert.equal(e.paidBy,'H');
 assert.ok(!e.split.includes('H'));
 const portions=Core.shares(e.amount,e.split);
 const values=Object.values(portions);
 assert.equal(values.reduce((a,b)=>a+b,0),1001);
 assert.ok(Math.max(...values)-Math.min(...values)<=1);
 const c=addAs('A','0.01','Penny','R',['R']);
 assert.equal(c.amount,1);
 assert.equal(Core.shares(c.amount,c.split).R,1);
});
test('strict currency input rejects fractions of a cent and malformed text',()=>{
 fresh();
 const invalid=['','0','0.00','-1','1.234','0.001','1e3','1,000','1.2.3',
  'Infinity','NaN','999999999999999999.99','3.14159','1_000','1.'];
 for(const value of invalid){
  h.act('expense-add',{});
  assert.match(submit({'sp-amount':value}),/valid amount/,value);
  assert.equal(h.data.expenses.length,0,value);
 }
 for(const [txt,expected]of [['0.01',1],['.50',50],['1',100],['1.2',120],
   ['1.20',120],['0002.05',205],['99999.99',9999999]]){
  assert.equal(h.validExpenseAmount(txt),expected);
 }
});
test('expense dates reject impossible days, accept leap day and year transitions',()=>{
 fresh();
 for(const date of ['2026-02-29','2026-02-31','2026-04-31','2026-13-01','2026-00-24',
  '2026-12-00','2026-12-32','not-a-date','2026-12-2','2027-02-29']){
  assert.equal(h.validExpenseDate(date),false,date);
  h.act('expense-add',{});
  assert.match(submit({'sp-date':date}),/valid calendar date/,date);
  assert.equal(h.data.expenses.length,0);
 }
 for(const date of ['2024-02-29','2026-11-26','2026-12-24','2027-01-05','2028-02-29'])
  assert.equal(h.validExpenseDate(date),true,date);
});
test('forged category, unknown payer, duplicate/empty/unknown split are rejected',()=>{
 fresh();
 for(const [values,members,message]of [
  [{'sp-category':'Hidden'},ids,/valid expense category/],
  [{'sp-payer':'Z'},ids,/choose who paid/],
  [{},[],/at least one traveler/],
  [{},['P','P'],/Invalid traveler selection/],
  [{},['Z','P'],/Invalid traveler selection/]
 ]){
  h.act('expense-add',{});chosen=members;
  assert.match(submit(values),message);
  assert.equal(h.data.expenses.length,0);
 }
});
test('invalid attempt can be corrected on same form; double-tap submits only once',()=>{
 fresh();h.act('expense-add',{});
 const form={id:'spending-form',classList:{contains:()=>false},dataset:{}};
 assert.match(submit({'sp-amount':'1.999'},form),/valid amount/);
 assert.equal(form.dataset.expenseSaved,undefined);
 assert.equal(submit({'sp-amount':'1.99','sp-desc':'Two clicks'},form),'');
 assert.equal(form.dataset.expenseSaved,'1');
 assert.equal(submit({'sp-amount':'1.99','sp-desc':'Two clicks'},form),'');
 assert.equal(h.data.expenses.length,1);
 assert.equal(h.expenseAuditEntries().length,1);
});
test('stale expense edit cannot recreate a deleted record',()=>{
 fresh();
 const e=addAs('P','9.00','Baggage');
 h.setMe('A');h.act('expense-edit',{id:e.id});
 // A remote device deleted the expense while this edit sheet remained open.
 h.data.expenses=h.data.expenses.filter(x=>x.id!==e.id);
 assert.equal(h.data.expenses.length,0);
 assert.match(submit({'sp-desc':'Stale edit','sp-amount':'99.00'}),/no longer exists/);
 assert.equal(h.data.expenses.length,0);
 assert.equal(h.data.log.filter(x=>x.act==='edited').length,0);
});
test('closed editor cannot submit a detached form after local deletion',()=>{
 fresh();
 const e=addAs('P','9.00','Bag');
 h.setMe('P');h.act('expense-edit',{id:e.id});
 h.act('expense-delete',{id:e.id});
 assert.equal(h.data.expenses.length,0);
 const before=h.expenseAuditEntries().length;
 assert.match(submit({'sp-desc':'Detached old form'}),/form is closed/);
 assert.equal(h.data.expenses.length,0);
 assert.equal(h.expenseAuditEntries().length,before);
});
test('cancel delete does not mutate charge or activity log',()=>{
 fresh();const e=addAs('S','27.50','Car wash');
 const logCount=h.data.log.length;
 window.confirm=()=>false;
 h.setMe('R');h.act('expense-delete',{id:e.id});
 assert.equal(h.data.expenses.length,1);
 assert.equal(h.data.log.length,logCount);
 window.confirm=()=>true;
});
test('immutable audit before/after snapshots survive edit then removal',()=>{
 fresh();const e=addAs('H','12.00','Original','H',['H','P']);
 h.setMe('S');h.act('expense-edit',{id:e.id});chosen=['S'];
 assert.equal(submit({'sp-desc':'Changed','sp-amount':'13.01','sp-payer':'S'}),'');
 const edit=h.data.log.at(-1);
 assert.equal(edit.before.desc,'Original');assert.equal(edit.after.desc,'Changed');
 assert.equal(edit.before.amount,1200);assert.equal(edit.after.amount,1301);
 assert.deepEqual(Array.from(edit.before.split),['H','P']);
 assert.deepEqual(Array.from(edit.after.split),['S']);
 h.setMe('M');h.act('expense-delete',{id:e.id});
 assert.equal(h.data.log.at(-1).before.amount,1301);
 assert.equal(edit.before.amount,1200);
 assert.equal(h.data.expenses.length,0);
});
test('unauthorized loading, missing-member and signed-out states cannot modify cloud expenses',()=>{
 fresh();const e=addAs('P','6.00','Taxi');
 const initial=h.data.log.length;
 h.CLOUD.on=true;h.CLOUD.state='loading';h.CLOUD.user={uid:'visitor'};
 h.setMe('P');h.act('expense-add',{});
 assert.equal(h.data.expenses.length,1);
 h.CLOUD.state='ready';h.setMe('');
 h.act('expense-add',{});
 h.act('expense-delete',{id:e.id});
 assert.equal(h.data.expenses.length,1);
 assert.equal(h.data.log.length,initial);
 assert.match(submit({'sp-desc':'Guest'}),/form is closed|Sign in as a traveler/);
 h.CLOUD.on=false;h.CLOUD.state='off';h.CLOUD.user=null;
});

console.log('PASS '+passed+' shared expense additions, edits, deletions and all-person activity log checks');

test('navigating away closes an editor; detached form cannot create a hidden charge',()=>{
 fresh();
 h.act('expense-add',{});
 h.act('tab',{id:'photos'});
 assert.match(submit({'sp-desc':'Invisible expense'}),/form is closed/);
 assert.equal(h.data.expenses.length,0);
 h.act('tab',{id:'costs'});
});
async function mockFirestoreBatchScenarios(){
 fresh();
 const allBatches=[];
 h.CLOUD.on=true;h.CLOUD.state='ready';h.CLOUD.user={uid:'test-user',displayName:'Pranay'};
 h.CLOUD.person='P';h.CLOUD.db={};h.CLOUD.loaded={places:true,expenses:true,payments:true,deleted:true};
 let rejectNext=false;
 h.CLOUD.fs={
  doc:(db,...segments)=>segments.join('/'),
  writeBatch:()=>{
   const ops=[];
   return {
    set:(ref,value)=>ops.push({op:'set',ref,value}),
    delete:ref=>ops.push({op:'delete',ref}),
    commit:()=>{
     allBatches.push(ops);
     if(rejectNext){rejectNext=false;return Promise.reject(Object.assign(new Error('Permission denied'),{code:'permission-denied'}));}
     return Promise.resolve();
    }
   };
  }
 };
 // These are mocked transaction boundaries, not Firestore Security Rule tests.
 h.setMe('P');h.act('expense-add',{});
 chosen=ids.slice();
 assert.equal(submit({'sp-desc':'Shared lunch','sp-amount':'14.25','sp-payer':'P'}),'');
 const exp=h.data.expenses.at(-1),first=allBatches.at(-1);
 assert.ok(first.some(x=>x.op==='set'&&x.ref==='trips/main/expenses/'+exp.id));
 assert.ok(first.some(x=>x.op==='set'&&x.ref.startsWith('trips/main/log/')));
 assert.equal(first.find(x=>x.ref==='trips/main/expenses/'+exp.id).value.by,'P');
 await new Promise(resolve=>setTimeout(resolve,0));
 h.setMe('A');h.CLOUD.person='A';h.act('expense-edit',{id:exp.id});
 chosen=['A','P'];
 assert.equal(submit({'sp-desc':'Dinner edited','sp-amount':'19.25','sp-payer':'A'}),'');
 const edited=allBatches.at(-1);
 const editExpense=edited.find(x=>x.op==='set'&&x.ref==='trips/main/expenses/'+exp.id);
 assert.equal(editExpense.value.by,'P');
 assert.equal(editExpense.value.updatedBy,'A');
 assert.equal(editExpense.value.amount,1925);
 const editLog=edited.find(x=>x.op==='set'&&x.ref.startsWith('trips/main/log/')&&x.value.act==='edited');
 assert.equal(editLog.value.who,'A');
 assert.equal(editLog.value.before.amount,1425);
 await new Promise(resolve=>setTimeout(resolve,0));
 h.setMe('D');h.CLOUD.person='D';h.act('expense-delete',{id:exp.id});
 const deleted=allBatches.at(-1);
 assert.ok(deleted.some(x=>x.op==='delete'&&x.ref==='trips/main/expenses/'+exp.id));
 assert.ok(deleted.some(x=>x.op==='set'&&x.ref==='trips/main/deleted/'+exp.id));
 const deleteLog=deleted.find(x=>x.op==='set'&&x.ref.startsWith('trips/main/log/')&&x.value.act==='removed');
 assert.equal(deleteLog.value.who,'D');
 assert.equal(deleteLog.value.before.amount,1925);
 await new Promise(resolve=>setTimeout(resolve,0));
 h.setMe('R');h.CLOUD.person='R';h.act('expense-add',{});
 rejectNext=true;
 assert.equal(submit({'sp-desc':'Rejected by backend','sp-amount':'22.00','sp-payer':'R'}),'');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.match(h.ui.msg,/Sync failed \(permission-denied\)/);
 h.CLOUD.on=false;h.CLOUD.state='off';h.CLOUD.user=null;
 console.log('PASS mocked Firestore batch add/edit/delete atomic requests and permission-denied UI');
}
mockFirestoreBatchScenarios().catch(error=>{console.error(error);process.exitCode=1});

