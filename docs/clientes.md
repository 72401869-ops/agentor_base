# Configurar um cliente

Cada cliente do Agentor tem **as próprias fontes de dados** e **o próprio provedor de LLM**. Tudo isso fica numa pasta de configuração, sem código e sem segredos:

```
config/clients/<cliente>/
  cordis.patch.yml     LLM, modelo padrão e fontes de conhecimento
  conhecimento/        (opcional) documentos lidos pelo provider de arquivos
```

O lançador aplica esse patch por cima dos bundles kernel e training (veja [arquitetura](arquitetura.md#camadas-de-composição)) e define `AGENTOR_CLIENT_DIR` com o caminho da pasta.

## 1. Criar a pasta do cliente

```bash
cp -r config/clients/exemplo config/clients/acme
```

O nome do cliente aceita letras minúsculas, números e hífen.

## 2. Provedor de LLM e chaves

A linha `llm-pi-ai` declara as rotas de LLM do cliente. Um patch **substitui o `config` inteiro** da linha, então liste todas as rotas que o cliente usa.

```yaml
- id: llm-pi-ai
  config:
    providers:
      # Provedor do catálogo do pi-ai: só a referência da chave
      anthropic:
        apiKeyEnv: AGENTOR_ACME_ANTHROPIC_KEY
      # Gateway próprio do cliente, compatível com OpenAI
      acme-gateway:
        api: openai-completions
        baseURL: https://llm.acme.example/v1
        apiKeyEnv: AGENTOR_ACME_GATEWAY_KEY
        models:
          - id: modelo-interno
            contextWindow: 128000

- id: agent-default-model
  config:
    provider: anthropic        # nome da rota acima
    model: claude-sonnet-4-5   # id do modelo nessa rota
```

**Chaves.** `apiKeyEnv` é o **nome** de uma variável de ambiente, nunca o valor. O `dsh-llm-pi-ai` resolve essa referência **a cada requisição**, o que permite:

- trocar a chave de um cliente sem editar nenhum arquivo do repositório;
- usar nomes diferentes por cliente (`AGENTOR_<CLIENTE>_...`), evitando que um cliente use a chave de outro por engano.

Onde colocar o valor, em ordem de precedência:

1. Variável exportada no shell ou no ambiente do serviço (o ambiente herdado vence).
2. `.dsh-home/.env`: crie a partir de [`config/.env.example`](../config/.env.example). O arquivo é ignorado pelo git.

> Nunca commite um `.env` real nem escreva uma chave em `cordis.patch.yml`. Os nomes reservados pelo DSH (`DSH_*`, `PATH`, `XDG_*`) são recusados quando vêm de arquivos `.env`.

Sem a chave, a execução falha logo, antes de qualquer acesso à rede, com `MISSING_CREDENTIAL`, citando o nome da variável que falta.

## 3. Fontes de conhecimento

Cada fonte é uma linha inserida que aponta para um **provider**. Um cliente pode ter várias fontes, de tipos diferentes:

```yaml
- insert:
    - id: knowledge-acme-manual
      name: '@agentor/knowledge-fs'
      config:
        id: acme-manual                  # aparece nas citações
        description: Manual do estagiário da Acme
        root: !!js "process.env.AGENTOR_CLIENT_DIR + '/conhecimento'"
        extensions: ['.md', '.txt']      # opcional
        maxExcerptChars: 800             # opcional

    - id: knowledge-acme-politicas
      name: '@agentor/knowledge-fs'
      config:
        id: acme-politicas
        description: Políticas de RH e segurança
        root: /srv/acme/politicas        # caminho absoluto também funciona
```

- Expressões `!!js` precisam estar **entre aspas** quando começam com um caractere reservado do YAML, como a crase.
- Hoje existe só o provider de arquivos (`@agentor/knowledge-fs`). Fontes como Confluence, Drive, banco de dados ou um servidor MCP entram como novos pacotes `@agentor/knowledge-*` que implementam o mesmo contrato `KnowledgeSource`, sem mudança na tool nem na persona ([roadmap](roadmap.md)).

## 4. Validar

Sem chave e sem rede, só para conferir a composição e as fontes:

```bash
pnpm agentor --client acme --offline "uma pergunta cuja resposta está nos documentos"
```

Ver a árvore final de plugins:

```bash
pnpm dump-config --client acme
```

Com o LLM real:

```bash
pnpm agentor --client acme "Como peço acesso ao sistema de chamados?"
```
