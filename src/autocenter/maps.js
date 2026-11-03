'use strict';
// Campos verificados no schema do cliente em 2026-11-02. IDs de orçamento/pedido
// do vínculo NÃO são código de cadastro de veículo: TB_VEHICLE_ID guarda placa.
const header={customerId:'CTC_CODEMP',customerName:'CTC_FANTASIA',date:'CTC_DATA',paymentTypeId:'CTC_CODFPG',paymentTerms:'CTC_PRAZO',contact:'CTC_CONTATO',notes:'CTC_OBS',freight:'CTC_VL_FRETE',additional:'CTC_VL_ADICIONAL'};
const item={type:'ICT_TIPO',productId:'ICT_CODVCL',description:'ICT_DESCRICAO',quantity:'ICT_QTDE',unitPrice:'ICT_VL_UNIT',discountValue:'ICT_VL_DESC',discountPercent:'ICT_AQ_DESC',stockId:'ICT_CODEST',priceListId:'ICT_CODTPR'};
const vehicle={plate:'VEI_PLACA',fleet:'VEI_FROTA',kindId:'VEI_CODTPV',brandId:'VEI_CODMRC',modelId:'VEI_CODMOD',year:'VEI_ANO',colorId:'VEI_CODCOR',km:'VEI_KM',chassis:'VEI_CHASSI',engine:'VEI_CILINDRADA'};
const link={plate:'TB_VEHICLE_ID',notes:'OBS',exitDate:'EXIT_DATE',exitHour:'EXIT_HOUR'};
const accessories=['HOIST','MANUAL','EXTINGUISHER','RADIO','ABS','HYDRAULIC_STEERING','HUB_CAPS','HOT_AIR','TRIANGLE','WRENCH','AERIAL','CIGARETTE_LIGHTER','CONDITIONED_AIR','OTHER','DOCTS','CARPET'];
const checklist={regions:'CHECKLIST',frontTyre:'FRONT_TYRE',backTyre:'BACK_TYRE',spareTyre:'STEPE_TYRE',fuel:'FUEL',valves:'VALVES',km:'KM',notes:'OBS',entryDate:'ENTRANCE_DATE',entryHour:'ENTRANCE_HOUR',prism:'PRISMA',...Object.fromEntries(accessories.map(k=>[k,k]))};
function pick(row,map){return Object.fromEntries(Object.entries(map).map(([k,c])=>[k,row[c]??null]));}
module.exports={header,item,vehicle,link,checklist,accessories,pick};
