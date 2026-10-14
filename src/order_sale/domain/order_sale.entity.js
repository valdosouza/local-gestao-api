'use strict';

/**
 * Entidade OrderSale — espelho de TB_PEDIDO.
 * Mapeada a partir do modelo Delphi TPedido (tblPedido.pas).
 */
class OrderSale {
  constructor(row) {
    this.id                  = row.PED_CODIGO;
    this.number              = row.PED_NUMERO          ?? null;
    this.type                = row.PED_TIPO            ?? null;
    this.userId              = row.PED_CODUSU          ?? null;
    this.date                = row.PED_DATA            ?? null;
    this.hour                = row.PED_HORA            ?? null;
    this.customerId          = row.PED_CODEMP          ?? null;
    this.salesmanId          = row.PED_CODVDO          ?? null;
    this.paymentTypeId       = row.PED_CODFPG          ?? null;
    this.paymentTerms        = row.PED_PRAZO           ? row.PED_PRAZO.trim()  : null;
    this.addressId           = row.PED_CODEND          ?? null;
    this.quantityProducts    = Number(row.PED_QT_PRODUTO  ?? 0);
    this.totalProducts       = Number(row.PED_VL_PRODUTO  ?? 0);
    this.ipi                 = Number(row.PED_VL_IPI      ?? 0);
    this.freight             = Number(row.PED_VL_FRETE    ?? 0);
    this.discountPercent     = Number(row.PED_ALIQ_DESCONTO ?? 0);
    this.discount            = Number(row.PED_VL_DESCONTO ?? 0);
    this.total               = Number(row.PED_VL_PEDIDO   ?? 0);
    this.invoiced            = row.PED_FATURADO        ? row.PED_FATURADO.trim() : 'N';
    this.deliveryAddressId   = row.PED_CODENT          ?? null;
    this.billingAddressId    = row.PED_CODFAT          ?? null;
    this.collectionAddressId = row.PED_CODCOB          ?? null;
    this.institutionId       = row.PED_CODMHA          ?? null;
    this.observation         = row.PED_OBS != null      ? String(row.PED_OBS).trim() : null;
    this.presenceIndicator   = row.PED_INDPRES         ?? 2;
    this.terminal            = row.PED_TERMINAL        ?? 0;
    this.deliveryDate        = row.PED_DT_ENTREGA      ?? null;
    this.approved            = row.PED_APROVADO        ? row.PED_APROVADO.trim() : 'N';
    this.budgetId            = row.PED_NUM_ORCA        ?? null;
    this.webId               = row.PED_CODWEB          ?? null;
    this.webNumber           = row.PED_NUMWEB          ?? null;
    this.carrierCode         = row.PED_CODTRP          ?? null;
    this.natureCode          = row.PED_CODNAT          ?? null;
    this.updatedAt           = row.PED_DT_ALTERA       ?? null;
    // Vínculo em TB_PEDIDO_FROM_EXTERIOR (código do sistema de origem e KIND: API, MAGAZORD...)
    this.externalId          = row.ID_EXTERIOR         ? String(row.ID_EXTERIOR).trim() : null;
    this.externalSource      = row.KIND                ? String(row.KIND).trim()        : null;
  }

  toJSON() {
    return {
      id:                  this.id,
      externalId:          this.externalId,
      externalSource:      this.externalSource,
      number:              this.number,
      type:                this.type,
      userId:              this.userId,
      date:                this.date,
      hour:                this.hour,
      customerId:          this.customerId,
      salesmanId:          this.salesmanId,
      paymentTypeId:       this.paymentTypeId,
      paymentTerms:        this.paymentTerms,
      addressId:           this.addressId,
      quantityProducts:    this.quantityProducts,
      totalProducts:       this.totalProducts,
      ipi:                 this.ipi,
      freight:             this.freight,
      discountPercent:     this.discountPercent,
      discount:            this.discount,
      total:               this.total,
      invoiced:            this.invoiced,
      deliveryAddressId:   this.deliveryAddressId,
      billingAddressId:    this.billingAddressId,
      collectionAddressId: this.collectionAddressId,
      institutionId:       this.institutionId,
      observation:         this.observation,
      presenceIndicator:   this.presenceIndicator,
      terminal:            this.terminal,
      deliveryDate:        this.deliveryDate,
      approved:            this.approved,
      budgetId:            this.budgetId,
      webId:               this.webId,
      webNumber:           this.webNumber,
      carrierCode:         this.carrierCode,
      natureCode:          this.natureCode,
      updatedAt:           this.updatedAt,
    };
  }
}

module.exports = OrderSale;
