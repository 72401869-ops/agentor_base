# Arquitetura

O Agentor reaproveita a arquitetura de plugins do DeepSeek Harness (DSH) sem fazer fork: os pacotes do DSH entram pelo npm com versão fixada, e este repositório contribui só **composição** (bundles YAML) e **plugins próprios**.

## Cordis em cinco ideias

O DSH é construído sobre o Cordis, um framework de plugins sem nenhuma capacidade de agente própria:

1. **Plugin**: um módulo com `apply(ctx, config)` (ou uma classe `Service`). O Cordis chama `apply` ao carregar o plugin.
2. **Serviço**: um plugin publica uma capacidade numa chave do contexto (`ctx.tools`, `ctx.llm`, `ctx.knowledge`). Os outros a usam pela chave, sem importar a implementação.
3. **`inject`**: o plugin declara de quais serviços depende e só carrega depois que eles existem. A ordem vem das dependências, não da posição no YAML.
4. **Eventos tipados** (`emit`, `waterfall`, `parallel`, `serial`, `bail`) para interceptar o ciclo do agente sem alterá-lo.
5. **Efeitos reversíveis**: tudo que um plugin registra é desfeito quando ele descarrega. Por isso trocar ou remover um plugin é uma mudança de configuração.

## Seams: definição, provider e consumidor

Toda capacidade trocável tem três papéis, normalmente em pacotes separados:

| Papel | No seam de conhecimento do Agentor |
|---|---|
| **Definição** (o serviço e seu contrato) | `@agentor/knowledge` → `ctx.knowledge` |
| **Provider** (implementação) | `@agentor/knowledge-fs` (pasta de documentos); futuros: MCP, HTTP, banco |
| **Consumidor** (normalmente uma tool) | `@agentor/tool-knowledge` → tool `knowledge_search` |

Provider e consumidor não se conhecem. Um cliente com dados no Confluence ganha um provider novo, e a tool e a persona não mudam.

`ctx.knowledge` é um **registro**: cada provider registra uma ou mais fontes, e `search()` consulta todas em paralelo, ordena por relevância e isola falhas. Uma fonte fora do ar vira um aviso no resultado e não derruba a busca. O registro é desfeito automaticamente quando o provider descarrega (`this.ctx.effect`, o mesmo padrão do `ctx.llm.registerAdapter` do DSH).

## Camadas de composição

O DSH monta a árvore de plugins aplicando patches YAML em ordem. Uma camada posterior pode **substituir o `config` inteiro** de uma linha pelo `id`, **inserir** linhas novas ou **desligar** uma linha (`disabled: true`).

```
@agentor/bundle-kernel      árvore completa, por inclusão (sem dsh-base)
  └─ @agentor/bundle-training   persona tutora + seam de conhecimento
       └─ .dsh-home/profiles/agentor/cordis.patch.yml   ajustes locais (vazio: [])
            └─ config/clients/<cliente>/cordis.patch.yml   LLM, modelo e fontes do cliente
                 └─ config/offline.patch.yml   (só com --offline) troca o LLM
```

`pnpm dump-config --client <cliente>` imprime a árvore final, anotando qual camada definiu ou alterou cada linha.

## Kernel por inclusão

O kernel **não herda** de `@deepseek-ai/dsh-base`, que tem cerca de 90 linhas e cresce a cada versão. Ele lista explicitamente as linhas abaixo, derivadas do bundle `dsh-sdk-minimal` e do runner `dsh-headless` da versão fixada. Uma atualização do DSH não consegue colocar um plugin novo na árvore sem que alguém edite este arquivo. O teste e2e *"nenhum pacote DeepSeek na árvore composta"* reforça a regra.

| id | Pacote | Por que está no kernel |
|---|---|---|
| `headless-startup` | `dsh-headless/startup` | Lê pergunta e opções da linha de comando |
| `headless-runner` | `dsh-headless` | Cria o agente, roda um turno e imprime a resposta |
| `timer` | `cordis-plugin-timer` | Timers com descarte automático (usado pelo núcleo) |
| `llm` | `dsh-llm` | Registro de adaptadores e protocolo de streaming |
| `llm-retry` | `dsh-llm-retry` | Política de retry por provedor |
| `session` | `dsh-session` | Log de eventos só de adição: a fonte de todo o contexto do modelo |
| `session-projection` | `dsh-session-projection` | Estado derivado por sessão; base para o progresso do estagiário |
| `system-prompt` | `dsh-system-prompt` | Montagem do prompt; a persona tutora vem da camada training |
| `tools` | `dsh-tools` | Registro de tools e pipeline de execução |
| `tool-executor-native` | `dsh-tool-executor-native` | Executa as chamadas de tool do modelo |
| `agent` | `dsh-agent` | Interface e registro de agentes |
| `agent-loop` | `dsh-agent-loop` | O ciclo turno → passo → tools |
| `agent-default-model` | `dsh-agent-default-model` | Rota/modelo padrão; o cliente sobrescreve |
| `llm-pi-ai` | `dsh-llm-pi-ai` | Adaptador multi-provedor (OpenAI, Anthropic, gateways compatíveis) configurado por cliente |
| `sessions` | `dsh-session-persistence-jsonl` | Persistência das sessões em `.dsh-home/sessions` |

### O que ficou de fora e por quê

| Removido | Motivo |
|---|---|
| `dsh-llm-deepseek*`, `dsh-deepseek-llm-api-extensions`, `dsh-session-log-deepseek`, `dsh-plugin-package-inventory-deepseek`, `dsh-deepseek-account`, `dsh-web-search-deepseek`, `dsh-web-deepseek-api` | Específicos da DeepSeek. O provedor de LLM varia por cliente e entra pelo `llm-pi-ai`. |
| Shell, terminal, filesystem, sandbox, subprocess, jobs | O estagiário conversa com um tutor; nenhuma tool executa comandos ou escreve arquivos na máquina. Se um cliente precisar de exercícios práticos, a capacidade entra num bundle opcional, com sandbox. |
| Servidor SDK JSON-RPC, ACP, Web app | Fora da primeira superfície (headless). A Web é a próxima etapa ([roadmap](roadmap.md)). |
| Credenciais interativas e autorização | No headless a chave vem do ambiente a cada requisição ([clientes](clientes.md)). |
| Subagentes, times, workflows, goal, schedule, compactação, MCP | Não são necessários no mínimo validável. Vários deles voltam como base dos plugins de treinamento ([roadmap](roadmap.md)). |
| HMR (recarregar a configuração ao vivo) | Execução de um disparo; sem uso no headless. |

### Acoplamento com a DeepSeek que exigiu atenção

Levantamento feito no código-fonte do DSH:

- Os pacotes genéricos só referenciam pacotes DeepSeek em `devDependencies` (testes deles), com três exceções: `dsh-sdk-jsonrpc-server` (dependência obrigatória de `llm-deepseek-api-key`), `dsh-desktop-host` (`deepseek-account`) e `dsh-llm-replay`. **Nenhum deles está no kernel.**
- `dsh-base` define o modelo padrão como `provider: deepseek-official`. O kernel define o seu, e cada cliente o sobrescreve.

## Pacotes do repositório

| Pacote | Papel |
|---|---|
| `@agentor/bundle-kernel` | Bundle: a árvore DSH por inclusão |
| `@agentor/bundle-training` | Bundle: persona tutora e seam de conhecimento |
| `@agentor/knowledge` | Definição do seam `ctx.knowledge` |
| `@agentor/knowledge-fs` | Provider: documentos `.md`/`.txt` de uma pasta, busca por termos e seções |
| `@agentor/tool-knowledge` | Consumidor: tool `knowledge_search`, com citação da fonte |
| `@agentor/llm-offline` | Adaptador LLM determinístico, sem rede, para smoke tests. Não é um modelo. |

Os plugins são TypeScript e rodam sem etapa de build: o Node executa `.ts` com *type stripping* (apenas sintaxe apagável; verificada por `erasableSyntaxOnly` no `tsconfig.json`). Os pacotes do workspace são carregados por links a partir do profile (link simbólico no Linux e no macOS, *junction* no Windows, que não exige privilégio), e o pnpm deduplica o `@deepseek-ai/cordis` e o `@deepseek-ai/dsh-llm`, de modo que plugins do Agentor e do DSH compartilham as mesmas instâncias.

## Política de versões do DSH

- Todos os pacotes `@deepseek-ai/*` usam **versão exata** (`0.2.2-rc.1`), e o `pnpm-lock.yaml` trava a árvore transitiva.
- Os pacotes `@agentor/*` declaram `"engines": { "dsh": "0.2.2-rc.1" }`. Se o `dsh` instalado não satisfaz essa faixa, o launcher **pula o bundle** e escreve `dsh: skipping profile bundle "@agentor/bundle-kernel": ... is incompatible with dsh <versão>` no stderr. Um `dsh` atualizado sem revisão aparece como aviso explícito, não como comportamento estranho. **Atenção:** testado em 13/11/2026, o processo ainda termina com código 0, sem resposta (os plugins ficam `pending`). Por isso o `pnpm verify` é obrigatório após qualquer mudança de versão: os testes e2e exigem a resposta e falham nesse caso.
- **Atualizar o DSH:**
  1. Leia o changelog e o `cordis.patch.yml` dos bundles `dsh-sdk-minimal` e `dsh-headless` da nova versão.
  2. Compare com o kernel.
  3. Suba as versões exatas no `package.json` e no `engines.dsh` dos pacotes.
  4. Rode `pnpm install`, depois `pnpm verify` e `pnpm dump-config --client exemplo`.
  5. Registre o resultado em [registro-execucao.md](registro-execucao.md).
- **Referência de código:** sempre consulte os arquivos da **versão instalada** (`node_modules/.pnpm/@deepseek-ai+...`), não o `main` do repositório do DSH. Já há diferenças entre os dois; por exemplo, o `Config` do runner headless.
