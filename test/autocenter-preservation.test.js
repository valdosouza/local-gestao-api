'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../src/autocenter/document'),{fixture}=require('./fixtures/autocenter');
test('campos legados incompletos não são normalizados ao alterar somente itens',()=>{
 const d=fixture();d.vehicleDirty=false;d.checklistDirty=false;d.vehicle.colorId=null;d.checklist.regions=null;
 validate(d);assert.equal(d.vehicle.colorId,null);assert.equal(d.checklist.regions,null);
 d.checklistDirty=true;assert.throws(()=>validate(d));
});
test('alterar o veículo exige cadastro auxiliar válido',()=>{
 const d=fixture();d.vehicle.colorId=0;assert.throws(()=>validate(d));
});
