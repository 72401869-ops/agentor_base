/**
 * Consumidor do seam de conhecimento: a tool `knowledge_search`.
 *
 * O modelo usa esta tool para responder ao estagiário com base nos documentos
 * do cliente, citando a fonte, em vez de responder de memória.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type { KnowledgeSearchResult } from '@agentor/knowledge'

export const name = 'agentor-tool-knowledge'
export const inject = ['tools', 'knowledge']

export interface Config {
  maxResults: number
}

export const Config: z<Config> = z.object({
  maxResults: z.natural().default(5).description('Máximo de trechos devolvidos ao modelo por chamada.'),
})

export const TOOL_NAME = 'knowledge_search'

/** Texto que o modelo recebe: um bloco por trecho, com a origem explícita. */
export function renderResult(result: KnowledgeSearchResult): string {
  const lines: string[] = []
  if (result.hits.length === 0) lines.push('Nenhum trecho encontrado na base de conhecimento do cliente.')
  result.hits.forEach((hit, index) => {
    lines.push(`[${index + 1}] ${hit.title} (fonte: ${hit.sourceId}, documento: ${hit.documentId})`)
    lines.push(hit.excerpt)
  })
  for (const failure of result.failures) lines.push(`Aviso: a fonte ${failure.sourceId} falhou: ${failure.message}`)
  return lines.join('\n')
}

export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: [
      'Pesquisa a base de conhecimento do cliente (manuais, processos, políticas internas).',
      'Use antes de responder dúvidas do estagiário sobre a empresa e cite o documento de origem.',
      'Se nada for encontrado, diga isso em vez de inventar.',
    ].join(' '),
    parameters: {
      query: { type: 'string', required: true, description: 'Pergunta ou palavras-chave a pesquisar.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await ctx.knowledge.search(args.query, { limit: config.maxResults, signal: exec.signal })
      return renderResult(result)
    },
  }))
}
