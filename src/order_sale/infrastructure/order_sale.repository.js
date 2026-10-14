'use strict';

const { query, queryInTransaction, runQuery, inTransaction } = require('../../config/database');
const OrderSale = require('../domain/order_sale.entity');

const SELECT_COLS = `
  PED_CODIGO, PED_NUMERO, PED_TIPO, PED_CODUSU, PED_DATA, PED_HORA,
  PED_CODEMP, PED_CODVDO, PED_CODFPG, PED_PRAZO, PED_CODEND,
  PED_QT_PRODUTO, PED_VL_PRODUTO, PED_VL_IPI, PED_VL_FRETE,
  PED_ALIQ_DESCONTO, PED_VL_DESCONTO, PED_VL_PEDIDO, PED_FATURADO,
  PED_CODENT, PED_CODFAT, PED_CODCOB, PED_CODMHA,
  CAST(PED_OBS AS VARCHAR(2000)) AS PED_OBS, PED_INDPRES, PED_TERMINAL, PED_DT_ENTREGA,
  PED_APROVADO, PED_NUM_ORCA, PED_CODWEB, PED_NUMWEB,
  PED_CODTRP, PED_CODNAT, PED_DT_ALTERA
`;

class OrderSaleRepository {
  /**
   * Monta as entidades com o código externo de TB_PEDIDO_FROM_EXTERIOR.
   * Uma única consulta para a página inteira (a tabela não tem índice em TB_PEDIDO_ID,
   * e um JOIN varreria a tabela uma vez por pedido). Se houver mais de um vínculo
   * para o mesmo pedido, prevalece o da API.
   * @returns {Promise<OrderSale[]>}
   */
  async #withExternalLinks(rows, trx = null) {
    if (!rows.length) return [];

    const ids = rows.map((r) => Number(r.PED_CODIGO));
    const links = await runQuery(trx,
      `SELECT TB_PEDIDO_ID, ID_EXTERIOR, KIND
       FROM TB_PEDIDO_FROM_EXTERIOR
       WHERE TB_PEDIDO_ID IN (${ids.map(() => '?').join(', ')})`,
      ids
    );

    const byOrder = new Map();
    for (const link of links) {
      const isApi = String(link.KIND).trim() === 'API';
      if (!byOrder.has(link.TB_PEDIDO_ID) || isApi) byOrder.set(link.TB_PEDIDO_ID, link);
    }

    return rows.map((r) => {
      const link = byOrder.get(r.PED_CODIGO);
      return new OrderSale({ ...r, ID_EXTERIOR: link?.ID_EXTERIOR, KIND: link?.KIND });
    });
  }

  /**
   * Lista pedidos de venda com filtros e paginação.
   */
  async findAll({ limit = 20, offset = 0, filters = {} } = {}) {
    const conditions = ['p.PED_TIPO = 1'];
    const params = [];

    // Código externo: resolve antes os números internos vinculados (qualquer origem) e filtra
    // pela PK. IN (subconsulta) no Firebird 2.5 vira busca correlacionada, pedido a pedido.
    if (filters.externalId !== undefined && filters.externalId !== '') {
      const externalId = String(filters.externalId).trim();
      // ID_EXTERIOR é VARCHAR(50) WIN1252: código maior ou com caractere fora disso não existe
      // (e o parâmetro daria erro de truncamento/transliteração no Firebird)
      if (externalId.length > 50 || [...externalId].some((ch) => ch.codePointAt(0) > 0xFF)) {
        return { data: [], total: 0 };
      }
      const links = await query(
        'SELECT TB_PEDIDO_ID FROM TB_PEDIDO_FROM_EXTERIOR WHERE ID_EXTERIOR = ?',
        [externalId]
      );
      const ids = [...new Set(links.map((l) => Number(l.TB_PEDIDO_ID)))].filter(Number.isFinite);
      if (!ids.length) return { data: [], total: 0 };
      conditions.push(`p.PED_CODIGO IN (${ids.map(() => '?').join(', ')})`);
      params.push(...ids);
    }

    if (filters.institutionId) {
      conditions.push('p.PED_CODMHA = ?');
      params.push(Number(filters.institutionId));
    }
    if (filters.customerId) {
      conditions.push('p.PED_CODEMP = ?');
      params.push(Number(filters.customerId));
    }
    if (filters.salesmanId) {
      conditions.push('p.PED_CODVDO = ?');
      params.push(Number(filters.salesmanId));
    }
    if (filters.userId) {
      conditions.push('p.PED_CODUSU = ?');
      params.push(Number(filters.userId));
    }
    if (filters.invoiced) {
      conditions.push('p.PED_FATURADO = ?');
      params.push(filters.invoiced);
    }
    if (filters.dateFrom) {
      conditions.push('p.PED_DATA >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('p.PED_DATA <= ?');
      params.push(filters.dateTo);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) AS TOTAL FROM TB_PEDIDO p ${where}`,
      params
    );
    const total = Number(countResult[0]?.TOTAL ?? 0);

    const rows = await query(
      `SELECT FIRST ? SKIP ? ${SELECT_COLS} FROM TB_PEDIDO p ${where} ORDER BY p.PED_CODIGO DESC`,
      [Number(limit), Number(offset), ...params]
    );

    return { data: await this.#withExternalLinks(rows), total };
  }

  /**
   * Busca pedido pelo ID (PED_CODIGO).
   * @returns {Promise<OrderSale|null>}
   */
  async findById(id, trx = null) {
    const rows = await runQuery(trx,
      `SELECT ${SELECT_COLS} FROM TB_PEDIDO p WHERE p.PED_CODIGO = ?`,
      [Number(id)]
    );
    if (!rows.length) return null;
    const [order] = await this.#withExternalLinks(rows, trx);
    return order;
  }

  /**
   * Próximo PED_CODIGO pelo gerador GN_PEDIDO (o mesmo do ERP; nunca MAX + 1).
   * Geradores não voltam no rollback: um pedido não gravado deixa um número sem uso.
   */
  async nextId(trx = null) {
    const genRows = await runQuery(trx, 'SELECT GEN_ID(GN_PEDIDO, 1) AS NEW_ID FROM RDB$DATABASE');
    return genRows[0].NEW_ID;
  }

  /**
   * Insere um novo pedido de venda. Usa data.id se já reservado com nextId().
   * Com trx, grava dentro dela; sem trx, numa transação própria.
   * @returns {Promise<OrderSale>}
   */
  async create(data, trx = null) {
    const newId = data.id ?? await this.nextId(trx);

    await inTransaction(trx, async (t) => {
      await queryInTransaction(t, `
        INSERT INTO TB_PEDIDO (
          PED_CODIGO, PED_TIPO, PED_CODUSU, PED_DATA, PED_HORA,
          PED_CODEMP, PED_CODVDO, PED_CODFPG, PED_PRAZO, PED_CODEND,
          PED_QT_PRODUTO, PED_VL_PRODUTO, PED_VL_IPI, PED_VL_FRETE,
          PED_ALIQ_DESCONTO, PED_VL_DESCONTO, PED_VL_PEDIDO, PED_FATURADO,
          PED_CODENT, PED_CODFAT, PED_CODCOB, PED_CODMHA,
          PED_OBS, PED_INDPRES, PED_TERMINAL, PED_DT_ENTREGA,
          PED_APROVADO, PED_NUM_ORCA, PED_CODTRP, PED_CODNAT
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `, [
        newId,
        data.type              ?? 1,
        data.userId,
        data.date,
        data.hour              ?? null,
        data.customerId        ?? null,
        data.salesmanId        ?? null,
        data.paymentTypeId     ?? null,
        data.paymentTerms      ?? null,
        data.addressId         ?? null,
        data.quantityProducts  ?? 0,
        data.totalProducts     ?? 0,
        data.ipi               ?? 0,
        data.freight           ?? 0,
        data.discountPercent   ?? 0,
        data.discount          ?? 0,
        data.total             ?? 0,
        data.invoiced          ?? 'N',
        data.deliveryAddressId ?? data.addressId ?? null,
        data.billingAddressId  ?? null,
        data.collectionAddressId ?? null,
        data.institutionId     ?? null,
        data.observation       ?? null,
        data.presenceIndicator ?? 2,
        data.terminal          ?? 0,
        data.deliveryDate      ?? null,
        data.approved          ?? 'N',
        data.budgetId          ?? null,
        data.carrierCode       ?? null,
        data.natureCode        ?? null,
      ]);
    });

    // Retorna o objeto criado sem fazer query adicional
    // (evita problema de isolamento de transação)
    return new OrderSale({
      PED_CODIGO:         newId,
      PED_NUMERO:         null,
      PED_TIPO:           data.type ?? 1,
      PED_CODUSU:         data.userId,
      PED_DATA:           data.date,
      PED_HORA:           data.hour ?? null,
      PED_CODEMP:         data.customerId ?? null,
      PED_CODVDO:         data.salesmanId ?? null,
      PED_CODFPG:         data.paymentTypeId ?? null,
      PED_PRAZO:          data.paymentTerms ?? null,
      PED_CODEND:         data.addressId ?? null,
      PED_QT_PRODUTO:     data.quantityProducts ?? 0,
      PED_VL_PRODUTO:     data.totalProducts ?? 0,
      PED_VL_IPI:         data.ipi ?? 0,
      PED_VL_FRETE:       data.freight ?? 0,
      PED_ALIQ_DESCONTO:  data.discountPercent ?? 0,
      PED_VL_DESCONTO:    data.discount ?? 0,
      PED_VL_PEDIDO:      data.total ?? 0,
      PED_FATURADO:       data.invoiced ?? 'N',
      PED_CODENT:         data.deliveryAddressId ?? data.addressId ?? null,
      PED_CODFAT:         data.billingAddressId ?? null,
      PED_CODCOB:         data.collectionAddressId ?? null,
      PED_CODMHA:         data.institutionId ?? null,
      PED_OBS:            data.observation ?? null,
      PED_INDPRES:        data.presenceIndicator ?? 2,
      PED_TERMINAL:       data.terminal ?? 0,
      PED_DT_ENTREGA:     data.deliveryDate ?? null,
      PED_APROVADO:       data.approved ?? 'N',
      PED_NUM_ORCA:       data.budgetId ?? null,
      PED_CODWEB:         null,
      PED_NUMWEB:         null,
      PED_CODTRP:         data.carrierCode ?? null,
      PED_CODNAT:         data.natureCode ?? null,
      PED_DT_ALTERA:      null,
    });
  }

  /**
   * Atualiza campos de um pedido (patch parcial).
   * @returns {Promise<OrderSale>}
   */
  async update(id, data) {
    const fields = [];
    const params = [];

    const map = {
      type:                'PED_TIPO',
      userId:              'PED_CODUSU',
      date:                'PED_DATA',
      customerId:          'PED_CODEMP',
      salesmanId:          'PED_CODVDO',
      paymentTypeId:       'PED_CODFPG',
      paymentTerms:        'PED_PRAZO',
      addressId:           'PED_CODEND',
      quantityProducts:    'PED_QT_PRODUTO',
      totalProducts:       'PED_VL_PRODUTO',
      ipi:                 'PED_VL_IPI',
      freight:             'PED_VL_FRETE',
      discountPercent:     'PED_ALIQ_DESCONTO',
      discount:            'PED_VL_DESCONTO',
      total:               'PED_VL_PEDIDO',
      invoiced:            'PED_FATURADO',
      deliveryAddressId:   'PED_CODENT',
      billingAddressId:    'PED_CODFAT',
      collectionAddressId: 'PED_CODCOB',
      institutionId:       'PED_CODMHA',
      observation:         'PED_OBS',
      presenceIndicator:   'PED_INDPRES',
      terminal:            'PED_TERMINAL',
      deliveryDate:        'PED_DT_ENTREGA',
      approved:            'PED_APROVADO',
      budgetId:            'PED_NUM_ORCA',
      carrierCode:         'PED_CODTRP',
      natureCode:          'PED_CODNAT',
    };

    for (const [jsKey, dbCol] of Object.entries(map)) {
      if (data[jsKey] !== undefined) {
        fields.push(`${dbCol} = ?`);
        params.push(data[jsKey]);
      }
    }

    if (!fields.length) return this.findById(id);

    params.push(Number(id));
    await query(
      `UPDATE TB_PEDIDO SET ${fields.join(', ')} WHERE PED_CODIGO = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * Remove um pedido pelo ID.
   * Referência Delphi: Pedido.delete (GeraPedidoCompleto, linha 271).
   */
  async delete(id) {
    await query('DELETE FROM TB_PEDIDO WHERE PED_CODIGO = ?', [Number(id)]);
  }

  /**
   * NÃO MAIS UTILIZADO — ver reverseStockEntries em stock_control.repository
   * (Mantém compatibilidade, mas não faz nada)
   */
  async deleteStockEntries(orderId) {
    // Desabilitado: usar reverseStockEntries para manter rastreamento de estoque
  }

  // ---------------------------------------------------------------------------
  // TB_PEDIDO_FROM_EXTERIOR
  // ---------------------------------------------------------------------------

  /**
   * Busca vínculo externo por código externo e kind.
   */
  async findFromExterior(externalId, kind, trx = null) {
    const rows = await runQuery(trx,
      `SELECT ID_EXTERIOR, KIND, TB_PEDIDO_ID
       FROM TB_PEDIDO_FROM_EXTERIOR
       WHERE ID_EXTERIOR = ? AND KIND = ?`,
      [String(externalId), kind]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      externalId: r.ID_EXTERIOR ? r.ID_EXTERIOR.trim() : null,
      kind:       r.KIND ? r.KIND.trim() : null,
      orderId:    r.TB_PEDIDO_ID,
    };
  }

  /**
   * Insere vínculo externo em TB_PEDIDO_FROM_EXTERIOR.
   * Referência Delphi: GeraVinculoFromExterior (linha 364).
   */
  async insertFromExterior(externalId, kind, orderId, trx = null) {
    await runQuery(trx,
      `INSERT INTO TB_PEDIDO_FROM_EXTERIOR (ID_EXTERIOR, KIND, TB_PEDIDO_ID)
       VALUES (?, ?, ?)`,
      [String(externalId), kind, Number(orderId)]
    );
  }

  /**
   * Remove vínculo externo.
   */
  async deleteFromExterior(externalId, kind, trx = null) {
    await runQuery(trx,
      `DELETE FROM TB_PEDIDO_FROM_EXTERIOR WHERE ID_EXTERIOR = ? AND KIND = ?`,
      [String(externalId), kind]
    );
  }

  // ---------------------------------------------------------------------------
  // TB_EMPRESA / TB_CLIENTE / TB_ENDERECO — cadastro de cliente
  // ---------------------------------------------------------------------------

  /**
   * Busca empresa pelo CPF/CNPJ (remove caracteres especiais).
   */
  async findEmpresaByDocument(fiscalDocument, trx = null) {
    const doc = fiscalDocument.replace(/[.\-/]/g, '');
    const rows = await runQuery(trx,
      `SELECT EMP_CODIGO, EMP_NOME, EMP_CNPJ, EMP_PESSOA
       FROM TB_EMPRESA
       WHERE EMP_CNPJ = ?`,
      [doc]
    );
    if (!rows.length) return null;
    return {
      id:     rows[0].EMP_CODIGO,
      name:   rows[0].EMP_NOME ? rows[0].EMP_NOME.trim() : null,
      cnpj:   rows[0].EMP_CNPJ ? rows[0].EMP_CNPJ.trim() : null,
      person: rows[0].EMP_PESSOA ? rows[0].EMP_PESSOA.trim() : null,
    };
  }

  /**
   * Verifica se já existe registro em TB_CLIENTE para o EMP_CODIGO.
   */
  async clienteExists(empCodigo, trx = null) {
    const rows = await runQuery(trx,
      `SELECT CLI_CODEMP FROM TB_CLIENTE WHERE CLI_CODEMP = ?`,
      [Number(empCodigo)]
    );
    return rows.length > 0;
  }

  /**
   * Cria empresa (TB_EMPRESA).
   * Referência Delphi: CreateEmpresaSetes (linha 172).
   */
  async createEmpresa(data, trx = null) {
    const genRows = await runQuery(trx, 'SELECT GEN_ID(GN_EMPRESA, 1) AS NEW_ID FROM RDB$DATABASE');
    const newId = genRows[0].NEW_ID;
    const doc = (data.fiscalDocument || '').replace(/[.\-/]/g, '');
    const tipoPessoa = doc.length === 14 ? 'J' : 'F';

    await inTransaction(trx, async (t) => {
      await queryInTransaction(t, `
        INSERT INTO TB_EMPRESA (
          EMP_CODIGO, EMP_TIPO, EMP_NOME, EMP_FANTASIA, EMP_INSC_EST,
          EMP_STCRED, EMP_OBSERV, EMP_DT_CADASTRO, EMP_PESSOA, EMP_CNPJ,
          EMP_VL_CRED, EMP_CODVDOR, EMP_ML_DRT, EMP_EMAIL, EMP_SITE,
          EMP_DT_FUNDA, EMP_CODTRANSP, EMP_CONSUMIDOR, EMP_MULTIPLICADOR,
          EMP_STATUS, EMP_IND_IE_DEST
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, CURRENT_DATE, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `, [
        newId,
        1,
        (data.customerName || '').toUpperCase(),
        (data.customerName || '').toUpperCase(),
        '',
        'L',
        '',
        tipoPessoa,
        doc,
        0,
        data.salesmanId ?? 0,
        'S',
        data.email || '',
        '',
        data.birthFoundation || null,
        0,
        'S',
        1,
        'L',
        '9',
      ]);
    });

    return newId;
  }

  /**
   * Cria registro em TB_CLIENTE.
   * Referência Delphi: CreateClienteSetes (linha 158).
   */
  async createCliente(empCodigo, trx = null) {
    await runQuery(trx, `
      INSERT INTO TB_CLIENTE (CLI_CODEMP, CLI_ATIVO, CLI_OBS_NF, CLI_JUST_XML_NFE, CLI_IND_IE_DEST)
      VALUES (?, 'S', '', 'N', '9')
    `, [Number(empCodigo)]);
  }

  /**
   * Busca endereço principal de uma empresa.
   */
  async findEnderecoPrincipal(empCodigo, trx = null) {
    const rows = await runQuery(trx,
      `SELECT END_CODIGO, END_CODEMP FROM TB_ENDERECO
       WHERE END_CODEMP = ? AND END_PRINCIPAL = 'S'`,
      [Number(empCodigo)]
    );
    if (!rows.length) return null;
    return { id: rows[0].END_CODIGO, empCodigo: rows[0].END_CODEMP };
  }

  /**
   * Cria endereço (TB_ENDERECO).
   * Referência Delphi: CreateEnderecoSetes (linha 209).
   */
  async createEndereco(data, trx = null) {
    const genRows = await runQuery(trx, 'SELECT GEN_ID(GN_ENDERECO, 1) AS NEW_ID FROM RDB$DATABASE');
    const newId = genRows[0].NEW_ID;
    const doc = (data.fiscalDocument || '').replace(/[.\-/]/g, '');
    // END_CEP é VARCHAR(8): grava só os dígitos ("81770-090" -> "81770090")
    const cep = String(data.zipcode ?? '').replace(/\D/g, '');

    const siglaUf = String(data.stateAbbreviation ?? '').trim().toUpperCase();

    let codigoEstado = null;
    if (siglaUf) {
      const ufRows = await runQuery(trx,
        `SELECT UFE_CODIGO FROM TB_UF WHERE UFE_SIGLA = ?`,
        [siglaUf]
      );
      codigoEstado = ufRows.length ? ufRows[0].UFE_CODIGO : 41;
    }

    let codigoCidade = null;
    if (data.cityName && siglaUf) {
      const cidRows = await runQuery(trx,
        `SELECT FIRST 1 CDD_CODIGO FROM TB_CIDADE
         WHERE UPPER(CDD_DESCRICAO) = ? AND CDD_UF = ?`,
        [data.cityName.toUpperCase(), siglaUf]
      );
      codigoCidade = cidRows.length ? cidRows[0].CDD_CODIGO : 4004;
    }

    await inTransaction(trx, async (t) => {
      await queryInTransaction(t, `
        INSERT INTO TB_ENDERECO (
          END_CODIGO, END_CODEMP, END_CNPJ, END_TIPO,
          END_ENDER, END_NUMERO, END_COMPLEM, END_BAIRRO, END_CEP,
          END_CONTATO, END_FONE, END_CELULAR, END_PRINCIPAL,
          END_PAIS, END_CODUFE, END_CODCDD, END_WHATSUP
        ) VALUES (
          ?, ?, ?, 'PRINCIPAL',
          ?, ?, ?, ?, ?,
          '', '', '', 'S',
          1058, ?, ?, 'N'
        )
      `, [
        newId,
        Number(data.empCodigo),
        doc,
        (data.street || '').toUpperCase(),
        data.buildingNumber || '',
        (data.complement || '').toUpperCase(),
        (data.neighborhood || '').toUpperCase(),
        cep,
        codigoEstado,
        codigoCidade,
      ]);
    });

    return newId;
  }
}

module.exports = new OrderSaleRepository();
