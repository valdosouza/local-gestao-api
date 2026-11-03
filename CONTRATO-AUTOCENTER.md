# Integração AutoCenter

Implementada em 2026-11-02, isolada das rotas legadas de Sales. Todas as rotas ficam sob `/api/v1/autocenter`, após o middleware JWT já existente.

## Preparação

Execute na pasta da API:

```powershell
node scripts/setup-autocenter.js --apply
npm start
```

O script cria somente TB_APP_BUDGET_OP, se ausente. Essa tabela técnica mantém chave de envio, usuário, estabelecimento, orçamento e hash do conteúdo, na mesma transação do documento. Foi aplicada à base local de desenvolvimento; nenhuma linha comercial foi criada pelos testes. Em instalações novas, revisar o schema e aplicar uma vez antes de usar o módulo.

## Rotas

| Método / caminho | Contrato |
| --- | --- |
| GET /budgets/:id?institutionId=... | Cabeçalho, itens, veículo, checklist, editable e version. |
| POST /budgets | Novo documento completo. Corpo: institutionId, operationId, document. |
| PUT /budgets/:id | Atualização completa com document.version recebido na consulta. |
| GET /operations/:key?institutionId=... | Confirma ID de um envio desse usuário/estabelecimento. Não cria nem altera registros. |
| GET /catalog/:kind?institutionId=... | Busca paginada: products, services, brands, models, kinds, colors, stocks, prices, vehicles. |

Pesquisas usam search/offset; models exige brandId; prices exige productId. Estoques e tabelas de preço são restritos ao estabelecimento. Serviços usam TB_PRODUTO.PRO_TIPO = S e são gravados como ICT_TIPO = S; peças, como P. No vínculo de serviço, estoque/tabela seguem os zeros do legado. Preços são selecionados explicitamente no app.

document contém header, items, vehicle, checklist e, em edição, version. Header usa customerId/customerName/date/paymentTypeId/paymentTerms/contact/notes/freight/additional. Itens usam id opcional, type/productId/description/quantity/unitPrice/discountValue/stockId/priceListId. O servidor calcula os totalizadores, ignorando totais enviados pelo cliente. Quantidade: até 3 casas; preço: até 6; desconto monetário: 2. Totais de peças e serviços são brutos, e o desconto é subtraído uma única vez, conforme Un_Cotacao.Pc_AtualizaCampos/Pc_Totalizador.

vehicle usa plate/fleet/brandId/modelId/kindId/colorId/year/km/engine/chassis/notes/exitDate/exitHour; placa existente é confirmada pela pesquisa e vehicleVersion. Checklist usa regions com exatamente 22 códigos N/R/Q/A, frontTyre/backTyre/spareTyre (R/B/E), fuel (1–5), valves (08/16/20/24), acessórios S/N, km/notes/entryDate/entryHour/prism. Datas de entrada/saída seguem DD/MM/AAAA e horas HH:MM; header.date é ISO YYYY-MM-DD.

vehicleDirty/checklistDirty vêm como false na consulta. Quando não alterados, esses dados não são regravados nem normalizados. Ao alterá-los, o app marca true e o servidor exige o contrato completo. Em inclusão nova, o servidor força a validação dos dados fornecidos independentemente desses marcadores.

## Integridade

- Permissões Fr_Cotacao/Visualizar, Inserir, Alterar e Excluir usam a identidade e o nível do JWT; nível/usuário no corpo não concedem acesso. Exclusão de itens exige Excluir.
- Orçamento pertence ao estabelecimento da operação. Veículo de outro cliente, estoque de outra instituição e modelo de outra marca são recusados.
- Alterações preservam IDs dos itens e campos não editados. Totais, itens, veículo, vínculo, checklist e chave de envio compartilham commit/rollback.
- GN_COTACAO, GN_ITENS_CTC e GN_VEICULO fornecem IDs. Como os generators não são transacionais, rollback/repetição podem deixar lacunas, sem duplicar registros.
- Version é um SHA-256 de cabeçalho, itens, vínculo, checklist e cadastro do veículo. O servidor compara novamente sob bloqueio do cabeçalho; respeita CTC_EMUSO e recusa documentos aprovados/convertidos/encerrados ou de outro tipo. A transação do módulo usa REC_VERSION/NO_WAIT para evitar espera por bloqueio do desktop. Chamadores antigos mantêm as opções originais de withTransaction.
- operationId deve permanecer igual ao repetir o mesmo conteúdo. Chave repetida com conteúdo/usuário/estabelecimento diferente é recusada. Transação não confirmada não deixa chave de sucesso.
- BLOBs de observação nesta base são binários e escritos como ANSI no Delphi. O módulo lê/grava WIN1252 conforme a configuração local, incluindo acentos, em vez de gravar UTF-8 indevidamente nesses BLOBs.

## Validação e limites

Testes de regras, 88 combinações de posição/estado, totais, rollback, conflito, idempotência, recorte e permissão usam banco/HTTP simulados. Leitura real do documento e dos nove cadastros foi validada, sem criar orçamentos. A pesquisa de cores retornou vazia na base examinada.

Não se declara homologação de gravação comercial real nem equivalência de todas as regras de comissões, campanhas, serviços associados e técnicos. A numeração comercial nova permanece para o fluxo legado; não foi substituída por um generator incompatível com o MAX do desktop. Não há aprovação/conversão/faturamento neste módulo. Roteiro de homologação em GestaoApps/apps/budget_autocenter/HOMOLOGACAO.md.
