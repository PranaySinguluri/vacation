'use strict';
/* Run: node tests/expense-splits.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const script = html.match(new RegExp('<script id="core">([\\s\\S]*?)</script>'));
assert.ok(script, 'core script exists');
const sandbox = {module:{exports:{}}, TextEncoder, TextDecoder, Uint8Array};
vm.runInNewContext(script[1],sandbox);
const C = sandbox.module.exports;
const ids = ['A','D','H','M','P','R','S'];
let count=0;
function check(name, fn){fn();count++;console.log('PASS',name);}
for(let n=1;n<=7;n++){
  for(const cents of [0,1,2,3,10,99,100,101,1000,1001,7000,999999]){
    check(cents+' cents / '+n+' travelers',()=>{
      const sh=C.shares(cents,ids.slice(0,n)),v=Object.values(sh);
      assert.equal(v.reduce((a,b)=>a+b,0),cents);
      assert.ok(Math.max(...v)-Math.min(...v)<=1);
      assert.ok(v.every(Number.isSafeInteger));
    });
  }
}
check('negative amount rejected',()=>assert.throws(()=>C.shares(-1,['A','P']),/nonnegative/));
check('fractional cents rejected',()=>assert.throws(()=>C.shares(1.5,['A']),/integer/));
check('empty split rejected',()=>assert.throws(()=>C.shares(100,[]),/traveler/));
check('duplicate participants rejected',()=>assert.throws(()=>C.shares(100,['A','A']),/twice/));
check('unknown id format rejected',()=>assert.throws(()=>C.shares(100,['']),/valid traveler/));
const people=ids.map(id=>({id}));
function trip(expenses,payments=[]){return {people,expenses,payments};}
check('payer not included in split',()=>{
  const b=C.balances(trip([{amount:1000,paidBy:'P',split:['A','R']}]));
  assert.equal(b.P,1000);assert.equal(b.A,-500);assert.equal(b.R,-500);
});
check('two different payers',()=>{
  const b=C.balances(trip([{amount:700,paidBy:'P',split:['P','R']},{amount:500,paidBy:'R',split:['P','R']}]));
  assert.equal(b.P,100);assert.equal(b.R,-100);
});
check('partial settlement',()=>{
  const b=C.balances(trip([{amount:1000,paidBy:'P',split:['P','R']}],[{from:'R',to:'P',amount:200}]));
  assert.equal(b.P,300);assert.equal(b.R,-300);
});
check('full settlement',()=>{
  const b=C.balances(trip([{amount:1000,paidBy:'P',split:['P','R']}],[{from:'R',to:'P',amount:500}]));
  assert.equal(b.P,0);assert.equal(b.R,0);
});
check('settlement suggestions sum correctly',()=>{
  const b=C.balances(trip([{amount:1001,paidBy:'P',split:ids}]));
  const settlements=C.settle(b);
  assert.equal(settlements.reduce((sum,p)=>sum+p.amount,0),1001-C.shares(1001,ids).P);
});
check('empty ledger',()=>assert.ok(Object.values(C.balances(trip([]))).every(x=>x===0)));
check('edit form restores category',()=>assert.ok(html.includes("editExpense && (editExpense.category||'Other')===c")));
check('shared form validates selected travelers',()=>assert.ok(html.includes('new Set(split).size!==split.length')));
console.log('Passed '+count+' expense split regression checks.');
