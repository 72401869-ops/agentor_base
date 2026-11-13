# Agentor

Harness de agentes autônomos para **treinamento de novos colaboradores (estagiários)**, composto a partir do kernel de plugins **Cordis** do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

Em vez de fazer fork do DSH, o Agentor **consome os pacotes publicados do DSH com versão fixada** e monta a própria árvore de plugins **por inclusão**: só roda o que está listado em [`packages/bundles/kernel/cordis.patch.yml`](packages/bundles/kernel/cordis.patch.yml). Os plugins específicos da DeepSeek ficam de fora, e os plugins de treinamento são pacotes próprios deste repositório.

- Cada **cliente** tem as próprias **fontes de conhecimento** e o próprio **provedor de LLM**, configurados em `config/clients/<cliente>/`.
- As chaves de LLM são **referências a variáveis de ambiente**, resolvidas a cada requisição. Nenhuma chave fica no repositório.
- A primeira superfície é **headless (CLI)**. A interface Web é a etapa seguinte (veja [docs/roadmap.md](docs/roadmap.md)).

> **Estado:** ambiente mínimo validado (headless + base de conhecimento + LLM offline). O DSH está em *developer preview* e pode trazer mudanças incompatíveis; por isso a versão é fixada. Veja [docs/registro-execucao.md](docs/registro-execucao.md).

## Pré-requisitos

| Item | Versão | Observação |
|---|---|---|
| Node.js | **≥ 24.9.0** (validado com 24.22.1) | Exigência declarada pelo `@deepseek-ai/dsh` (`engines`). O repositório usa o *type stripping* nativo do Node para rodar TypeScript sem build. |
| pnpm | 10.28.0 | Declarado em `packageManager`. Com corepack: `corepack enable`. |
| Rede | registro npm | Só na instalação. A execução `--offline` não usa rede. |
| Chave de LLM | uma por cliente | Só para o modo com LLM real. Veja [docs/clientes.md](docs/clientes.md). |

## Instalação

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm setup:profile
```

O segundo comando cria o profile DSH `agentor` em `.dsh-home/` (ignorado pelo git). O profile lista os bundles `@agentor/bundle-kernel` → `@agentor/bundle-training` e aponta, por links, para os pacotes deste repositório. Ele também roda automaticamente a cada execução do lançador.

## Execução

Validação sem LLM e sem chave (adaptador determinístico que consulta a base de conhecimento e devolve o trecho encontrado):

```bash
pnpm smoke
```

Pergunta com o LLM real configurado para o cliente:

```bash
pnpm agentor --client exemplo "Como funciona o ponto eletrônico?"
```

Outras formas úteis:

```bash
pnpm agentor --client exemplo --offline --json "Qual a regra de senhas?"
```

```bash
pnpm dump-config --client exemplo
```

O primeiro grava os eventos da execução em NDJSON no stdout. O segundo mostra a árvore de plugins final, indicando qual camada definiu cada linha.

O lançador (`scripts/agentor.mjs`) equivale a `dsh --profile agentor --patch config/clients/<cliente>/cordis.patch.yml [--patch config/offline.patch.yml] [args]`, com `DSH_HOME=.dsh-home` e `AGENTOR_CLIENT_DIR` definidos. Tudo que vem depois das opções do lançador vai para o app headless do DSH (`--json`, `--session-id <id>`, a pergunta). As sessões ficam em `.dsh-home/sessions/`.

## Testes

```bash
pnpm verify
```

Roda `pnpm typecheck` (TypeScript estrito) e `pnpm test`. Os testes ficam em `tests/`:

- `tests/unit/`: o seam `ctx.knowledge` sobre um `Context` real do Cordis, o provider de arquivos, a tool `knowledge_search` no pipeline real de tools do DSH e o adaptador offline.
- `tests/e2e/`: sobem o `dsh` publicado com um `DSH_HOME` temporário. Inclui o teste de política **"nenhum pacote DeepSeek na árvore composta"**, que falha se uma mudança reintroduzir um plugin específico da DeepSeek.

## Estrutura

```
packages/                 código (um pacote pnpm por plugin)
  bundles/kernel/         árvore DSH por inclusão (sem DeepSeek), entrada headless
  bundles/training/       persona tutora + seam de conhecimento
  knowledge/knowledge/    definição do seam ctx.knowledge
  knowledge/knowledge-fs/ provider: documentos de uma pasta do cliente
  knowledge/tool-knowledge/ consumidor: tool knowledge_search
  llm/llm-offline/        adaptador LLM determinístico para validação
config/                   configuração (sem segredos)
  clients/exemplo/        cliente de exemplo: LLM, modelo e fontes de conhecimento
  offline.patch.yml       overlay que troca o LLM pelo adaptador offline
  .env.example            nomes das variáveis de chave, sem valores
scripts/                  lançador e criação do profile
tests/                    testes unitários e e2e
docs/                     arquitetura, clientes, registro de execução, roadmap
```

As dependências estão registradas em `package.json` (raiz e pacotes) e travadas em `pnpm-lock.yaml`. Os pacotes do DSH usam **versão exata** (`0.2.2-rc.1`).

## Erros conhecidos

| Sintoma | Causa | O que fazer |
|---|---|---|
| `pnpm` avisa `Unsupported engine` | Node < 24.9 | Use Node 24 (`.nvmrc`). Neste container: `export PATH=/opt/node24/bin:$PATH`. O smoke offline chegou a rodar com Node 22.23, mas essa versão fica fora do suporte declarado pelo DSH e não é validada. |
| `dsh: MISSING_CREDENTIAL: llm-pi-ai: no credential for provider route "openai"; its profile resolves AGENTOR_EXEMPLO_OPENAI_KEY, which is not set` | A variável citada em `apiKeyEnv` não existe no ambiente | Exporte a variável ou coloque-a em `.dsh-home/.env` (modelo em `config/.env.example`). Para validar sem chave, use `--offline`. |
| `dsh: AUTH: Connection error.: Proxy response (403) !== 200 when HTTP Tunneling` | A rede bloqueia o host do provedor (visto neste container, que só libera registros de pacotes) | Libere o host do provedor na política de rede, ou use um gateway acessível na rota do cliente. |
| `failed to parse overlay ... cannot resolve a node with !<tag:yaml.org,2002:js> explicit tag` | Expressão `!!js` sem aspas começando com crase ou outro caractere reservado do YAML | Coloque a expressão entre aspas: `root: !!js "process.env.AGENTOR_CLIENT_DIR + '/conhecimento'"`. |
| `erro: cliente não encontrado: config/clients/<x>/cordis.patch.yml` (código 2) | `--client` aponta para uma pasta que não existe | Crie o cliente a partir de `config/clients/exemplo/` ([docs/clientes.md](docs/clientes.md)). |
| Aviso do pnpm `Ignored build scripts: @google/genai, koffi, protobufjs` | Dependências transitivas do DSH com scripts de build nativo | Inofensivo: o kernel não usa esses recursos. Não aprove os scripts sem necessidade. |
| `dsh: skipping profile bundle "@agentor/bundle-kernel": ... is incompatible with dsh <versão>` seguido de `entries did not activate ... pending`; o processo sai com **código 0** e sem resposta | A versão do `@deepseek-ai/dsh` instalada não satisfaz o `engines.dsh` dos pacotes `@agentor/*` | Reinstale a versão travada (`pnpm install --frozen-lockfile`) ou siga o procedimento de atualização em [docs/arquitetura.md](docs/arquitetura.md#política-de-versões-do-dsh). |
| Uma linha nova no patch parece não ter efeito | Nome de módulo errado: o loader do Cordis registra no logger e não derruba o processo | Confira com `pnpm dump-config --client <x>` e revise a grafia do `name`. |

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md): Cordis, seams, camadas de composição, o que entrou e o que saiu do kernel e por quê, e a política de versões.
- [docs/clientes.md](docs/clientes.md): como configurar um cliente (LLM, chaves, fontes de conhecimento).
- [docs/registro-execucao.md](docs/registro-execucao.md): comandos executados, resultados e impedimentos.
- [docs/roadmap.md](docs/roadmap.md): próximos plugins de treinamento e a etapa Web.

## Licença

[MIT](LICENSE). O Agentor depende de pacotes do DeepSeek Harness (MIT, © DeepSeek-AI), instalados pelo npm. Nenhum código do DSH é copiado para este repositório.
