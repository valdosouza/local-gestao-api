const test=require('node:test'),assert=require('node:assert/strict');
const {totals}=require('../src/autocenter/document');
test('agrega subtotais Currency antes de arredondar o total',()=>{const i={type:'P',quantity:1,unitPrice:0.0046,discountValue:0};assert.equal(totals([i,i],{freight:0,additional:0}).total,0.01);});
