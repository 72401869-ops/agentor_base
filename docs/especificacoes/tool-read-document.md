# Especificação: tool `read_document` (leitura de documentos de fontes autorizadas)

> **Situação:** especificada, não implementada. Esta é a entrega da task #20 (Sprint 1). A implementação do provider de pasta local e da tool é a task #41 (Sprint 2). Os demais tipos de fonte ficam para os épicos E08 (novas fontes e conectores) e E09 (busca vetorial).
>
> **Versão da especificação:** 0.1 (2026-11-14).

A `knowledge_search` devolve **trechos** curtos. A `read_document` complementa essa busca: o modelo lê na íntegra um documento que a busca encontrou, e somente se ele estiver em uma **fonte autorizada** do cliente. A tool não recebe caminho, URL nem consulta livre: recebe o id de uma fonte autorizada e o id de um documento dessa fonte.

## Sumário

1. [Manifesto](#1-manifesto)
2. [O que a tool não faz](#2-o-que-a-tool-não-faz)
3. [Fontes autorizadas](#3-fontes-autorizadas)
4. [Regras de autorização por tipo de fonte](#4-regras-de-autorização-por-tipo-de-fonte)
5. [Configuração](#5-configuração)
6. [Entrada](#6-entrada)
7. [Saída](#7-saída)
8. [Erros](#8-erros)
9. [Exemplos](#9-exemplos)
10. [Plano de testes para a implementação](#10-plano-de-testes-para-a-implementação)
11. [Riscos e limites](#11-riscos-e-limites)
12. [Por que não reaproveitar o `dsh-tool-fs`](#12-por-que-não-reaproveitar-o-dsh-tool-fs)

## 1. Manifesto

| Campo | Valor |
|---|---|
| Nome da tool | `read_document` |
| Pacote previsto | `@agentor/tool-read-document`, em `packages/knowledge/tool-read-document/` (ao lado da `tool-knowledge`) |
| Finalidade | Ler na íntegra um documento de uma fonte autorizada do cliente e devolvê-lo ao modelo com a origem explícita, para que a resposta ao estagiário cite o documento |
| Entrada | `source` (id da fonte) e `document` (id do documento na fonte). Veja [Entrada](#6-entrada) |
| Saída | Texto com cabeçalho de origem e conteúdo, mais um valor estruturado. Veja [Saída](#7-saída) |
| Erros | Códigos estáveis, sem expor caminhos absolutos nem credenciais. Veja [Erros](#8-erros) |
| Dono | Frente A. Responsável: _a preencher_ |
| Escopo | **Somente leitura**, e somente de documentos das fontes autorizadas do cliente (`ctx.knowledge`) |
| Ativação | Opcional, por cliente. O bundle `training` **não** liga a tool; o cliente insere a linha no próprio patch |
| Dependências (serviços Cordis) | `tools` (registro de tools do DSH) e `knowledge` (registro de fontes do Agentor) |
| Risco | Baixo: nenhuma escrita, nenhum comando, nenhuma rede além das fontes que o cliente configurou |
| Implementação | Pasta local: task #41. OneDrive, Google Drive, banco de documentos e banco vetorial: épicos E08 e E09 |

## 2. O que a tool não faz

A `read_document`:

- **não escreve, não apaga, não move e não renomeia** nada, em nenhuma fonte;
- **não executa comandos** nem programas;
- **não lista** pastas, diretórios, coleções ou tabelas. O modelo chega ao documento pela `knowledge_search`;
- **não aceita do modelo** caminho absoluto, URL, consulta SQL, filtro ou expressão. Recebe apenas dois ids;
- **não acessa** nenhuma fonte fora da lista autorizada do cliente;
- **não segue** links simbólicos, *junctions*, atalhos ou itens compartilhados que levem para fora do escopo da fonte;
- **não lê** binários nem imagens; só texto;
- **não guarda** o conteúdo em lugar nenhum além da sessão, que já registra as chamadas de tool.

## 3. Fontes autorizadas

### 3.1 A lista é o registro de conhecimento

Cada cliente já declara as fontes de conhecimento no próprio patch (`config/clients/<cliente>/cordis.patch.yml`), e cada linha registra uma fonte no serviço `ctx.knowledge` ([definição](../../packages/knowledge/knowledge/src/index.ts)). **Essa mesma lista é a lista de fontes autorizadas para leitura.** Não existe outra lista. O que não está registrado em `ctx.knowledge` não existe para a `read_document`.

| Tipo de fonte | Provider | Escopo configurado | `documentId` |
|---|---|---|---|
| Pasta local | `@agentor/knowledge-fs` (existe; ganha `read` na #41) | `root`: uma pasta. Padrão: `config/clients/<cliente>/conhecimento/` | Caminho relativo à pasta, com `/` |
| OneDrive | `@agentor/knowledge-onedrive` (futuro, E08) | Uma pasta vinculada (`driveId` + `folderId`) | Id do item no Microsoft Graph |
| Google Drive | `@agentor/knowledge-gdrive` (futuro, E08) | Uma pasta vinculada (`folderId`, opcionalmente `driveId` de drive compartilhado) | Id do arquivo no Drive |
| Banco de documentos | `@agentor/knowledge-sql` ou `-docdb` (futuro, E08) | Uma tabela ou coleção e uma consulta de leitura parametrizada | Valor da chave do documento |
| Banco vetorial | `@agentor/knowledge-vector` (futuro, E09) | Uma coleção e filtros fixos | Id do documento de origem dos vetores |

### 3.2 Extensão do contrato `KnowledgeSource`

O contrato atual tem `id`, `description` e `search()`. A especificação acrescenta uma operação **opcional**, de modo que as fontes existentes continuam válidas sem mudança:

```ts
interface KnowledgeSource {
  id: string
  description: string
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>
  /** Opcional. Ausente = fonte só de busca. */
  read?(documentId: string, options: KnowledgeReadOptions): Promise<KnowledgeDocument>
}

interface KnowledgeReadOptions {
  /** Limite de caracteres do conteúdo devolvido; o provider corta e marca `truncated`. */
  maxChars: number
  signal?: AbortSignal
}

interface KnowledgeDocument {
  documentId: string   // o mesmo id recebido, normalizado (pasta local: com "/")
  title: string        // primeiro título Markdown, nome do item ou campo de título
  content: string      // texto UTF-8, já cortado em maxChars
  bytes: number        // tamanho do original, antes do corte
  truncated: boolean
  version?: string     // quando a fonte tiver (ETag, revisão, data de modificação)
}
```

O registro `KnowledgeRegistry` ganha:

- `read(sourceId, documentId, options)`: localiza a fonte pelo id e chama `read`. Lança `KnowledgeReadError` com um dos códigos da seção [Erros](#8-erros);
- em `list()`, o campo `readable: boolean` em cada fonte.

Os providers lançam `KnowledgeReadError(code, message)`. A mensagem vai para o modelo e, por isso, segue as regras da seção 8.

### 3.3 Regras comuns a todos os tipos

1. **O `documentId` é opaco e pertence à fonte.** O modelo usa os ids que a própria fonte devolveu, normalmente pela `knowledge_search` (`fonte: <id>, documento: <id>`). A tool não interpreta o id; quem valida é o provider.
2. **O escopo é validado antes da leitura.** O provider confirma que o documento está dentro do escopo configurado **antes** de ler ou baixar qualquer byte. Se não estiver, a resposta é `OUTSIDE_SCOPE`, sem leitura.
3. **As credenciais são referências.** Toda credencial de fonte remota segue o padrão do LLM: o nome de uma variável de ambiente (`apiKeyEnv`, `credentialsEnv`), nunca o valor no patch. A permissão é **só leitura**.
4. **Os limites de tamanho valem para todos os tipos:** `maxBytes` por documento na fonte e `maxChars` no conteúdo devolvido.
5. **As falhas ficam isoladas por fonte.** Uma fonte remota fora do ar responde `SOURCE_UNAVAILABLE` e não afeta as demais, como já acontece na busca.

## 4. Regras de autorização por tipo de fonte

### 4.1 Pasta local (`@agentor/knowledge-fs`, implementado na #41)

**Escopo:** a pasta `root` da fonte, cujo padrão é `AGENTOR_CLIENT_DIR + '/conhecimento'`. O `documentId` é o caminho relativo a essa pasta, exatamente como a busca devolve em `documento:`.

**Validação, nesta ordem.** A primeira regra violada define o erro, e nenhum byte é lido antes do passo 7:

| Passo | Regra | Erro |
|---|---|---|
| 1 | O `documentId` não pode ser vazio, ter mais de 1024 caracteres nem conter o byte nulo (`\0`) | `INVALID_DOCUMENT_ID` |
| 2 | Recusar caminho absoluto em qualquer sistema: começa com `/` ou `\`, tem letra de unidade (`C:`), é UNC (`\\servidor\...`) ou caminho de dispositivo (`\\?\`, `\\.\`) | `INVALID_DOCUMENT_ID` |
| 3 | Recusar `:` em qualquer segmento (fluxos alternativos do NTFS, como `arquivo.md:oculto`) | `INVALID_DOCUMENT_ID` |
| 4 | Trocar `\` por `/` e normalizar (`path.posix.normalize`). Se o resultado começar com `../` ou for `..`, recusar. **Um `..` que continua dentro da pasta é aceito** (`sub/../manual.md` vira `manual.md`) | `OUTSIDE_SCOPE` |
| 5 | Resolver o caminho real (`realpath`) da pasta `root` e do alvo. O alvo real precisa ficar dentro da pasta real: `path.relative(rootReal, alvoReal)` não pode começar com `..` nem ser absoluto. Isso cobre links simbólicos e *junctions* que apontam para fora. No Windows a comparação não diferencia maiúsculas de minúsculas | `OUTSIDE_SCOPE` |
| 6 | O alvo precisa existir e ser **arquivo regular** (não pasta nem dispositivo) | `NOT_FOUND` / `NOT_A_DOCUMENT` |
| 7 | A extensão precisa estar em `extensions` da fonte (padrão `.md`, `.markdown`, `.txt`), sem diferenciar maiúsculas de minúsculas | `TYPE_NOT_ALLOWED` |
| 8 | Tamanho até `maxBytes` (padrão 1 MiB), verificado por `stat` antes de ler | `TOO_LARGE` |
| 9 | Ler o arquivo e decodificar como UTF-8 com `fatal: true`; texto com byte nulo também é recusado | `NOT_TEXT` |
| 10 | Cortar em `maxChars` e marcar `truncated` | (não é erro) |

Uma falha inesperada do sistema de arquivos (permissão negada, disco) devolve `READ_FAILED`. A mensagem não contém o caminho absoluto.

### 4.2 OneDrive e Google Drive (futuro, E08)

- **Escopo:** **uma** pasta vinculada por fonte (`driveId`/`folderId`). O `documentId` é o id do item, devolvido pela busca da própria fonte.
- **Validação antes do download:**
  1. buscar os metadados do item;
  2. subir pela cadeia de pais até a raiz do drive e confirmar que a pasta configurada está nessa cadeia;
  3. se não estiver, `OUTSIDE_SCOPE`.

  Atalhos (Google Drive) e itens "compartilhados comigo" que não estejam fisicamente dentro da pasta vinculada são recusados com `OUTSIDE_SCOPE`. A tool não resolve o destino do atalho.
- **Tipos aceitos:** texto (`text/plain`, `text/markdown`) e documentos nativos exportados como texto (Google Docs → `text/plain`; Word online → conversão para texto). Os demais tipos recebem `TYPE_NOT_ALLOWED`.
- **Credencial:** escopo **só leitura** e o mais restrito possível:
  - Google Drive: `drive.readonly` ou, de preferência, `drive.file` com a pasta compartilhada com a conta de serviço;
  - OneDrive: `Files.Read` ou `Files.Read.Selected`.

  A credencial entra por referência (`credentialsEnv`). Uma credencial ausente ou recusada devolve `AUTH_FAILED`, citando só o nome da variável.
- **Saída:** nunca inclui URL de download, token ou link de compartilhamento.

### 4.3 Banco de documentos (SQL ou NoSQL; futuro, E08)

- **Escopo:** uma tabela ou coleção fixa e uma **consulta de leitura parametrizada**, escrita na configuração. Exemplo: `SELECT titulo, corpo FROM documentos WHERE id = $1 AND publicado = true`. O `documentId` é **somente** o valor do parâmetro; nenhum texto do modelo é concatenado na consulta.
- **Validação:** o formato do id é conferido por um padrão declarado na fonte (por exemplo, `^[0-9]+$` ou UUID); fora do padrão, a resposta é `INVALID_DOCUMENT_ID`. Uma consulta que não retorna linha devolve `NOT_FOUND`. Os filtros fixos (`publicado = true`, `cliente = 'acme'`) fazem parte do escopo.
- **Credencial:** usuário de banco **somente leitura**, restrito à tabela ou coleção, por referência (`connectionStringEnv`).

### 4.4 Banco vetorial (futuro, E09)

- **Escopo:** uma coleção fixa e filtros de metadados fixos na configuração (por exemplo, `cliente = 'acme'`).
- **Leitura:** pelo id do documento de origem. O provider busca todos os trechos desse documento na coleção, **com os filtros fixos aplicados**, e os junta na ordem original (metadado de posição). Se não houver trecho, `NOT_FOUND`; se o documento existir só fora dos filtros, a resposta também é `NOT_FOUND`, para não revelar dados de outro escopo.
- **Credencial:** chave **somente leitura**, por referência.

## 5. Configuração

### 5.1 Da tool

| Chave | Padrão | Significado |
|---|---|---|
| `maxChars` | `20000` | Tamanho máximo do conteúdo devolvido ao modelo; o excedente é cortado e marcado `truncated` |
| `sources` | todas as fontes legíveis | Lista opcional de ids de fontes que a tool pode ler. Serve para que o cliente libere a leitura de só algumas fontes |

### 5.2 Das fontes

A pasta local ganha `maxBytes` (padrão `1048576`, 1 MiB) no `@agentor/knowledge-fs`. As demais chaves (`id`, `description`, `root`, `extensions`, `maxExcerptChars`) já existem ([provider](../../packages/knowledge/knowledge-fs/src/index.ts)).

### 5.3 Exemplo de patch de cliente

Referência para a #41. O patch real do cliente `exemplo` **não muda** nesta task.

```yaml
- insert:
    # Fonte já existente: pasta local, agora também legível na íntegra.
    - id: knowledge-exemplo-manual
      name: '@agentor/knowledge-fs'
      config:
        id: exemplo-manual
        description: Manual do estagiário e políticas internas do cliente exemplo
        root: !!js "process.env.AGENTOR_CLIENT_DIR + '/conhecimento'"
        maxBytes: 1048576

    # Ativação opcional da tool, só para este cliente.
    - id: tool-read-document
      name: '@agentor/tool-read-document'
      config:
        maxChars: 20000
        sources: [exemplo-manual]

    # Ilustração de fonte remota (provider futuro, E08). Não usar ainda.
    # - id: knowledge-exemplo-drive
    #   name: '@agentor/knowledge-gdrive'
    #   config:
    #     id: exemplo-drive
    #     description: Pasta "Onboarding" do Google Drive do cliente
    #     folderId: 1AbCdEfGhIjKlMnOpQrStUvWxYz
    #     credentialsEnv: AGENTOR_EXEMPLO_GDRIVE_CREDENTIALS
```

## 6. Entrada

JSON Schema dos argumentos da tool:

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "string",
      "description": "Id da fonte autorizada, exatamente como aparece em 'fonte:' no resultado da knowledge_search."
    },
    "document": {
      "type": "string",
      "description": "Id do documento na fonte, exatamente como aparece em 'documento:' no resultado da knowledge_search."
    }
  },
  "required": ["source", "document"]
}
```

Na implementação, o schema entra pelo formato de `parameters` do `defineTool`, como na [`knowledge_search`](../../packages/knowledge/tool-knowledge/src/index.ts) (`{ type: 'string', required: true, description }`). O DSH valida os argumentos antes de executar, e um argumento obrigatório ausente não chega ao provider.

Descrição apresentada ao modelo, no mesmo tom da `knowledge_search`:

> Lê na íntegra um documento da base de conhecimento do cliente. Use depois da knowledge_search, quando o trecho não bastar, passando a fonte e o documento que ela informou. Só lê fontes autorizadas; não lista pastas e não aceita caminhos ou URLs.

## 7. Saída

**Texto para o modelo.** Usa o mesmo formato de origem da `knowledge_search` ([`renderResult`](../../packages/knowledge/tool-knowledge/src/index.ts)):

```
<título> (fonte: <source>, documento: <document>)
<conteúdo>
```

Quando `truncated` for verdadeiro, a última linha passa a ser:

```
[Conteúdo truncado: <maxChars> de <total> caracteres exibidos.]
```

**Valor estruturado,** para logs e testes:

```ts
{ sourceId: string, documentId: string, title: string, bytes: number, truncated: boolean, content: string }
```

**Nunca aparecem na saída** (de sucesso ou de erro): caminho absoluto do host, URL de download, token, string de conexão ou valor de credencial.

## 8. Erros

Os erros voltam para o modelo como resultado da tool, com o código entre colchetes. O modelo consegue explicar o problema ao estagiário, e os testes conferem o código. As mensagens citam só o `source` e o `document` recebidos; nunca citam o caminho real.

| Código | Quando ocorre | Mensagem ao modelo (modelo de texto) |
|---|---|---|
| `UNKNOWN_SOURCE` | A fonte não está em `ctx.knowledge` ou não está em `sources` da tool | `[UNKNOWN_SOURCE] A fonte "<source>" não é uma fonte autorizada deste cliente.` |
| `SOURCE_NOT_READABLE` | A fonte existe, mas não implementa `read` | `[SOURCE_NOT_READABLE] A fonte "<source>" permite busca, mas não leitura integral.` |
| `INVALID_DOCUMENT_ID` | Id vazio, longo demais, absoluto, com `\0` ou `:`, ou fora do formato da fonte | `[INVALID_DOCUMENT_ID] "<document>" não é um id de documento válido nesta fonte.` |
| `OUTSIDE_SCOPE` | O documento fica fora da pasta, da pasta vinculada ou do escopo da fonte | `[OUTSIDE_SCOPE] "<document>" está fora do escopo autorizado da fonte "<source>". Nada foi lido.` |
| `NOT_FOUND` | O documento não existe no escopo | `[NOT_FOUND] O documento "<document>" não foi encontrado na fonte "<source>".` |
| `NOT_A_DOCUMENT` | O id aponta para uma pasta, um dispositivo ou outro item que não é documento | `[NOT_A_DOCUMENT] "<document>" não é um documento.` |
| `TYPE_NOT_ALLOWED` | A extensão ou o tipo MIME está fora da lista da fonte | `[TYPE_NOT_ALLOWED] O tipo de "<document>" não é permitido nesta fonte.` |
| `TOO_LARGE` | O documento passa de `maxBytes` | `[TOO_LARGE] "<document>" passa do limite de <maxBytes> bytes desta fonte.` |
| `NOT_TEXT` | O conteúdo não é UTF-8 válido ou parece binário | `[NOT_TEXT] "<document>" não é um documento de texto.` |
| `SOURCE_UNAVAILABLE` | Rede, serviço ou banco fora do ar, ou tempo esgotado | `[SOURCE_UNAVAILABLE] A fonte "<source>" está indisponível no momento.` |
| `AUTH_FAILED` | Credencial ausente, inválida ou sem permissão | `[AUTH_FAILED] A fonte "<source>" recusou a credencial (variável <NOME_DA_VARIÁVEL>).` |
| `READ_FAILED` | Outra falha ao ler (permissão do sistema de arquivos, disco) | `[READ_FAILED] Não foi possível ler "<document>" na fonte "<source>".` |

A tool sinaliza o erro **lançando** `KnowledgeReadError` com a mensagem da tabela. No pipeline do DSH, uma chamada que lança vira o resultado `Error: <mensagem>` para o modelo, sem detalhes extras. Por isso a mensagem precisa conter o código e bastar sozinha. Exemplo do que o modelo vê: `Error: [OUTSIDE_SCOPE] "../cordis.patch.yml" está fora do escopo autorizado da fonte "exemplo-manual". Nada foi lido.`

## 9. Exemplos

Os dois primeiros são os exemplos exigidos pela task #20. Usam o cliente `exemplo` e os documentos fictícios do repositório.

### (A) Leitura permitida

Chamada do modelo:

```json
{ "tool": "read_document", "input": { "source": "exemplo-manual", "document": "manual-do-estagiario.md" } }
```

Validação: o caminho é relativo, sem `..` nem `:`, fica dentro de `config/clients/exemplo/conhecimento/`, é arquivo regular `.md` com 933 bytes (abaixo de 1 MiB) e UTF-8 válido. Resultado para o modelo:

```
Manual do Estagiário — Cliente Exemplo (fonte: exemplo-manual, documento: manual-do-estagiario.md)
# Manual do Estagiário — Cliente Exemplo

Documento fictício usado para validar a base de conhecimento. Não descreve uma empresa real.

## Jornada e ponto eletrônico

A jornada do estagiário é de 6 horas diárias, 30 horas semanais. O ponto eletrônico é registrado no aplicativo Ponto Exemplo na entrada, na saída para o intervalo, no retorno e na saída final. Esquecimentos de marcação devem ser justificados ao mentor no mesmo dia pelo formulário de ajuste de ponto.

## Primeiro dia

No primeiro dia o estagiário recebe o crachá na recepção, participa da integração com o RH às 9h e é apresentado ao seu mentor, que acompanha o plano de estudos das primeiras quatro semanas.

## Acessos e equipamentos

O notebook é entregue pelo suporte de TI após a assinatura do termo de responsabilidade. Pedidos de acesso a sistemas são abertos no portal de chamados, categoria "Acessos", com aprovação do mentor.
```

Valor estruturado: `{ sourceId: "exemplo-manual", documentId: "manual-do-estagiario.md", title: "Manual do Estagiário — Cliente Exemplo", bytes: 933, truncated: false, content: "# Manual do Estagiário — …" }`.

### (B) Caminho fora da pasta autorizada

Chamada do modelo, tentando ler o patch do cliente, que está uma pasta acima de `conhecimento/`:

```json
{ "tool": "read_document", "input": { "source": "exemplo-manual", "document": "../cordis.patch.yml" } }
```

Validação: os passos 1 a 3 passam; no passo 4, a normalização resulta em `../cordis.patch.yml`, que começa com `../`. **Nenhum arquivo é aberto.** Resultado para o modelo (erro de tool):

```
Error: [OUTSIDE_SCOPE] "../cordis.patch.yml" está fora do escopo autorizado da fonte "exemplo-manual". Nada foi lido.
```

A mesma recusa vale para `conhecimento/../../cordis.patch.yml`, `..\\cordis.patch.yml` e para um link simbólico ou *junction* dentro de `conhecimento/` que aponte para fora (passo 5).

### (C) Fonte não autorizada

```json
{ "tool": "read_document", "input": { "source": "rh-drive", "document": "1AbC" } }
```

O cliente `exemplo` não tem a fonte `rh-drive` no patch. Resultado: `Error: [UNKNOWN_SOURCE] A fonte "rh-drive" não é uma fonte autorizada deste cliente.` Nenhum provider é chamado.

### (D) Item do Drive fora da pasta vinculada (ilustração de fonte remota)

Fonte `acme-drive` vinculada à pasta "Onboarding". O modelo pede um id de arquivo que existe no Drive, mas está em "Financeiro". O provider sobe pela cadeia de pais, não encontra "Onboarding" e responde `Error: [OUTSIDE_SCOPE] "<id>" está fora do escopo autorizado da fonte "acme-drive". Nada foi lido.` O arquivo não é baixado.

## 10. Plano de testes para a implementação

Para a task #41. Todos os testes usam **arquivos fictícios** criados em pasta temporária. Nenhum teste acessa dado pessoal, segredo real ou rede. Os padrões a seguir são:

- [`tests/unit/knowledge-registry.test.ts`](../../tests/unit/knowledge-registry.test.ts): registro sobre um `Context` real do Cordis, com fontes falsas;
- [`tests/unit/knowledge-fs.test.ts`](../../tests/unit/knowledge-fs.test.ts): provider de pasta;
- [`tests/unit/tool-knowledge.test.ts`](../../tests/unit/tool-knowledge.test.ts): tool no pipeline real de tools do DSH.

### 10.1 Provider de pasta local (`knowledge-fs.read`)

| # | Preparação | Entrada (`document`) | Esperado |
|---|---|---|---|
| L1 | `manual.md` na raiz | `manual.md` | Conteúdo completo; título do primeiro `#`; `truncated: false` |
| L2 | `sub/ponto.txt` | `sub/ponto.txt` e `sub\ponto.txt` | Os dois leem o mesmo arquivo; `documentId` normalizado `sub/ponto.txt` |
| L3 | `férias.md` (acento no nome) | `férias.md` | Lido |
| L4 | Arquivo maior que `maxChars` | o arquivo | `truncated: true`, conteúdo com `maxChars` caracteres |
| L5 | `sub/../manual.md` | `sub/../manual.md` | Lido (o `..` continua dentro da pasta) |
| L6 | — | `../fora.md` | `OUTSIDE_SCOPE`, sem leitura |
| L7 | — | caminho absoluto: `/etc/passwd` e `C:\Windows\win.ini` | `INVALID_DOCUMENT_ID` |
| L8 | — | `\\servidor\pasta\x.md` e `\\?\C:\x.md` | `INVALID_DOCUMENT_ID` |
| L9 | — | `manual.md:oculto` | `INVALID_DOCUMENT_ID` |
| L10 | — | `""` e um texto com `\0` | `INVALID_DOCUMENT_ID` |
| L11 | Link simbólico ou *junction* `atalho` → pasta fora do `root` | `atalho/segredo.md` | `OUTSIDE_SCOPE` |
| L12 | Subpasta `sub/` | `sub` | `NOT_A_DOCUMENT` |
| L13 | — | `nao-existe.md` | `NOT_FOUND` |
| L14 | `planilha.xlsx` | `planilha.xlsx` | `TYPE_NOT_ALLOWED` |
| L15 | `.md` acima de `maxBytes` | o arquivo | `TOO_LARGE`, sem ler o conteúdo |
| L16 | `.txt` com bytes inválidos em UTF-8 | o arquivo | `NOT_TEXT` |

### 10.2 Registro (`ctx.knowledge.read`)

| # | Situação | Esperado |
|---|---|---|
| R1 | Fonte inexistente | `UNKNOWN_SOURCE` |
| R2 | Fonte só de busca (sem `read`) | `SOURCE_NOT_READABLE`; `list()` mostra `readable: false` |
| R3 | Fonte falsa que lança erro de rede | `SOURCE_UNAVAILABLE`; outras fontes continuam respondendo |
| R4 | Provider descarregado | A fonte some do registro e a leitura vira `UNKNOWN_SOURCE` |

### 10.3 Tool no pipeline do DSH

| # | Situação | Esperado |
|---|---|---|
| T1 | Exemplo (A) | Texto com `(fonte: exemplo-manual, documento: manual-do-estagiario.md)` e o conteúdo |
| T2 | Exemplo (B) | Resultado `Error: [OUTSIDE_SCOPE] …`; nenhum arquivo aberto |
| T3 | Fonte fora de `sources` da tool | `Error: [UNKNOWN_SOURCE] …` |
| T4 | Mensagens de erro | Nenhuma contém o caminho absoluto do `root` (asserção explícita) |
| T5 | `document` ausente | Recusado pela validação de argumentos do DSH; o provider não é chamado |

### 10.4 Providers remotos (quando forem implementados)

Testes de contrato com *fakes* das APIs, sem rede: item dentro da pasta (lido); item fora (`OUTSIDE_SCOPE` sem download); atalho para fora (`OUTSIDE_SCOPE`); credencial ausente (`AUTH_FAILED` citando só o nome da variável); id fora do formato no banco (`INVALID_DOCUMENT_ID`); documento só fora dos filtros no vetorial (`NOT_FOUND`).

## 11. Riscos e limites

- **Injeção por documento.** O conteúdo lido é **dado, não instrução**. Um documento com "ignore as regras" não muda a política da persona. A persona tutora já diz para citar a fonte e nunca inventar regras; os testes adversariais ficam para a Frente C.
- **Janela entre checar e ler (pasta local).** Entre o `realpath` do passo 5 e a leitura, alguém com acesso à pasta poderia trocar um arquivo por um link. Mitigação: montar a pasta de conhecimento **somente leitura** no ambiente do cliente (mitigação 10 da escolha da base). A tool não escreve, então não piora o cenário.
- **Fontes remotas.** O conteúdo sai do ambiente do cliente e vai para o provedor de LLM configurado. Cada fonte remota precisa de aprovação do cliente, credencial com permissão mínima e saída sem token ou URL assinada.
- **Sem listagem.** O modelo só chega a documentos que a busca encontrou. Isso limita o que pode ser lido, mas exige que a busca da fonte cubra os documentos.
- **Tamanho.** `maxChars` limita o custo e o contexto. Documentos longos voltam truncados, e o modelo deve dizer isso ao estagiário.

## 12. Por que não reaproveitar o `dsh-tool-fs`

O DSH tem a tool `read` no pacote `@deepseek-ai/dsh-tool-fs`. Ela foi avaliada na versão instalada (0.2.2-rc.2) e não atende este caso:

| Ponto | `dsh-tool-fs` | `read_document` |
|---|---|---|
| Pacotes exigidos (peers) fora do kernel | 7: `dsh-fs`, `dsh-sandbox`, `dsh-sandbox-policy`, `dsh-user-approval`, `dsh-working-directory`, `dsh-attachment` e `dsh-error` | Nenhum: usa `tools` e `knowledge`, que já estão no kernel e na camada training |
| Base dos caminhos | Diretório de trabalho da sessão | Pasta da fonte, configurada pelo cliente |
| Confinamento da leitura | Depende do backend de sandbox, que segundo a avaliação da base não confina leitura (mitigação 10) | Validação própria, antes de ler (seção 4.1) |
| Escrita | `write`, `edit` e `apply_patch` no mesmo pacote, desligáveis por configuração | Não existe |
| Fontes remotas | Não | Mesmo contrato para Drive, OneDrive, banco de documentos e vetorial |

A tool própria segue o padrão do [`@agentor/tool-knowledge`](../../packages/knowledge/tool-knowledge/src/index.ts) (`defineTool` do `@deepseek-ai/dsh-tools`, `inject: ['tools', 'knowledge']`). Ela entra por inclusão, como o resto do kernel.
