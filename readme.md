# Local Gestão API


## AutoCenter

Integração de orçamento completo, veículo/checklist, concorrência e controle de envios: [CONTRATO-AUTOCENTER.md](CONTRATO-AUTOCENTER.md). Em instalação nova, preparar a tabela técnica com `node scripts/setup-autocenter.js --apply` e reiniciar a API.

API Node.js/Express que conecta os aplicativos Flutter ao Firebird do ERP.

```text
Firebird e base do ERP -> local-gestao-api -> aplicativos Flutter
```

## Requisitos

- Node.js 20+ e npm.
- Firebird acessível (código desenvolvido para a versão 2.5).
- Base existente do ERP, com tabelas, geradores e regras compatíveis. A API não cria o banco.

## Executar

```powershell
npm install
npm run dev
```

Ou use `npm start` para executar sem nodemon. Reinicie após alterar o `.env`; `Ctrl+C` encerra o servidor.

- Swagger: `http://localhost:3000/api-docs`.
- API: `http://localhost:3000/api/v1`.

## Testar conexão e login

Em outro terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/health'
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/institutions'
```

`health` retorna `result: true` e verifica o HTTP. `institutions` consulta o Firebird; pode retornar lista vazia se não houver empresas ativas com `EMP_TIPO = 0`.

No Swagger, execute `POST /auth/login` com `login` e `senha` em MD5 hexadecimal maiúsculo. Use usuário ativo do ERP. A resposta contém `token`; informe-o em **Authorize** para acessar rotas protegidas, como `/products`, `/budgets`, `/stock-control` e `/order-sales`. Os apps do GestaoApps exigem vendedor associado ao usuário.

## Conectar os aplicativos

- Emulador Android padrão, com API no computador hospedeiro: `10.0.2.2`.
- Aparelho físico: IPv4 do computador na rede, por exemplo `192.168.0.10`.
- Porta TCP 3000: aplicativo -> API. Porta TCP 3050: API -> Firebird.

Guias: [GestaoApps](../GestaoApps/readme.md) e [budget_sales_app original](../budget_sales_app/README.md).

## Diagnóstico

- Health funciona, mas estabelecimentos falham: confira host, caminho da base, credenciais, charset e logs.
- HTTP 401: confira login, header `Authorization: Bearer TOKEN` e expiração do JWT.
- App original falha após login: seu Gateway ainda não envia JWT e há rotas antigas.
- Validação de código: `npm run lint`. Não há script `npm test` nesta versão.

Use homologação para testar gravações. Orçamentos e pedidos podem ficar parcialmente gravados em caso de falha; confira o registro antes de reenviar. A execução integrada com o banco real ainda precisa ser validada.
