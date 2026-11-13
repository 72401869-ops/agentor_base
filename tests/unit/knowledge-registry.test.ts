import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import KnowledgeRegistry, { type KnowledgeHit, type KnowledgeSource } from '@agentor/knowledge'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function boot(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(KnowledgeRegistry)
  return ctx
}

function fixed(id: string, hits: Array<Omit<KnowledgeHit, 'sourceId'>>): KnowledgeSource {
  return { id, description: `fonte ${id}`, search: async ({ limit }) => hits.slice(0, limit).map(hit => ({ ...hit, sourceId: id })) }
}

const hit = (documentId: string, score: number) => ({ documentId, title: documentId, excerpt: documentId, score })

/** Plugin de teste que registra fontes, como faria um provider real. */
function providerPlugin(...sources: KnowledgeSource[]) {
  return Object.assign((ctx: Context) => { for (const source of sources) ctx.knowledge.register(source) }, { inject: ['knowledge'] })
}

describe('ctx.knowledge', () => {
  it('junta os resultados de todas as fontes, ordena por relevância e aplica o limite', async () => {
    const ctx = await boot()
    await ctx.plugin(providerPlugin(fixed('a', [hit('a1', 0.2), hit('a2', 0.9)]), fixed('b', [hit('b1', 0.5)])))
    assert.deepEqual(ctx.knowledge.list().map(source => source.id), ['a', 'b'])
    const result = await ctx.knowledge.search('qualquer', { limit: 2 })
    assert.deepEqual(result.hits.map(h => h.documentId), ['a2', 'b1'])
    assert.deepEqual(result.failures, [])
  })

  it('filtra por fonte quando pedido', async () => {
    const ctx = await boot()
    await ctx.plugin(providerPlugin(fixed('a', [hit('a1', 0.2)]), fixed('b', [hit('b1', 0.5)])))
    const result = await ctx.knowledge.search('x', { sources: ['a'] })
    assert.deepEqual(result.hits.map(h => h.sourceId), ['a'])
  })

  it('isola a falha de uma fonte sem perder as outras', async () => {
    const ctx = await boot()
    const broken: KnowledgeSource = { id: 'quebrada', description: 'x', search: async () => { throw new Error('timeout no conector') } }
    await ctx.plugin(providerPlugin(broken, fixed('ok', [hit('ok1', 0.4)])))
    const result = await ctx.knowledge.search('x')
    assert.deepEqual(result.hits.map(h => h.documentId), ['ok1'])
    assert.deepEqual(result.failures, [{ sourceId: 'quebrada', message: 'timeout no conector' }])
  })

  it('remove a fonte quando o plugin provider é descarregado', async () => {
    const ctx = await boot()
    const fiber = ctx.plugin(providerPlugin(fixed('temporaria', [hit('t1', 1)])))
    await fiber
    assert.deepEqual(ctx.knowledge.list().map(source => source.id), ['temporaria'])
    await fiber.dispose()
    assert.deepEqual(ctx.knowledge.list(), [])
  })

  it('recusa ids duplicados', async () => {
    const ctx = await boot()
    ctx.knowledge.register(fixed('dup', []))
    assert.throws(() => ctx.knowledge.register(fixed('dup', [])), /já está registrada/)
  })
})
