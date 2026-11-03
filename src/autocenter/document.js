'use strict';
const {createHash}=require('node:crypto');
const maps=require('./maps');
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function number(value,name,max=99999999.99,scale=2){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||Math.abs(value*10**scale-Math.round(value*10**scale))>0.001)fail(`Valor inválido: ${name}.`);
 return value;
}
function text(value,name,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Campo inválido: ${name}.`);return value.trim();}
function id(v,name){if(!Number.isSafeInteger(v)||v<=0||v>2147483647)fail(`Código inválido: ${name}.`);return v;}
function day(v,name){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(`Data inválida: ${name}.`);return v;}
function legacyDay(v,name){if(!v)return '';if(!/^\d{2}\/\d{2}\/\d{4}$/.test(v))fail(`Use DD/MM/AAAA: ${name}.`);day(v.slice(6)+'-'+v.slice(3,5)+'-'+v.slice(0,2),name);return v;}
function hour(v,name){if(v&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail(`Use HH:MM: ${name}.`);return v;}
function cents(v){return Math.round((v+Number.EPSILON)*100);}
function totals(items,h){
 let products=0,services=0,discount=0,quantity=0;
 for(const i of items){const gross=Math.round(i.quantity*i.unitPrice*10000);if(i.type==='S')services+=gross;else{products+=gross;quantity+=i.quantity;}discount+=cents(i.discountValue);}
 products=Math.round(products/100);services=Math.round(services/100);
 return {products:products/100,services:services/100,discount:discount/100,quantity:Math.round(quantity*100)/100,
  total:(products+services-discount+cents(h.freight)+cents(h.additional))/100,
  discountPercent:products+services?Math.round(discount/(products+services)*10000)/100:0};
}
function validate(input){
 if(!input||typeof input!=='object'||!Array.isArray(input.items)||input.items.length>500)fail('Documento ou itens inválidos.');
 const h=input.header;if(!h)fail('Cabeçalho ausente.');
 id(h.customerId,'cliente');id(h.paymentTypeId,'pagamento');day(h.date,'orçamento');
 text(h.customerName,'cliente',100,true);text(h.paymentTerms??'','prazo',100);text(h.contact??'','contato',100);text(h.notes??'','observação',16000);
 number(h.freight??0,'frete');number(h.additional??0,'adicional');h.freight??=0;h.additional??=0;
 const seen=new Set();
 for(const i of input.items){
  if(!['P','S'].includes(i.type))fail('Tipo do item deve ser P ou S.');id(i.productId,'produto/serviço');text(i.description,'descrição',100,true);
  number(i.quantity,'quantidade',9999999.999,3);if(!i.quantity)fail('Quantidade deve ser maior que zero.');number(i.unitPrice,'preço',99999999.999999,6);
  number(i.discountValue??0,'desconto');i.discountValue??=0;
  if(cents(i.discountValue)>cents(i.quantity*i.unitPrice))fail('Desconto maior que o subtotal.');
  i.discountPercent=i.quantity*i.unitPrice?Math.round(i.discountValue/(i.quantity*i.unitPrice)*10000)/100:0;
  if(i.id){id(i.id,'item');if(seen.has(i.id))fail('Item repetido.');seen.add(i.id);}
 }
 const v=input.vehicle;
 if(v && input.vehicleDirty!==false){text(v.plate,'placa',7,true);if(!/^[A-Z0-9]{7}$/.test(v.plate))fail('Placa deve conter 7 letras/números sem hífen.');
  for(const k of ['brandId','modelId','kindId','colorId'])id(v[k],k);
  for(const [k,max] of Object.entries({fleet:30,year:4,km:15,chassis:50,notes:16000}))text(v[k]??'',k,max);
  if(v.year&&!/^\d{4}$/.test(v.year))fail('Ano deve ter quatro dígitos.');number(v.engine??0,'cilindrada',999999,0);
  legacyDay(v.exitDate??'','saída');hour(v.exitHour??'','saída');
 }
 const c=input.checklist;
 if(c && input.checklistDirty!==false){if(!v)fail('Checklist precisa de veículo.');if(!/^[NRQA]{22}$/.test(c.regions))fail('Confira as 22 regiões antes de enviar o checklist.');
  for(const k of ['frontTyre','backTyre','spareTyre'])if(!['R','B','E'].includes(c[k]))fail('Confira os três pneus.');
  if(!['1','2','3','4','5'].includes(c.fuel)||!['08','16','20','24'].includes(c.valves))fail('Confira combustível e válvulas.');
  for(const k of maps.accessories)if(!['S','N'].includes(c[k]))fail('Confira os acessórios.');
  text(c.km??'','quilometragem',25);text(c.prism??'','prisma',10);text(c.notes??'','observação da inspeção',16000);
  legacyDay(c.entryDate??'','entrada');hour(c.entryHour??'','entrada');
 }
 const t=totals(input.items,h);if(t.total<0||t.total>99999999.99)fail('Total fora do limite.');return t;
}
function canonical(value){if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function hash(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
module.exports={validate,totals,hash,fail,id};
