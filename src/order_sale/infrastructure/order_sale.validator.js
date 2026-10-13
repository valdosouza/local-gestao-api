'use strict';

const { query } = require('../../config/database');

// ---------------------------------------------------------------------------
// Validadores de documento
// ---------------------------------------------------------------------------

/**
 * Valida CPF usando algoritmo de dígito verificador.
 * @param {string} cpf - CPF com ou sem formatação
 * @returns {boolean}
 */
function isValidCPF(cpf) {
  const doc = cpf.replace(/[.\-/]/g, '');

  if (doc.length !== 11 || /^\d+$/.test(doc) === false) return false;

  // Rejeita sequências repetidas
  if (/^(\d)\1{10}$/.test(doc)) return false;

  let soma = 0;
  let resto;

  // Primeiro dígito verificador
  for (let i = 0; i < 9; i++) {
    soma += parseInt(doc[i]) * (10 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(doc[9])) return false;

  soma = 0;
  // Segundo dígito verificador
  for (let i = 0; i < 10; i++) {
    soma += parseInt(doc[i]) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(doc[10])) return false;

  return true;
}

/**
 * Valida CNPJ usando algoritmo de dígito verificador.
 * @param {string} cnpj - CNPJ com ou sem formatação
 * @returns {boolean}
 */
function isValidCNPJ(cnpj) {
  const doc = cnpj.replace(/[.\-/]/g, '');

  if (doc.length !== 14 || /^\d+$/.test(doc) === false) return false;

  // Rejeita sequências repetidas
  if (/^(\d)\1{13}$/.test(doc)) return false;

  let soma = 0;
  let resto;
  const multiplicador1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const multiplicador2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  // Primeiro dígito verificador
  for (let i = 0; i < 12; i++) {
    soma += parseInt(doc[i]) * multiplicador1[i];
  }
  resto = soma % 11;
  if (resto < 2) resto = 0;
  else resto = 11 - resto;
  if (resto !== parseInt(doc[12])) return false;

  soma = 0;
  // Segundo dígito verificador
  for (let i = 0; i < 13; i++) {
    soma += parseInt(doc[i]) * multiplicador2[i];
  }
  resto = soma % 11;
  if (resto < 2) resto = 0;
  else resto = 11 - resto;
  if (resto !== parseInt(doc[13])) return false;

  return true;
}

/**
 * Valida CPF ou CNPJ.
 * @param {string} documento
 * @returns {boolean}
 */
function isValidFiscalDocument(documento) {
  if (!documento) return false;
  const doc = documento.replace(/[.\-/]/g, '');

  if (doc.length === 11) return isValidCPF(documento);
  if (doc.length === 14) return isValidCNPJ(documento);

  return false;
}

// ---------------------------------------------------------------------------
// Validadores de banco de dados
// ---------------------------------------------------------------------------

/**
 * Valida se institutionId existe em TB_EMPRESA com EMP_TIPO = 0.
 * @param {number} institutionId
 * @returns {Promise<boolean>}
 */
async function isValidInstitution(institutionId) {
  if (!institutionId) return false;

  try {
    const rows = await query(
      'SELECT EMP_CODIGO FROM TB_EMPRESA WHERE EMP_CODIGO = ? AND EMP_TIPO = 0',
      [Number(institutionId)]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[VALIDATOR] Erro ao validar institutionId:', err.message);
    return false;
  }
}

/**
 * Valida se paymentTypeId existe em TB_FORMAPAGTO.
 * @param {number} paymentTypeId
 * @returns {Promise<boolean>}
 */
async function isValidPaymentType(paymentTypeId) {
  if (!paymentTypeId) return false;

  try {
    const rows = await query(
      'SELECT FPT_CODIGO FROM TB_FORMAPAGTO WHERE FPT_CODIGO = ?',
      [Number(paymentTypeId)]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[VALIDATOR] Erro ao validar paymentTypeId:', err.message);
    return false;
  }
}

/**
 * Valida se salesmanId existe em TB_COLABORADOR (cadastro de vendedores — GET /salesmen).
 * @param {number} salesmanId
 * @returns {Promise<boolean>}
 */
async function isValidSalesman(salesmanId) {
  try {
    const rows = await query(
      'SELECT CLB_CODIGO FROM TB_COLABORADOR WHERE CLB_CODIGO = ?',
      [Number(salesmanId)]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[VALIDATOR] Erro ao validar salesmanId:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Limites e formatos dos campos gravados no Firebird
// ---------------------------------------------------------------------------

// Tamanho máximo (em caracteres) das colunas que recebem texto do payload.
// Todas são WIN1252: o servidor converte do UTF8 da conexão contando caracteres.
const ORDER_TEXT_LIMITS = [
  { field: 'id',             label: 'Código externo do pedido', max: 50  }, // TB_PEDIDO_FROM_EXTERIOR.ID_EXTERIOR
  { field: 'customerName',   label: 'Nome do cliente',          max: 100 }, // TB_EMPRESA.EMP_NOME
  { field: 'email',          label: 'E-mail',                   max: 100 }, // TB_EMPRESA.EMP_EMAIL
  { field: 'street',         label: 'Logradouro',               max: 100 }, // TB_ENDERECO.END_ENDER
  { field: 'buildingNumber', label: 'Número do endereço',       max: 10  }, // TB_ENDERECO.END_NUMERO
  { field: 'complement',     label: 'Complemento',              max: 25  }, // TB_ENDERECO.END_COMPLEM
  { field: 'neighborhood',   label: 'Bairro',                   max: 100 }, // TB_ENDERECO.END_BAIRRO
  { field: 'cityName',       label: 'Cidade',                   max: 60  }, // TB_CIDADE.CDD_DESCRICAO
];

const ORDER_NUMBER_FIELDS = [
  { field: 'userId',           label: 'Usuário',                integer: true },
  { field: 'quantityProducts', label: 'Quantidade de produtos' },
  { field: 'totalProducts',    label: 'Total dos produtos' },
  { field: 'freightValue',     label: 'Valor do frete' },
  { field: 'discountValue',    label: 'Valor do desconto' },
  { field: 'totalValue',       label: 'Valor total' },
];

const ITEM_NUMBER_FIELDS = [
  { field: 'productId',   label: 'Produto',                integer: true },
  { field: 'sequence',    label: 'Sequência',              integer: true },
  { field: 'quantity',    label: 'Quantidade' },
  { field: 'unitPrice',   label: 'Preço unitário' },
  { field: 'discount',    label: 'Desconto' },
  { field: 'discountPct', label: 'Percentual de desconto' },
  { field: 'stockListId', label: 'Estoque',                integer: true },
  { field: 'priceListId', label: 'Tabela de preço',        integer: true },
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'EX',
];

// Caracteres da faixa 0x80–0x9F que existem no WIN1252 (€, aspas curvas, travessões...)
const WIN1252_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ'
  + '‘’“”•–—˜™š›œžŸ'
);

/** Retorna o primeiro caractere que não pode ser gravado em coluna WIN1252, ou null. */
function findUnsupportedChar(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7F || (cp >= 0xA0 && cp <= 0xFF) || WIN1252_EXTRAS.has(ch)) continue;
    return ch;
  }
  return null;
}

/** Aceita os mesmos formatos de parseDate (service): YYYY-MM-DD ou DD/MM/YYYY, com data real. */
function isValidDate(value) {
  const str = String(value);
  let year, month, day;
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    [, year, month, day] = match;
  } else if ((match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
    [, day, month, year] = match;
  } else {
    return false;
  }
  const dt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return dt.getUTCFullYear() === Number(year)
    && dt.getUTCMonth() === Number(month) - 1
    && dt.getUTCDate() === Number(day);
}

function isValidTime(value) {
  return /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,4})?)?$/.test(String(value));
}

function isPresent(value) {
  return value !== undefined && value !== null;
}

// ---------------------------------------------------------------------------
// Validador principal do payload
// ---------------------------------------------------------------------------

/**
 * Valida o payload completo de criação de pedido.
 * Cada erro indica o campo (caminho no JSON), o que está errado e como corrigir.
 * @param {object} payload
 * @returns {Promise<{valid: boolean, errors: Array<{field: string, message: string, received?: *}>}>}
 */
async function validateOrderPayload(payload) {
  const errors = [];
  const addError = (field, message, received) => {
    errors.push({ field, message, ...(received !== undefined && { received }) });
  };

  const hasOrder = Boolean(payload && payload.order && typeof payload.order === 'object');
  const items    = payload && Array.isArray(payload.items) ? payload.items : [];

  // --- Validações de estrutura (sem itens, os demais campos continuam sendo validados) ---
  if (!hasOrder) {
    addError('order', 'Envie os dados do pedido no objeto "order".');
  }
  if (items.length === 0) {
    addError('items', 'Envie ao menos um item no array "items".');
  }
  if (!hasOrder) {
    return { valid: false, errors };
  }

  const { order } = payload;

  // --- Validações obrigatórias ---
  if (!order.userId) {
    addError('order.userId', 'Informe o código do usuário (retornado no login).');
  }
  if (!order.date) {
    addError('order.date', 'Informe a data do pedido no formato AAAA-MM-DD ou DD/MM/AAAA.');
  }
  if (!order.customerName) {
    addError('order.customerName', 'Informe o nome do cliente.');
  }
  if (!order.fiscalDocument) {
    addError('order.fiscalDocument', 'Informe o CPF ou CNPJ do cliente.');
  }

  // --- Validação de fiscalDocument (CPF/CNPJ) ---
  if (order.fiscalDocument && !isValidFiscalDocument(String(order.fiscalDocument))) {
    addError(
      'order.fiscalDocument',
      'CPF/CNPJ inválido. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido, com ou sem máscara.',
      order.fiscalDocument
    );
  }

  // --- Datas e hora ---
  if (order.date && !isValidDate(order.date)) {
    addError('order.date', 'Data inválida. Use AAAA-MM-DD ou DD/MM/AAAA, ex.: 2026-10-13 ou 13/10/2026.', order.date);
  }
  if (order.birthFoundation && !isValidDate(order.birthFoundation)) {
    addError(
      'order.birthFoundation',
      'Data de nascimento/fundação inválida. Use AAAA-MM-DD ou DD/MM/AAAA, ex.: 1977-10-09.',
      order.birthFoundation
    );
  }
  if (order.hour && !isValidTime(order.hour)) {
    addError('order.hour', 'Hora inválida. Use HH:MM ou HH:MM:SS, ex.: 08:30.', order.hour);
  }

  // --- Textos: tamanho máximo da coluna e caracteres aceitos pelo banco ---
  for (const { field, label, max } of ORDER_TEXT_LIMITS) {
    const value = order[field];
    if (!isPresent(value) || value === '') continue;

    if (typeof value === 'object') {
      addError(`order.${field}`, `${label} deve ser um texto.`, value);
      continue;
    }

    const text = String(value);
    const length = [...text].length;
    if (length > max) {
      addError(
        `order.${field}`,
        `${label} tem ${length} caracteres; o máximo aceito é ${max}. Abrevie o texto.`,
        text
      );
    }

    const badChar = findUnsupportedChar(text);
    if (badChar) {
      addError(
        `order.${field}`,
        `${label} contém o caractere "${badChar}", que não é aceito. Remova emojis e símbolos especiais.`,
        text
      );
    }
  }

  // --- CEP: aceito com ou sem máscara, gravado só com os 8 dígitos ---
  if (isPresent(order.zipcode) && order.zipcode !== '') {
    const digits = String(order.zipcode).replace(/\D/g, '');
    if (digits.length !== 8) {
      addError(
        'order.zipcode',
        `CEP deve ter 8 dígitos; foram informados ${digits.length}. Ex.: 81770090 ou 81770-090.`,
        order.zipcode
      );
    }
  }

  // --- UF ---
  if (isPresent(order.stateAbbreviation) && order.stateAbbreviation !== '') {
    const uf = String(order.stateAbbreviation).trim().toUpperCase();
    if (!UFS.includes(uf)) {
      addError(
        'order.stateAbbreviation',
        'UF inválida. Informe a sigla do estado com 2 letras, ex.: PR, SC, SP.',
        order.stateAbbreviation
      );
    }
  }

  // --- Campos numéricos ---
  const checkNumber = (path, label, value, integer) => {
    if (!isPresent(value)) return;
    const num = typeof value === 'boolean' || value === '' ? NaN : Number(value);
    if (!Number.isFinite(num)) {
      addError(path, `${label} deve ser numérico. Informe um número ou omita o campo.`, value);
    } else if (integer && !Number.isInteger(num)) {
      addError(path, `${label} deve ser um número inteiro.`, value);
    }
  };

  for (const { field, label, integer } of ORDER_NUMBER_FIELDS) {
    checkNumber(`order.${field}`, label, order[field], integer);
  }

  // --- Vendedor: obrigatório, maior que zero e cadastrado ---
  const { salesmanId } = order;
  if (!isPresent(salesmanId) || salesmanId === '') {
    addError('order.salesmanId', 'Informe o código do vendedor (retornado no login).');
  } else if (typeof salesmanId === 'boolean' || !Number.isInteger(Number(salesmanId)) || Number(salesmanId) <= 0) {
    addError(
      'order.salesmanId',
      'Código de vendedor inválido: informe o código do vendedor (retornado no login). O valor 0 não é aceito.',
      salesmanId
    );
  } else if (!(await isValidSalesman(salesmanId))) {
    addError('order.salesmanId', 'Vendedor não encontrado. Use um código retornado por GET /salesmen.', salesmanId);
  }

  // --- Validação de institutionId (apenas se informado) ---
  if (order.institutionId) {
    const validInstitution = await isValidInstitution(order.institutionId);
    if (!validInstitution) {
      addError(
        'order.institutionId',
        'Estabelecimento não encontrado. Use um código retornado por GET /institutions.',
        order.institutionId
      );
    }
  }

  // --- Validação de paymentTypeId (apenas se informado) ---
  if (order.paymentTypeId) {
    const validPaymentType = await isValidPaymentType(order.paymentTypeId);
    if (!validPaymentType) {
      addError(
        'order.paymentTypeId',
        'Forma de pagamento não encontrada. Use um código retornado por GET /payment-types.',
        order.paymentTypeId
      );
    }
  }

  // --- Validações dos itens ---
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};

    if (!item.productId) {
      addError(`items[${i}].productId`, 'Informe o código do produto.');
    }
    if (!isPresent(item.quantity)) {
      addError(`items[${i}].quantity`, 'Informe a quantidade do item.');
    }
    if (!isPresent(item.unitPrice)) {
      addError(`items[${i}].unitPrice`, 'Informe o preço unitário do item.');
    }

    for (const { field, label, integer } of ITEM_NUMBER_FIELDS) {
      checkNumber(`items[${i}].${field}`, label, item[field], integer);
    }

    // Quantidade zero ou negativa (só quando já é um número válido, sem erro anterior no campo)
    const quantityPath = `items[${i}].quantity`;
    if (!errors.some((e) => e.field === quantityPath) && Number(item.quantity) <= 0) {
      addError(quantityPath, 'Quantidade deve ser maior que zero.', item.quantity);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  isValidFiscalDocument,
  isValidInstitution,
  isValidPaymentType,
  isValidSalesman,
  validateOrderPayload,
};
