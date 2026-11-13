/**
 * Definição do seam de conhecimento (`ctx.knowledge`).
 *
 * Cada cliente traz suas próprias fontes de dados. Este serviço não sabe ler
 * nenhuma delas: ele é um registro em que plugins provider (filesystem, HTTP,
 * MCP, banco de dados...) registram fontes, e consumidores (a tool
 * `knowledge_search`, futuras trilhas e avaliações) pesquisam todas de uma vez.
 *
 * Papéis do seam: definição = este pacote; providers = `@agentor/knowledge-*`;
 * consumidores = `@agentor/tool-knowledge` e afins.
 */
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    knowledge: KnowledgeRegistry
  }
}

/** Um trecho de documento devolvido por uma fonte. */
export interface KnowledgeHit {
  /** Id da fonte que produziu o trecho. */
  sourceId: string
  /** Identificador estável do documento dentro da fonte (ex.: caminho relativo). */
  documentId: string
  /** Título legível do documento. */
  title: string
  /** Trecho relevante, já cortado para caber no contexto do modelo. */
  excerpt: string
  /** Relevância relativa; maior é melhor. Fontes diferentes devem usar escala 0..1. */
  score: number
}

/** Consulta repassada a cada fonte. */
export interface KnowledgeQuery {
  text: string
  /** Máximo de trechos por fonte. */
  limit: number
  signal?: AbortSignal
}

/** Contrato que todo provider implementa. */
export interface KnowledgeSource {
  /** Id único na composição (ex.: `cliente-x-manual`). */
  id: string
  /** Descrição curta mostrada ao modelo e em diagnósticos. */
  description: string
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>
}

/** Resumo público de uma fonte registrada. */
export interface KnowledgeSourceInfo {
  id: string
  description: string
}

/** Falha isolada de uma fonte; as demais continuam respondendo. */
export interface KnowledgeSourceFailure {
  sourceId: string
  message: string
}

export interface KnowledgeSearchResult {
  hits: KnowledgeHit[]
  failures: KnowledgeSourceFailure[]
}

export interface KnowledgeSearchOptions {
  /** Máximo total de trechos devolvidos (padrão 5). */
  limit?: number
  /** Restringe a busca a estas fontes. */
  sources?: readonly string[]
  signal?: AbortSignal
}

export const DEFAULT_LIMIT = 5

/** Registro de fontes de conhecimento, exposto como `ctx.knowledge`. */
export class KnowledgeRegistry extends Service {
  private readonly sources = new Map<string, KnowledgeSource>()

  constructor(ctx: Context) {
    super(ctx, 'knowledge')
  }

  /**
   * Registra uma fonte. O registro pertence ao plugin chamador e é desfeito
   * automaticamente quando ele descarrega.
   * @returns disposer que remove a fonte antes disso, se necessário.
   */
  register(source: KnowledgeSource): () => void {
    const sources = this.sources
    const dispose = this.ctx.effect(function* () {
      if (!source.id) throw new Error('knowledge: uma fonte precisa de id')
      if (sources.has(source.id)) throw new Error(`knowledge: a fonte "${source.id}" já está registrada`)
      sources.set(source.id, source)
      yield () => {
        if (sources.get(source.id) === source) sources.delete(source.id)
      }
    }, 'knowledge.register()')
    return () => void dispose()
  }

  /** Fontes registradas, em ordem de registro. */
  list(): KnowledgeSourceInfo[] {
    return [...this.sources.values()].map(({ id, description }) => ({ id, description }))
  }

  /**
   * Pesquisa todas as fontes (ou as selecionadas) em paralelo. Uma fonte que
   * falha vira um item em `failures` em vez de derrubar a busca inteira.
   */
  async search(text: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeSearchResult> {
    const limit = options.limit ?? DEFAULT_LIMIT
    const wanted = options.sources === undefined ? undefined : new Set(options.sources)
    const selected = [...this.sources.values()].filter(source => wanted === undefined || wanted.has(source.id))
    const settled = await Promise.allSettled(
      selected.map(source => source.search({ text, limit, signal: options.signal })),
    )
    const hits: KnowledgeHit[] = []
    const failures: KnowledgeSourceFailure[] = []
    settled.forEach((outcome, index) => {
      const sourceId = selected[index]!.id
      if (outcome.status === 'fulfilled') hits.push(...outcome.value)
      else failures.push({ sourceId, message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) })
    })
    hits.sort((a, b) => b.score - a.score)
    return { hits: hits.slice(0, limit), failures }
  }
}

export default KnowledgeRegistry
