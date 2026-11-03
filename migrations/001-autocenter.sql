-- Estrutura técnica do app, independente das tabelas e rotinas Delphi.
-- Aplicar uma vez, por scripts/setup-autocenter.js. Nenhum dado comercial é alterado.
CREATE TABLE TB_APP_BUDGET_OP (
 OP_KEY VARCHAR(80) NOT NULL,
 USER_ID INTEGER NOT NULL,
 INSTITUTION_ID INTEGER NOT NULL,
 BUDGET_ID INTEGER NOT NULL,
 PAYLOAD_HASH VARCHAR(64) NOT NULL,
 CONSTRAINT PK_APP_BUDGET_OP PRIMARY KEY (OP_KEY)
);
