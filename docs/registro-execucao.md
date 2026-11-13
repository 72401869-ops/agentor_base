# Registro de execução

Registro dos comandos executados para validar o ambiente mínimo, com o resultado ou o impedimento encontrado. Acrescente uma nova seção, com data, a cada validação relevante (atualização do DSH, cliente novo, nova superfície).

## 2026-11-13 — Ambiente mínimo headless

### Ambiente

| Item | Valor |
|---|---|
| Sistema | Linux (container de nuvem, efêmero) |
| Node.js | v24.22.1 (`/opt/node24/bin`; o `node` padrão do container é o 22.23.4) |
| pnpm | 10.28.0 |
| `@deepseek-ai/dsh` | 0.2.2-rc.1 (versão exata; tag `latest` no npm nesta data) |
| Rede | registro npm liberado; hosts de provedores de LLM bloqueados pelo proxy do container |

### Comandos e resultados

Instalação a partir do zero (`node_modules` e `.dsh-home` apagados antes):

```bash
export PATH=/opt/node24/bin:$PATH
```

```bash
pnpm install --frozen-lockfile
```

Resultado: **ok**. Lockfile consistente; `Done in 1.8s`. Aviso inofensivo: `Ignored build scripts: @google/genai, koffi, protobufjs` (dependências transitivas que o kernel não usa).

```bash
pnpm setup:profile
```

Resultado: **ok**.

```
profile "agentor" pronto em /home/user/agentor_base/.dsh-home/profiles/agentor
bundles: @agentor/bundle-kernel → @agentor/bundle-training
pacotes linkados: @agentor/bundle-kernel, @agentor/bundle-training, @agentor/knowledge, @agentor/knowledge-fs, @agentor/tool-knowledge, @agentor/llm-offline
```

```bash
pnpm smoke
```

Resultado: **ok**, código 0. Ciclo completo: kernel → agent-loop → tool `knowledge_search` → `ctx.knowledge` → provider de arquivos → resposta → sessão gravada.

```
Resposta offline (sem LLM real) baseada na base de conhecimento:
[1] Manual do Estagiário — Cliente Exemplo (fonte: exemplo-manual, documento: manual-do-estagiario.md)
## Jornada e ponto eletrônico A jornada do estagiário é de 6 horas diárias, 30 horas semanais. O ponto eletrônico é registrado no aplicativo Ponto Exemplo na entrada, na saída para o intervalo, no retorno e na saída final. Esquecimentos de marcação devem ser justificados ao mentor no mesmo dia pelo formulário de ajuste de ponto.
```

```bash
pnpm verify
```

Resultado: **ok**. `tsc` sem erros; **22 testes, 22 passaram, 0 falharam** (17 unitários, 5 e2e).

```
✔ agentor headless (e2e)
  ✔ kernel por inclusão: nenhum pacote DeepSeek na árvore composta
  ✔ responde offline usando a base de conhecimento do cliente e persiste a sessão
  ✔ emite eventos NDJSON com --json
  ✔ sem a chave do cliente, falha com MISSING_CREDENTIAL antes de qualquer rede
  ✔ recusa cliente inexistente com código 2
✔ knowledge-fs: funções puras
✔ knowledge-fs: fonte em pasta
✔ ctx.knowledge
✔ llm-offline
✔ tool knowledge_search no pipeline real de tools do DSH
ℹ tests 22  ℹ pass 22  ℹ fail 0
```

```bash
pnpm dump-config --client exemplo
```

Resultado: **ok**. A árvore tem só as linhas do kernel, da camada training e do cliente; nenhum pacote DeepSeek e nenhum `dsh-base`.

### Impedimentos e verificações negativas

**Chamada a um LLM real não validada.** O repositório não tem chave real, por política. Simulamos a chave com um valor falso em `.dsh-home/.env`:

```bash
pnpm agentor --client exemplo "Como funciona o ponto eletrônico?"
```

```
dsh: AUTH: Connection error.: Proxy response (403) !== 200 when HTTP Tunneling (UND_ERR_ABORTED)
```

Conclusão: a chave foi lida do `.env` (sem ela o erro seria `MISSING_CREDENTIAL`) e a requisição saiu, mas o proxy do container bloqueia o host do provedor. **Pendente:** repetir em um ambiente com rede liberada para o provedor e uma chave real de teste, e registrar aqui.

**Sem chave**, a execução falha antes de acessar a rede (coberto pelo teste e2e):

```
dsh: MISSING_CREDENTIAL: llm-pi-ai: no credential for provider route "openai"; its profile resolves AGENTOR_EXEMPLO_OPENAI_KEY, which is not set — ...
```

**Versão incompatível do DSH.** Teste manual, com o `engines.dsh` do kernel alterado temporariamente para `>=0.3.0`:

```
dsh: skipping profile bundle "@agentor/bundle-kernel": Error: Plugin @agentor/bundle-kernel@0.1.0 is incompatible with dsh 0.2.2-rc.1: requirements {"engines.dsh":">=0.3.0"}. ...
dsh: warning: 2 entries did not activate
tool-knowledge (@agentor/tool-knowledge): pending (waiting for service: tools)
llm-offline (@agentor/llm-offline): pending (waiting for service: llm)
```

O processo terminou com **código 0** e sem resposta. Isso está documentado em "Erros conhecidos" do README; os testes e2e detectam o caso.

**Node 22.23.4.** O `pnpm smoke` também passou com o Node padrão do container, mas essa versão fica fora do `engines` do DSH (≥ 24.9.0). Consideramos sem suporte.

### Problemas corrigidos durante a validação

- `!!js` com template literal (crase) no patch do cliente: `YAMLException: cannot resolve a node with !<tag:yaml.org,2002:js> explicit tag`. Corrigido colocando a expressão entre aspas; o caso está nos erros conhecidos.
- O provider de arquivos devolvia uma seção só com título (`# Férias`) em vez do conteúdo. Agora seções sem corpo são anexadas à seção seguinte; há teste unitário cobrindo.
