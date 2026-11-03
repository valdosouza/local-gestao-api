'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate,hash}=require('../src/autocenter/document');
const {accessories}=require('../src/autocenter/maps');
const {fixture}=require('./fixtures/autocenter');
test('totaliza peças, serviço e desconto uma vez, preservando quantidade fracionária',()=>{
 const doc=fixture(),t=validate(doc);assert.equal(t.products,25.31);assert.equal(t.services,30);assert.equal(t.discount,3);assert.equal(t.total,64.31);assert.equal(t.quantity,2.5);assert.equal(doc.items[0].quantity,2.5);
});
test('rejeita datas inexistentes, NaN, tipo errado, ID duplicado e preço inválido',()=>{
 for(const change of [d=>d.header.date='2026-02-30',d=>d.items[0].quantity=NaN,d=>d.items[0].unitPrice=-1,d=>d.items[0].type='X',d=>{d.items[0].id=9;d.items[1].id=9;},d=>d.items[0].discountValue=100]){
  const d=fixture();change(d);assert.throws(()=>validate(d),e=>e.status===400);
 }
});
test('checklist preserva ordem e não aceita inspeção incompleta ou quinto código',()=>{
 for(let i=0;i<22;i++)for(const state of ['N','R','Q','A']){const d=fixture();d.checklist.regions='N'.repeat(i)+state+'N'.repeat(21-i);validate(d);assert.equal(d.checklist.regions[i],state);}
 for(const value of ['N'.repeat(21),'N'.repeat(21)+'_','N'.repeat(23)]){const d=fixture();d.checklist.regions=value;assert.throws(()=>validate(d));}
 const d=fixture();delete d.checklist.MANUAL;assert.throws(()=>validate(d));
});
test('versão muda com qualquer dado e é estável com ordem das propriedades',()=>{
 assert.equal(hash({a:1,b:2}),hash({b:2,a:1}));assert.notEqual(hash(fixture()),hash({...fixture(),items:[]}));
});
module.exports={fixture};
