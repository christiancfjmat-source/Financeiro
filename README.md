# Moradia | Gestão Financeira

Aplicação local de finanças pessoais com lançamento de despesas, categorias, tags e tetos mensais. A visão geral reúne renda prevista, gastos registrados e saldos de abertura.

## Executar no Windows

1. Tenha Python 3.12 ou superior e Node.js 22.12 ou superior disponíveis.
2. Execute `instalar.bat` na pasta do projeto. A instalação baixa dependências e compila a interface.
3. Execute `criar-atalho.bat` para criar **Moradia - Gestao Financeira** na área de trabalho. Abra o atalho ou execute `iniciar.bat` para iniciar o servidor e abrir [Moradia](http://127.0.0.1:8000/) no navegador padrão. O servidor escuta apenas na interface local.
4. Para encerrar, pressione **Ctrl+C** no terminal em que o servidor está rodando.

O banco `data/moradia.sqlite3` é criado e migrado ao iniciar pela primeira vez. O aplicativo utiliza o banco e a interface compilada localmente. A configuração opcional `MORADIA_DB` permite escolher outro caminho para o banco.

Após atualizar o código, encerre o servidor e execute `atualizar.bat`. O script cria uma cópia SQLite íntegra do banco em `data/backups/` antes da instalação. Em seguida, execute `iniciar.bat` para aplicar as migrações pendentes. Para recuperar uma cópia, com o serviço encerrado, preserve o banco atual e use a cópia como banco ativo escolhendo seu caminho em `MORADIA_DB`.

## Começar a usar

- Em **Configurações**, revise o salário-base de R$ 14.014,87, informe o dia de recebimento e salve os saldos de abertura quando souber os valores.
- Em **Configurações → Renda**, use **Agendar reajuste** para escolher um mês futuro e informar o novo salário. Na **Visão geral**, alterne entre os meses anterior e posterior ao reajuste para consultar os dois valores. O salário-base serve como referência para os meses anteriores à primeira vigência cadastrada.
- Em **Categorias**, use **Novo item** para cadastrar um departamento. Use o botão de adição da linha para cadastrar um item subordinado. Um item com filhos pode ser desativado e seus descendentes ficam inativos. A reativação é individual. A exclusão requer confirmação e o banco bloqueia a exclusão de itens vinculados.
- Na **Visão geral** ou em **Despesas**, use **Nova despesa** e informe valor, data e categoria. A lista de categorias é agrupada por departamento. Subcategoria, descrição e tags são opcionais. Em **Despesas**, você pode consultar, filtrar, editar ou excluir lançamentos.
- Para um gasto mensal, selecione **Fixa**, escolha **A partir de hoje** ou uma data específica e selecione **Sem prazo** ou **Com prazo**. A recorrência conta uma vez por competência, incluindo os meses de início e término. Quando o dia de início não existe em um mês, usa-se o último dia daquele mês. Uma despesa fixa sem prazo pode ser encerrada com **Finalizar** na lista de despesas. O mês do encerramento permanece no histórico.
- Em **Nova despesa**, **Despesa comum** é o padrão e pede uma forma de pagamento. Em **Financiamento (empréstimo)**, escolha **Despesa única** para manter um registro avulso ou fixo, ou **Parcelas individuais** para gerar um registro por mês da vigência. Informe o valor de cada parcela na segunda opção. O formulário mostra a quantidade antes de salvar. Financiamentos e empréstimos recebem um método automaticamente.
- Em **Formas de pagamento**, cadastre métodos pelo nome e pela categoria. Há métodos iniciais de crédito, débito, Pix, boleto, débito automático, transferência e dinheiro. Configure o dia de vencimento ao usar cartão de crédito. O vencimento previsto é o primeiro que cai na data da compra ou depois dela, ajustado ao último dia em meses mais curtos. Despesas antigas sem método aparecem como **Não informada** até a edição.
- Em uma **Despesa comum avulsa**, informe o valor total e, para dividir o lançamento, preencha **Número de parcelas**. A primeira parcela cai na data da despesa ou no vencimento previsto do cartão de crédito. As seguintes caem nos meses subsequentes, ajustadas para meses mais curtos. Os centavos restantes ficam nas primeiras parcelas. Cada mês contabiliza apenas sua parcela. Ao editar ou excluir uma compra parcelada, a alteração se aplica a todo o cronograma.
- Em **Despesas**, use **Antecipar parcelas**, informe a data do pagamento, escolha um contrato e marque as parcelas de meses posteriores. Informe o valor pago para cada uma. Por exemplo, um pagamento de R$ 650,10 para uma parcela originalmente de R$ 850,00 entra por R$ 650,10 no mês do pagamento. A parcela sai do total previsto do mês de vencimento, e o filtro **Antecipadas** consulta o pagamento junto do valor e do vencimento originais. A lista de antecipação permite selecionar parcelas de todo o contrato, inclusive além do horizonte de projeção do dashboard.
- O horizonte dos lançamentos fixos é de 36 meses por padrão e pode ser ajustado em **Configurações**. Alterar uma recorrência em andamento vale a partir do mês atual. Os valores dos meses anteriores ficam preservados.
- Use **Novo crédito** na **Visão geral** ou na página **Créditos**. Um crédito **avulso** entra em um único mês, com data opcional. Um crédito **fixo** entra mensalmente a partir da data de início, com término opcional. Em **Créditos**, consulte os lançamentos por mês, texto, tipo ou tag e use **Finalizar** para encerrar um crédito fixo sem prazo.
- **Renda comprometida** mostra a proporção gasta da renda mensal, que soma o salário vigente e os créditos daquele mês. **Saldo do mês** subtrai as despesas da renda mensal. **Teto utilizado** divide as despesas do mês pela soma dos tetos das categorias e exibe também o teto total em dinheiro.
- Em **Tags**, cadastre os nomes que deseja usar nos lançamentos. Uma tag pode aparecer em despesas de vários departamentos. Para excluir uma tag vinculada, retire-a primeiro dos lançamentos.
- Em **Categorias**, use **Teto** na linha da categoria para definir um valor mensal do mês atual em diante. Alterações e exclusões preservam os tetos dos meses anteriores. Na **Visão geral**, o teto do departamento é a soma dos tetos das suas categorias no mês selecionado. Categorias sem teto contribuem com R$ 0,00. Expanda o departamento para ver os tetos e o consumo de cada categoria. Os gastos das subcategorias entram no teto da categoria.
- A moeda selecionada define a apresentação dos valores nominais. Alterar a moeda preserva os valores digitados.

## Arquitetura

| Área | Papel |
| --- | --- |
| `backend/app/main.py`, `api.py` e `spending_api.py` | FastAPI, rotas REST e publicação da interface compilada |
| `backend/app/schemas.py` | Contratos Pydantic e validação |
| `backend/app/models.py` | Modelos SQLAlchemy |
| `backend/migrations/` | Histórico Alembic e dados iniciais |
| `frontend/src/` | React, Vite, Lucide e estilos com Tailwind CSS |
| `backend/tests/` e `frontend/tests/` | Testes de API, persistência, valores monetários e fluxos no navegador |

A classificação usa uma árvore referenciada por chave estrangeira. Os valores monetários são armazenados em centavos inteiros. Cada despesa guarda os vínculos de categoria e departamento do momento do lançamento. O calendário financeiro usa o fuso de São Paulo e a API representa datas e competências no padrão ISO. Dia de recebimento e saldos de abertura ficam indefinidos até que sejam informados.

A especificação [OpenAPI em JSON](http://127.0.0.1:8000/openapi.json) descreve as rotas e os campos. A API está disponível sob `/api`.

| Recurso | Operações |
| --- | --- |
| `/settings` | Consultar e salvar as preferências |
| `/settings/theme` | Atualizar o tema |
| `/salary?month=AAAA-MM` | Consultar o salário previsto da competência |
| `/income?month=AAAA-MM` | Consultar a renda mensal e os créditos da competência |
| `/income/credits` | Cadastrar um crédito. Use `/{id}` para editar ou excluir. |
| `/income/credits/{id}/close` | Encerrar um crédito fixo sem prazo. |
| `/salary-revisions` | Listar e agendar reajustes. Use `/{AAAA-MM-01}` para editar ou remover um agendamento futuro. |
| `/classifications` | Listar e criar itens. Use `/{id}` para editar e excluir. |
| `/expenses` | Listar por `?month=AAAA-MM` e criar despesas. Use `/{id}` para editar e excluir. |
| `/expenses/{id}/close` | Encerrar uma despesa fixa sem prazo, informando a data efetiva. |
| `/payment-methods` | Listar e cadastrar formas de pagamento. Use `/{id}` para editar e excluir. |
| `/installment-advances/options?paid_on=AAAA-MM-DD` | Consultar parcelas elegíveis na data de pagamento. |
| `/installment-advances` | Registrar antecipações com data e valores pagos por parcela, em uma única transação. |
| `/tags` | Listar e criar tags. Use `/{id}` para editar e excluir. |
| `/budgets/{category_id}` | Consultar, salvar ou remover o teto da categoria do mês atual em diante. |
| `/spending?month=AAAA-MM` | Consultar totais do mês e progresso dos tetos configurados. |
| `/health` | Consultar a disponibilidade do serviço |

### Desenvolvimento e testes

Com a instalação concluída, execute na raiz:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
```

Os testes de integração usam um servidor e um banco isolados. Para rodá-los com Google Chrome instalado:

```powershell
$env:MORADIA_BROWSER_CHANNEL = 'chrome'
npm.cmd --prefix frontend run test:e2e
```

Sem Chrome instalado, use `npx.cmd playwright install chromium` na pasta `frontend` e execute o teste sem definir `MORADIA_BROWSER_CHANNEL`. Para desenvolvimento com recarga automática, mantenha o backend rodando com `iniciar.bat` e execute `npm.cmd --prefix frontend run dev`.

## Próximas etapas

1. **Controle financeiro** — completar o módulo de receitas e incluir compromissos recorrentes e indicadores de execução.
2. **Cartões** — parcelamentos, faturas, pagamentos, saldos iniciais e reconciliação.
3. **Planejamento** — fluxo de caixa, cenários e metas.
4. **Importações e relatórios** — revisão e deduplicação, categorização automática, exportações e alertas.
5. **Qualidade** — ampliação dos testes, revisão financeira e gestão de cópias de segurança.

Na modelagem dessas etapas, despesas serão registradas uma vez e terão obrigações próprias para o caixa. Pagamentos de fatura liquidarão obrigações. Transferências terão origem e destino em contas próprias. Orçamentos e alterações de valores recorrentes terão vigência própria para preservar o histórico.
