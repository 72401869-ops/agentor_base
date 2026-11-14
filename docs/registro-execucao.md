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

## 2026-11-14 — Reprodução em Windows

Objetivo: confirmar que outra máquina, com o sistema usado pela equipe, repete a instalação e a validação do ambiente mínimo seguindo só o README.

### Ambiente

| Item | Valor |
|---|---|
| Sistema | Windows 11 Pro 10.0.26200, usuário comum (sem Modo de Desenvolvedor, sem administrador) |
| Shell | Windows PowerShell 5.1 (os scripts do pnpm rodam pelo cmd.exe) |
| Node.js | v24.14.0 |
| pnpm | 10.28.0 |
| `@deepseek-ai/dsh` | 0.2.2-rc.1 (travado no lockfile) |
| Git | `core.autocrlf=true` (a cópia de trabalho original estava com CRLF) |
| Rede | registro npm liberado; nenhuma chave de LLM configurada |

### Diagnóstico com o commit anterior (`a878239`)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | **ok** em 4m17s (primeira instalação, cache vazio). O aviso `Ignored build scripts` no Windows também lista `node-pty` e `@deepseek-ai/dsh-subprocess-local`. |
| `pnpm typecheck` | **ok** |
| `pnpm test:unit` | **ok**: 17 testes, 17 passaram |
| `pnpm setup:profile` | **falhou** (código 1) |

```
setup falhou: EPERM: operation not permitted, symlink '..\..\..\..\..\packages\bundles\kernel' -> '...\.dsh-home\profiles\agentor\node_modules\@agentor\bundle-kernel'
```

No Windows, um link simbólico de diretório exige Modo de Desenvolvedor ou administrador. Como o lançador recria o profile a cada execução, `pnpm smoke`, `pnpm agentor` e os testes e2e também ficavam bloqueados.

### Problemas corrigidos

- **Links do profile.** O `scripts/setup-profile.mjs` passou a criar *junctions* no Windows. Elas não exigem privilégio e só aceitam alvo absoluto. Nos demais sistemas o link simbólico relativo continua. Antes da troca, verificamos num diretório descartável que o `rm` recursivo do setup remove só a junction e preserva o conteúdo apontado. Um teste unitário novo cobre a criação dos links e a repetição do setup sem perda de `packages/`.
- **Finais de linha.** O `.gitattributes` (`eol=lf`) mantém os arquivos iguais em qualquer sistema. Com a cópia em CRLF, o provider de arquivos e os testes já funcionavam. Para documentos de cliente criados no Windows, testes unitários novos cobrem documentos CRLF.

### Bateria em clone limpo

Clone do repositório local no commit `0593456`, num caminho **com espaço** (`...\scratchpad\agentor teste limpo`), para simular uma pasta de usuário como `C:\Users\Nome Sobrenome`. Antes de rodar, as variáveis `AGENTOR_CLIENT`, `AGENTOR_EXEMPLO_*` e `DSH_HOME` foram removidas do ambiente. Os arquivos do clone saíram com LF (38 de 38).

| # | Comando ou verificação | Resultado |
|---|---|---|
| B1 | `pnpm install --frozen-lockfile` | **ok** em 28,9s (cache local já populado) |
| B2 | `pnpm setup:profile` duas vezes; links em `.dsh-home\profiles\agentor\node_modules\@agentor` | **ok**: 6 junctions válidas; os 6 `package.json` de `packages\` intactos |
| B3 | `pnpm typecheck` | **ok** |
| B4 | `pnpm test:unit` | **ok**: 21 testes, 21 passaram |
| B5 | `pnpm test:e2e` | **ok**: 5 testes, 5 passaram (12,6s) |
| B6 | `pnpm smoke` | **ok**: resposta com `fonte: exemplo-manual, documento: manual-do-estagiario.md` |
| B7 | `pnpm agentor --client exemplo --offline --json "Qual a regra de senhas?"` | **ok**: 11 linhas, todas JSON válido, citando `politica-de-seguranca.md` |
| B8 | `pnpm dump-config --client exemplo` | **ok**: 18 plugins, nenhum específico da DeepSeek e nenhum `dsh-base` |
| B9 | cliente inexistente / sem `--client` / nome inválido (`ACME`) / sem a chave do cliente | **ok**: códigos 2 / 2 / 2 / 1; o último com `MISSING_CREDENTIAL` citando `AGENTOR_EXEMPLO_OPENAI_KEY` |

Também na cópia de trabalho original, ainda com CRLF:

| # | Comando | Resultado |
|---|---|---|
| B10 | `pnpm verify` | **ok**: 26 testes (21 unitários, 5 e2e), 26 passaram |
| B10 | `pnpm smoke` | **ok** |

Varredura de segredos nos 38 arquivos versionados (exceto o lockfile), com padrões de chaves de provedores (OpenAI, Anthropic, AWS, GitHub, Slack, Google), JWT, chave privada PEM e atribuições `api_key`/`secret`/`token`/`password`/`senha` com valor literal: **nenhuma ocorrência**. Nenhum `.env`, `.pem` ou `.key` versionado. Um controle positivo confirmou que os padrões detectam chaves. A varredura por padrões não é garantia de ausência de segredos.

### Impedimentos e observações

- **Chamada a um LLM real continua não validada.** Por política, não há chave no repositório, e nenhuma foi configurada nesta máquina. Fica para a integração com um provedor real.
- **Acentos no stderr capturado pelo Windows PowerShell 5.1.** Ao redirecionar a saída de erro do `node` para arquivo, o PowerShell 5.1 decodifica os acentos com a página de código do console (por exemplo, `n�o` em vez de `não`). A mensagem do Agentor está correta; o efeito é só da captura. O stdout das respostas sai correto.
- **Reprodução por outra pessoa:** pendente. O roteiro está em [entregas/19-ambiente-minimo.md](entregas/19-ambiente-minimo.md).
