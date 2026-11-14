# Entrega — task #20: Especificar tool de leitura de arquivo

| Campo | Valor |
|---|---|
| Frente | A |
| História | #15 A1 Escolher a base open source |
| Sprint | 1: Escolher a base e definir o cenário |
| Objetivo | Definir como o assistente lerá somente arquivos autorizados, antes de implementar |
| Artefato | [Especificação da tool `read_document`](../especificacoes/tool-read-document.md) |

## Decisão de escopo

A task fala em "arquivos autorizados". A especificação generaliza o conceito para **fontes autorizadas** do cliente: uma pasta local (o padrão, `config/clients/<cliente>/conhecimento/`), uma pasta vinculada do OneDrive ou do Google Drive, um banco de documentos ou um banco vetorial. A lista é o registro `ctx.knowledge` que cada cliente já declara no próprio patch. Os critérios de aceite são atendidos pela pasta local, que é o caso implementado na task #41. Os demais tipos ficam especificados (contrato e regras de escopo) para os épicos E08 e E09.

## Critérios de aceite e evidências

| # | Critério | Evidência |
|---|---|---|
| 1 | O manifesto descreve finalidade, entrada, saída, erros, dono e escopo | [1. Manifesto](../especificacoes/tool-read-document.md#1-manifesto), com detalhes em [6. Entrada](../especificacoes/tool-read-document.md#6-entrada), [7. Saída](../especificacoes/tool-read-document.md#7-saída) e [8. Erros](../especificacoes/tool-read-document.md#8-erros). Dono: Frente A, com o responsável a preencher. Escopo: somente leitura, só das fontes autorizadas ([3. Fontes autorizadas](../especificacoes/tool-read-document.md#3-fontes-autorizadas)) |
| 2 | Há dois exemplos: leitura permitida e caminho fora da pasta autorizada | [(A) Leitura permitida](../especificacoes/tool-read-document.md#a-leitura-permitida), com `manual-do-estagiario.md` real do cliente `exemplo`, e [(B) Caminho fora da pasta autorizada](../especificacoes/tool-read-document.md#b-caminho-fora-da-pasta-autorizada), `../cordis.patch.yml` recusado com `OUTSIDE_SCOPE` sem leitura. Há ainda dois complementares: fonte não autorizada (C) e item do Drive fora da pasta vinculada (D) |
| 3 | Fica claro que a tool não escreve, não apaga e não executa comandos | [2. O que a tool não faz](../especificacoes/tool-read-document.md#2-o-que-a-tool-não-faz), repetido no manifesto (escopo "somente leitura") e na comparação com o `dsh-tool-fs` ([12](../especificacoes/tool-read-document.md#12-por-que-não-reaproveitar-o-dsh-tool-fs)) |
| 4 | Outra pessoa consegue implementar ou testar só lendo a especificação | Contrato TypeScript ([3.2](../especificacoes/tool-read-document.md#32-extensão-do-contrato-knowledgesource)), algoritmo de validação passo a passo com o erro de cada passo ([4.1](../especificacoes/tool-read-document.md#41-pasta-local-agentorknowledge-fs-implementado-na-41)), configuração com exemplo de patch ([5](../especificacoes/tool-read-document.md#5-configuração)) e [plano de testes](../especificacoes/tool-read-document.md#10-plano-de-testes-para-a-implementação) com 25 casos e resultado esperado. **Pendente:** a confirmação por outra pessoa (veja "Como revisar") |

## Como foi verificado

- O exemplo (A) foi comparado por script com o arquivo real `config/clients/exemplo/conhecimento/manual-do-estagiario.md`: conteúdo idêntico, 933 bytes, título e origem no mesmo formato da `knowledge_search`.
- O comportamento do pipeline de tools citado na especificação foi conferido no `@deepseek-ai/dsh-tools` 0.2.2-rc.2 instalado: os argumentos são validados antes da execução, e uma chamada que lança vira `Error: <mensagem>` para o modelo.
- A análise do `dsh-tool-fs` (peers, base dos caminhos, ferramentas de escrita no mesmo pacote) foi feita nos arquivos da versão instalada, 0.2.2-rc.2.
- Todos os links relativos e âncoras dos Markdown do repositório foram verificados por script, com controle positivo.
- Nenhum código mudou: `pnpm verify` com 26 testes, 26 passando.

## Como revisar (outra pessoa)

O critério 4 só fica comprovado quando alguém que não escreveu a especificação a usa:

1. Leia só a [especificação](../especificacoes/tool-read-document.md), sem consultar o autor.
2. Escreva, por conta própria, o resultado esperado (código de erro ou leitura) para estas entradas na fonte `exemplo-manual`:
   - `politica-de-seguranca.md`;
   - `sub/../manual-do-estagiario.md`;
   - `..\..\package.json`;
   - `D:\segredos.txt`;
   - `manual-do-estagiario.md:alt`;
   - um *junction* `link` dentro de `conhecimento/` apontando para `C:\Windows`, lendo `link/win.ini`.
3. Compare suas respostas com a seção 4.1 e a tabela 10.1. Divergência = ponto da especificação a esclarecer.
4. Registre o resultado e o nome de quem revisou em "A preencher".

Respostas esperadas, para conferência do revisor depois do passo 3:

| Entrada | Resposta esperada |
|---|---|
| `politica-de-seguranca.md` | Leitura |
| `sub/../manual-do-estagiario.md` | Leitura |
| `..\..\package.json` | `OUTSIDE_SCOPE` |
| `D:\segredos.txt` | `INVALID_DOCUMENT_ID` |
| `manual-do-estagiario.md:alt` | `INVALID_DOCUMENT_ID` |
| `link/win.ini` (junction para fora) | `OUTSIDE_SCOPE` |

## A preencher

| Campo | Valor |
|---|---|
| Responsável | |
| Revisor | |
| Dependências e alternativa com dados simulados | Nenhuma dependência externa: é um documento. Os exemplos usam os documentos fictícios do cliente `exemplo`; os exemplos de fontes remotas são ilustrativos, com ids inventados |
| Dados utilizados e risco | Somente documentos fictícios. Risco baixo: nenhuma credencial, nenhum dado pessoal, nenhum código executável alterado |
| Links do artefato, da revisão e da evidência | [Especificação](../especificacoes/tool-read-document.md); commit da especificação e o commit deste documento. Revisão: |
| Horas realizadas | |

## Fora do escopo desta task

Apenas para referência; nenhum destes itens foi tratado aqui:

- **Task #41 (Sprint 2):** código da tool `@agentor/tool-read-document`, `read()` no `@agentor/knowledge-fs` e no registro `ctx.knowledge`, os testes da seção 10 e a linha da tool no patch do cliente `exemplo`.
- **Épicos E08 e E09:** providers de OneDrive, Google Drive, banco de documentos e banco vetorial.
- Testes adversariais de injeção por documento (Frente C).
