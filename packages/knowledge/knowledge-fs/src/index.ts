/**
 * Provider de conhecimento em sistema de arquivos.
 *
 * Lê uma pasta de documentos texto (Markdown, TXT) de um cliente e responde
 * buscas por palavras-chave com a seção mais relevante de cada documento.
 * É o provider de referência: fontes reais de clientes (Confluence, Drive,
 * banco de dados, MCP) entram como outros pacotes `@agentor/knowledge-*`
 * registrando-se no mesmo `ctx.knowledge`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { KnowledgeHit, KnowledgeQuery, KnowledgeSource } from '@agentor/knowledge'

export const name = 'agentor-knowledge-fs'
export const inject = ['knowledge']

export interface Config {
  id: string
  description: string
  root: string
  extensions: string[]
  maxExcerptChars: number
}

export const Config: z<Config> = z.object({
  id: z.string().required().description('Id único da fonte na composição.'),
  description: z.string().default('Documentos locais do cliente').description('Descrição mostrada ao modelo.'),
  root: z.string().required().description('Pasta com os documentos. Caminho relativo resolve a partir do diretório de execução.'),
  extensions: z.array(z.string()).default(['.md', '.markdown', '.txt']).description('Extensões lidas.'),
  maxExcerptChars: z.natural().default(800).description('Tamanho máximo de cada trecho.'),
})

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'sem', 'que', 'e', 'ou', 'se', 'como', 'qual', 'quais', 'quando', 'onde',
  'eu', 'voce', 'ele', 'ela', 'meu', 'minha', 'seu', 'sua', 'ao', 'aos', 'the', 'and', 'of', 'to',
  'is', 'how', 'what', 'funciona', 'sobre',
])

/** Normaliza para comparação: minúsculas e sem acentos. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Termos significativos de uma consulta. */
export function terms(text: string): string[] {
  const words = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(words.filter(word => word.length >= 3 && !STOPWORDS.has(word)))]
}

/**
 * Pontua um trecho em 0..1: 90% pela fração de termos da consulta presentes,
 * 10% por repetição desses termos (desempata trechos igualmente cobertos).
 */
export function scoreChunk(chunk: string, queryTerms: readonly string[]): number {
  if (queryTerms.length === 0) return 0
  const haystack = normalize(chunk)
  let matched = 0
  let occurrences = 0
  for (const term of queryTerms) {
    const count = haystack.split(term).length - 1
    if (count > 0) {
      matched++
      occurrences += count
    }
  }
  if (matched === 0) return 0
  const coverage = matched / queryTerms.length
  const repetition = Math.min(1, (occurrences - matched) / (3 * queryTerms.length))
  return 0.9 * coverage + 0.1 * repetition
}

const HEADING_ONLY = /^(#{1,6}\s[^\n]*\s*)+$/

/**
 * Divide um documento em trechos: cada seção Markdown (título + corpo) é um
 * trecho; texto sem títulos é dividido por parágrafos. Uma seção que só tem
 * título (ex.: o `# Título` do documento) é anexada à seção seguinte, para
 * nunca devolver um trecho sem conteúdo.
 */
export function chunksOf(content: string): string[] {
  const sections = content.split(/\n(?=#{1,6}\s)/)
  const raw = (sections.length > 1 ? sections : content.split(/\n\s*\n/))
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0)
  const chunks: string[] = []
  let pending = ''
  for (const chunk of raw) {
    const merged = pending ? `${pending}\n\n${chunk}` : chunk
    if (HEADING_ONLY.test(chunk)) pending = merged
    else {
      chunks.push(merged)
      pending = ''
    }
  }
  if (pending) chunks.push(pending)
  return chunks
}

/** Primeiro título Markdown do documento, ou o caminho relativo. */
function titleOf(content: string, fallback: string): string {
  const heading = content.match(/^#{1,6}\s+(.+)$/m)
  return heading?.[1]?.trim() ?? fallback
}

function excerpt(chunk: string, max: number): string {
  const flat = chunk.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

async function listFiles(root: string, extensions: ReadonlySet<string>): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && extensions.has(extname(entry.name).toLowerCase()))
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
}

/** Cria a fonte sem depender de Cordis (usado também nos testes unitários). */
export function createFsSource(config: Config): KnowledgeSource {
  const root = resolve(config.root)
  const extensions = new Set(config.extensions.map(ext => ext.toLowerCase()))
  return {
    id: config.id,
    description: config.description,
    async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
      const queryTerms = terms(query.text)
      if (queryTerms.length === 0) return []
      const hits: KnowledgeHit[] = []
      for (const file of await listFiles(root, extensions)) {
        query.signal?.throwIfAborted()
        const content = await readFile(file, 'utf8')
        const documentId = relative(root, file)
        let best: { chunk: string, score: number } | undefined
        for (const chunk of chunksOf(content)) {
          const score = scoreChunk(chunk, queryTerms)
          if (score > 0 && (best === undefined || score > best.score)) best = { chunk, score }
        }
        if (best !== undefined) {
          hits.push({
            sourceId: config.id,
            documentId,
            title: titleOf(content, documentId),
            excerpt: excerpt(best.chunk, config.maxExcerptChars),
            score: best.score,
          })
        }
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, query.limit)
    },
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.knowledge.register(createFsSource(config))
}
