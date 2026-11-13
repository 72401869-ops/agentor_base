/**
 * Adaptador LLM offline e determinístico.
 *
 * Serve para validar a composição sem chave nem rede: no primeiro passo ele
 * chama `knowledge_search` com o texto do usuário; no segundo, devolve o
 * resultado da tool como resposta final. Assim o smoke test exercita o ciclo
 * completo (agent-loop → tools → ctx.knowledge → provider → sessão).
 *
 * Não é um modelo: nunca use em produção.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  LlmAdapter,
  ToolCallId,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type RequestMessage,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'

export const name = 'agentor-llm-offline'
export const inject = ['llm']

export interface Config {
  provider: string
  toolName: string
}

export const Config: z<Config> = z.object({
  provider: z.string().default('offline').description('Nome da rota de provider registrada.'),
  toolName: z.string().default('knowledge_search').description('Tool chamada no primeiro passo.'),
})

export const ANSWER_PREFIX = 'Resposta offline (sem LLM real) baseada na base de conhecimento:'

function textOf(message: RequestMessage | undefined): string {
  if (message === undefined) return ''
  return message.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

export class OfflineAdapter extends LlmAdapter {
  private readonly toolName: string

  constructor(toolName: string) {
    super()
    this.toolName = toolName
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: `${model} (offline)` }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    if (last?.role === 'tool') {
      const reply = `${ANSWER_PREFIX}\n${textOf(last)}`
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: reply }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
      yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const question = textOf([...options.messages].reverse().find(message => message.role === 'user'))
    const id = ToolCallId('offline-call-1')
    const args = JSON.stringify({ query: question })
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name: this.toolName, argumentsDelta: args }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: this.toolName, arguments: args } }
    yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter([config.provider], new OfflineAdapter(config.toolName))
}
