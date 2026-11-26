'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {collection,doc,setDoc,deleteDoc,getDoc,getDocs,writeBatch}=require('firebase/firestore');
async function run(){
 const env=await initializeTestEnvironment({
  projectId:'demo-vacation-security',
  firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}
 });
 const paths=(db)=>({
  config:doc(db,'trips/main/config/security'),
  member:uid=>doc(db,'trips/main/members/'+uid),
  request:uid=>doc(db,'trips/main/requests/'+uid),
  exp:id=>doc(db,'trips/main/expenses/'+id),
  log:id=>doc(db,'trips/main/log/'+id),
  flight:id=>doc(db,'trips/main/flights/'+id),
  expenses:collection(db,'trips/main/expenses'),
  members:collection(db,'trips/main/members')
 });
 const pids=['P','R','A','D','H','M','S'];
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore(),p=paths(db);
   await setDoc(p.config,{ownerUid:'owner-uid'});
   await setDoc(p.member('owner-uid'),{person:'P',approvedBy:'owner-uid'});
   for(const pid of pids.filter(x=>x!=='P'))
    await setDoc(p.member('member-'+pid),{person:pid,approvedBy:'owner-uid'});
  });
  const owner=env.authenticatedContext('owner-uid',{email:'owner@example.com',email_verified:true}).firestore();
  const a=env.authenticatedContext('member-A',{email:'a@example.com',email_verified:true}).firestore();
  const s=env.authenticatedContext('member-S',{email:'s@example.com',email_verified:true}).firestore();
  const attacker=env.authenticatedContext('stranger',{email:'stranger@example.com',email_verified:true}).firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const o=paths(owner),u=paths(a),v=paths(s),bad=paths(attacker),anon=paths(anonymous);
  await assertSucceeds(getDoc(o.member('owner-uid')));
  await assertSucceeds(getDoc(u.member('member-A')));
  await assertSucceeds(getDocs(u.members));
  await assertFails(getDocs(bad.members));
  await assertFails(getDoc(bad.member('member-A')));
  await assertFails(getDocs(bad.expenses));
  await assertFails(getDocs(anon.expenses));

  await assertSucceeds(setDoc(bad.request('stranger'),{
   email:'stranger@example.com',name:'Stranger',requestedAt:'2026-11-26T00:00:00Z'
  }));
  await assertFails(setDoc(bad.member('stranger'),{person:'P',approvedBy:'stranger'}));
  await assertFails(setDoc(u.member('member-S'),{person:'P',approvedBy:'member-A'}));
  await assertSucceeds(getDocs(collection(owner,'trips/main/requests')));
  await assertFails(getDocs(collection(attacker,'trips/main/requests')));

  const flight={arrival:{date:'2026-12-24'},departure:{},by:'A',actorUid:'member-A',at:'2026-11-26T00:00:00Z'};
  await assertSucceeds(setDoc(u.flight('A'),flight));
  await assertFails(setDoc(u.flight('P'),{...flight}));
  await assertFails(setDoc(bad.flight('A'),flight));
  await assertSucceeds(getDoc(v.flight('A')));
  await assertFails(getDoc(bad.flight('A')));

  const base={desc:'Group lunch',amount:1901,paidBy:'P',split:['A','P','S'],
   category:'Food',currency:'USD',date:'2026-12-24',merchant:'',time:'',quantity:'',unit:'',unitPrice:'',
   by:'A',at:'2026-11-26T00:00:00Z',ownerUid:'member-A',actorUid:'member-A',rev:1};
  const addLog={kind:'expense',act:'added',expenseId:'e1',rev:1,who:'A',actorUid:'member-A',
   at:'2026-11-26T00:00:00Z',text:'Lunch added',after:{desc:'Group lunch',amount:1901,paidBy:'P',split:['A','P','S']}};
  await assertFails(setDoc(u.exp('missing-audit'),base));
  {
   const b=writeBatch(a);b.set(u.exp('e1'),base);b.set(u.log('ex_e1_1'),addLog);
   await assertSucceeds(b.commit());
  }
  await assertSucceeds(getDoc(u.exp('e1')));
  await assertFails(setDoc(u.exp('e2'),{...base,ownerUid:'member-S'}));
  await assertFails(setDoc(bad.exp('evil'),{...base,by:'P'}));
  await assertFails(deleteDoc(u.log('ex_e1_1')));
  await assertFails(setDoc(u.log('ex_e1_1'),{...addLog,text:'forged'}));

  const edited={...base,desc:'Dinner',amount:2401,paidBy:'S',split:['S'],rev:2,
   actorUid:'member-S',updatedBy:'S',updatedAt:'2026-11-26T01:00:00Z'};
  const editLog={kind:'expense',act:'edited',expenseId:'e1',rev:2,who:'S',actorUid:'member-S',
   at:'2026-11-26T01:00:00Z',text:'Changed',
   before:{desc:'Group lunch',amount:1901,paidBy:'P',split:['A','P','S']},
   after:{desc:'Dinner',amount:2401,paidBy:'S',split:['S']}};
  {
   const b=writeBatch(s);b.set(v.exp('e1'),edited);b.set(v.log('ex_e1_2'),editLog);
   await assertSucceeds(b.commit());
  }
  {
   const b=writeBatch(a);b.set(u.exp('e1'),{...edited,rev:2,actorUid:'member-A',updatedBy:'A'});
   b.set(u.log('ex_e1_2'),{...editLog,actorUid:'member-A',who:'A'});
   await assertFails(b.commit());
  }
  await assertFails(setDoc(v.exp('e1'),{...edited,rev:3,amount:5000}));
  {
   const b=writeBatch(s);
   const deletion={kind:'expense',act:'removed',expenseId:'e1',rev:3,who:'S',actorUid:'member-S',
    at:'2026-11-26T02:00:00Z',text:'Deleted',
    before:{desc:'Dinner',amount:2401,paidBy:'S',split:['S']}};
   b.delete(v.exp('e1'));
   b.set(v.log('ex_e1_3'),deletion);
   b.set(doc(s,'trips/main/deleted/e1'),{at:'2026-11-26T02:00:00Z',by:'S'});
   await assertSucceeds(b.commit());
  }
  await assertSucceeds(getDoc(v.log('ex_e1_3')));
  await assertFails(deleteDoc(v.log('ex_e1_3')));
  await assertFails(getDoc(bad.log('ex_e1_1')));
  assert.equal((await getDoc(v.exp('e1'))).exists(),false);
  console.log('PASS Firebase emulator: owner/member gates, outsider denial, flight privacy, atomic expense audits, stale revision rejection, immutable history');
 }finally{await env.cleanup();}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
