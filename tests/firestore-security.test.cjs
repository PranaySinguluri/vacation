const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,deleteDoc,updateDoc}=require('firebase/firestore');
const fs=require('node:fs');
const test=require('node:test');
test('Trip wallet authorization',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-trip-wallet',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 const path=(c,id)=>'trips/main/'+c+'/'+id;
 const ctx=(id,email)=>env.authenticatedContext(id,{email,email_verified:true}).firestore();
 const a=ctx('a','a@example.com'), outsider=ctx('x','x@example.com'), admin=ctx('p','singuluripranay@gmail.com');
 const e={desc:'Gas',amount:1000,paidBy:'A',split:['A','P'],date:'2026-12-24',by:'A',at:'2026-12-24T00:00:00Z'};
 try {
 await env.clearFirestore();
 await assertFails(setDoc(doc(outsider,path('members','x')),{person:'A'}));
 await assertSucceeds(setDoc(doc(admin,path('members','a')),{person:'A'}));
 await assertFails(updateDoc(doc(a,path('members','a')),{person:'P'}));
 await assertSucceeds(setDoc(doc(a,path('expenses','e')),e));
 await assertFails(getDoc(doc(outsider,path('expenses','e'))));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path('expenses','e'))));
 for(const bad of [{amount:-1},{amount:1.5},{by:'P'},{split:['A','A']},{split:['X']},{split:[]},{paidBy:'X'},{currency:'CAD'}]) await assertFails(setDoc(doc(a,path('expenses','bad')),{...e,...bad}));
 await assertFails(updateDoc(doc(a,path('expenses','e')),{amount:2}));
 await assertFails(deleteDoc(doc(a,path('expenses','e'))));
 await assertSucceeds(updateDoc(doc(admin,path('expenses','e')),{amount:2000}));
 const p={from:'A',to:'P',amount:100,date:e.date,by:'A',at:e.at};
 await assertSucceeds(setDoc(doc(a,path('payments','p')),p));
 await assertFails(setDoc(doc(a,path('payments','bad')),{...p,from:'P',to:'A'}));
 const l={who:'A',act:'added',text:'Gas',at:e.at};
 await assertSucceeds(setDoc(doc(a,path('log','l')),l));
 await assertFails(setDoc(doc(a,path('log','bad')),{...l,who:'P'}));
 await assertFails(deleteDoc(doc(admin,path('log','l'))));
 await assertSucceeds(deleteDoc(doc(admin,path('members','a'))));
 await assertFails(getDoc(doc(a,path('expenses','e'))));
 } finally {await env.cleanup();}
});
