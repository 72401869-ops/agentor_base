# Roadmap

O ambiente mínimo validado tem o kernel por inclusão, a entrada headless, o seam de conhecimento com um provider de arquivos e o LLM configurável por cliente. Os próximos passos seguem o mesmo padrão: **cada capacidade é um seam** (definição → provider → consumidor), montado em bundles e ligado ou desligado por cliente.

## Plugins de treinamento

| Capacidade | Seam proposto | Base no DSH a reaproveitar |
|---|---|---|
| Trilhas de onboarding (módulos, objetivos, pré-requisitos) | `ctx.curriculum`; provider YAML/Markdown por cliente; tools `curriculum_next`, `curriculum_module` | `dsh-goal` (objetivo durável por sessão), `dsh-tool-todo` |
| Progresso do estagiário | `ctx.learnerProgress`; eventos de sessão + `storage-domain`; comando `/progresso` | `dsh-session-projection`, `dsh-storage-domain`, `dsh-commands` |
| Avaliações (quiz, exercício com rubrica corrigida pelo LLM) | `ctx.assessment`; tools `assessment_start`, `assessment_submit` | `dsh-user-questions`, `dsh-tool-ask-user` |
| Postura pedagógica (modo socrático: orientar sem entregar a resposta pronta) | Política nos eventos `agent/pre-step` e `tools/pre-execute` | `dsh-persona`, `dsh-agent-preset` (presets tutor, avaliador, mentor) |
| Relatório para o mentor | `ctx.mentorReport`; geração periódica | `dsh-schedule` |
| Leitura integral de documentos das fontes autorizadas | Tool `read_document` sobre `ctx.knowledge.read()`; provider de pasta local primeiro ([especificação](especificacoes/tool-read-document.md)) | — (o `dsh-tool-fs` não confina a leitura; veja a especificação) |
| Mais fontes de conhecimento | `@agentor/knowledge-onedrive`, `-gdrive`, `-sql`/`-docdb`, `-mcp`, `-http`; busca e leitura com o mesmo contrato, já especificado para leitura | `dsh-mcp-client` |
| Busca semântica | Provider com embeddings (`@agentor/knowledge-vector`), mesmo contrato `KnowledgeSource`, inclusive a leitura por documento | — |

## Etapa Web

O bundle `dsh-web-app` foi feito para rodar sobre o `dsh-base`. Para mantê-lo por inclusão:

1. Mapear quais serviços o `web-app` injeta (`--dump-config` do profile `web` da versão fixada, mais os `inject` dos pacotes).
2. Criar `@agentor/bundle-web` com só essas linhas, sem as telas de conta e telemetria da DeepSeek (`ui-account-notifications`, `ui-settings-account`, `product-analytics`).
3. Adicionar telas de treinamento (trilha, progresso) como plugins de cliente da UI.
4. Estender o teste e2e de política para o profile Web.

## Operação

- Script de setup do ambiente (Node 24 e `pnpm install`) para sessões novas.
- CI rodando `pnpm verify` a cada push.
- Procedimento de atualização do DSH (veja [arquitetura](arquitetura.md#política-de-versões-do-dsh)) executado a cada release candidata, com o resultado registrado em [registro-execucao.md](registro-execucao.md).
