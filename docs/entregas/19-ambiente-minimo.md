# Entrega — task #19: Preparar repositório e ambiente mínimo

| Campo | Valor |
|---|---|
| Frente | A |
| História | #15 A1 Escolher a base open source |
| Sprint | 1: Escolher a base e definir o cenário |
| Objetivo | Dar à equipe um ponto de partida que qualquer colega consiga repetir |

## Critérios de aceite e evidências

| # | Critério | Evidência |
|---|---|---|
| 1 | O repositório separa código, documentos e testes, com dependências registradas | Código em `packages/` (um pacote pnpm por plugin), configuração em `config/`, scripts em `scripts/`, documentos em `docs/`, testes em `tests/` ([README, Estrutura](../../README.md#estrutura)). Dependências em `package.json` (raiz e pacotes) e travadas em `pnpm-lock.yaml`, com os pacotes do DSH em versão exata. Instalação reprodutível: `pnpm install --frozen-lockfile` sem alterar o lockfile ([registro, B1](../registro-execucao.md#bateria-em-clone-limpo)). |
| 2 | O README indica pré-requisitos, comando de execução e erros conhecidos | [README](../../README.md): seções Pré-requisitos (sistema, Node, pnpm, Git, rede, chave), Instalação, Execução, Testes e Erros conhecidos (sintoma, causa e o que fazer, inclusive os casos do Windows). |
| 3 | Há um exemplo de configuração sem valores secretos e nenhuma credencial real no repositório | [`config/clients/exemplo/cordis.patch.yml`](../../config/clients/exemplo/cordis.patch.yml) usa só referências (`apiKeyEnv`); [`config/.env.example`](../../config/.env.example) tem os nomes das variáveis, sem valores; o `.gitignore` exclui `.env` e `.dsh-home/`. Varredura de padrões de segredo nos arquivos versionados: nenhuma ocorrência ([registro](../registro-execucao.md#bateria-em-clone-limpo)). |
| 4 | O comando foi executado e o resultado ou impedimento está registrado | [Registro de execução](../registro-execucao.md): 2026-11-13 em Linux (container) e 2026-11-14 em Windows 11, com clone limpo, bateria B1–B10 e o defeito encontrado e corrigido no Windows. Impedimento registrado: chamada a um LLM real não validada (sem chave, por política). |

## Partes simuladas

Nada abaixo conta como integração com um modelo real:

- **`@agentor/llm-offline`**: adaptador determinístico, não é um modelo. Chama a busca e devolve o trecho encontrado. É usado por `pnpm smoke`, `--offline` e os testes e2e.
- **Documentos do cliente `exemplo`**: fictícios, sem dados pessoais nem de empresa real.

## Como revisar (reprodução por outra pessoa)

Pré-requisitos: Node ≥ 24.9 e pnpm 10.28.0 (veja o [README](../../README.md#pré-requisitos)). Em um clone novo:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm verify
```

```bash
pnpm smoke
```

```bash
pnpm dump-config --client exemplo
```

Esperado:

- `pnpm verify` termina com 26 testes, 26 passando.
- `pnpm smoke` responde citando `manual-do-estagiario.md`.
- `pnpm dump-config` lista a árvore de plugins sem pacotes específicos da DeepSeek.

Registre sistema, versões e resultado em [registro-execucao.md](../registro-execucao.md), em uma nova seção com data.

## A preencher

| Campo | Valor |
|---|---|
| Responsável | |
| Revisor | |
| Dependências e alternativa com dados simulados | Depende dos pacotes npm do DSH 0.2.2-rc.2, a versão avaliada na escolha da base. Sem chave de LLM, a alternativa é o adaptador `llm-offline` com os documentos fictícios do cliente `exemplo`. |
| Dados utilizados e risco | Somente documentos fictícios. Risco baixo: nenhuma credencial nem dado pessoal no repositório. |
| Links do artefato, da revisão e da evidência | Commits `a878239` (ambiente mínimo), `dc3240a` (portabilidade Windows), `0593456` (instruções Windows e Linux) e o commit deste documento; [registro de execução](../registro-execucao.md). Revisão: |
| Horas realizadas | |

## Fora do escopo desta task

Apenas para referência; nenhum destes itens foi tratado aqui:

- Chamada a um LLM real com pergunta conhecida e sem resposta.
- CI com testes e busca de segredos.
- Registro de decisão com licenças (SBOM).

Resolvido depois da entrega: a versão do DSH usada (0.2.2-rc.1) foi alinhada à avaliada na escolha da base (0.2.2-rc.2) em 14/11/2026 ([registro de execução](../registro-execucao.md)).
- Especificação e implementação da tool de leitura de arquivo.
